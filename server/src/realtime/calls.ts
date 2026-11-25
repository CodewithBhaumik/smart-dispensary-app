/**
 * WebRTC call signaling over Socket.IO (student ↔ doctor only).
 *
 * Flow: caller `call:invite` (ack {callId}) → callee tabs get `call:incoming`
 *       → callee `call:accept` → both get `call:accepted` → caller sends the SDP offer
 *       via `call:signal`, callee answers, ICE candidates are relayed both ways
 *       → either side `call:end` → both get `call:ended`.
 * Every finished call updates its `calls` row and posts a call summary message
 * ("Video call · 4m 12s", "Missed video call", …) into the pair's conversation.
 */
import type { Server, Socket } from 'socket.io';
import { CALL_RING_TIMEOUT_MS } from '@shared/constants';
import { db } from '../db';
import { nowIso } from '../lib/time';
import type { SessionUser } from '../middleware/auth';
import { logActivity } from '../services/activity';
import { callMessageBody, finishCallRow, formatCallDuration, insertCallRow, markCallAnswered } from '../services/calls';
import {
  findOrCreateConversation,
  getConversationRow,
  insertCallMessage,
  messagesLink,
  studentDoctorPair,
} from '../services/chat';
import { getUserRow, userMiniFromRow } from '../services/minis';
import { notify } from '../services/notify';
import { emitInvalidate, isOnline } from './io';

export type CallEndReason =
  | 'hangup'
  | 'timeout'
  | 'cancelled'
  | 'declined'
  | 'disconnected'
  | 'answered_elsewhere';

type FinalStatus = 'completed' | 'missed' | 'declined' | 'cancelled';

interface LiveCall {
  id: number;
  callerId: number;
  calleeId: number;
  callerName: string;
  calleeName: string;
  calleeRole: string;
  callerSocketId: string;
  calleeSocketId: string | null;
  appointmentId: number | null;
  appointmentCode: string | null;
  conversationId: number;
  status: 'ringing' | 'active';
  answeredAt: string | null;
  ringTimer: ReturnType<typeof setTimeout> | null;
}

const liveCalls = new Map<number, LiveCall>();
/** userId → callId of the call they are currently ringing/talking in. */
const userInCall = new Map<number, number>();
let ioRef: Server | null = null;

function ringTimeoutMs(): number {
  const override = Number(process.env.CALL_RING_TIMEOUT_MS);
  return Number.isFinite(override) && override > 0 ? override : CALL_RING_TIMEOUT_MS;
}

function emitToSocket(socketId: string | null, event: string, payload: unknown): void {
  if (socketId && ioRef) ioRef.to(socketId).emit(event, payload);
}

function emitToUserRoom(userId: number, event: string, payload: unknown, exceptSocketId?: string): void {
  if (!ioRef) return;
  const room = ioRef.to(`user:${userId}`);
  (exceptSocketId ? room.except(exceptSocketId) : room).emit(event, payload);
}

function callIdOf(payload: unknown): number {
  return Number((payload as { callId?: unknown } | null | undefined)?.callId);
}

interface Outcome {
  callId: number;
  callerId: number;
  calleeId: number;
  callerName: string;
  calleeName: string;
  calleeRole: string;
  conversationId: number;
  appointmentCode: string | null;
  status: FinalStatus;
  durationSec: number | null;
}

/** Chat summary message, missed-call notification, activity log and cache invalidation. */
function recordOutcome(o: Outcome): void {
  const conv = getConversationRow(o.conversationId);
  if (conv) {
    insertCallMessage(conv, o.callerId, callMessageBody(o.status, o.durationSec), {
      callStatus: o.status,
      ...(o.durationSec !== null ? { durationSec: o.durationSec } : {}),
      callId: o.callId,
    });
  }
  if (o.status === 'missed') {
    notify(o.calleeId, {
      type: 'call',
      title: `Missed video call from ${o.callerName}`,
      body: o.appointmentCode
        ? `${o.callerName} tried to reach you for appointment ${o.appointmentCode}.`
        : `${o.callerName} tried to reach you by video call.`,
      link: messagesLink(o.calleeRole, o.conversationId),
    });
  }
  if (o.status === 'completed') {
    logActivity({
      actorId: o.callerId,
      action: 'call.completed',
      category: 'call',
      description: `${o.callerName} completed a ${formatCallDuration(o.durationSec ?? 0)} video call with ${o.calleeName}${
        o.appointmentCode ? ` (appointment ${o.appointmentCode})` : ''
      }.`,
      entityType: 'call',
      entityId: o.callId,
    });
  }
  emitInvalidate(['conversations', 'messages', 'calls'], [o.callerId, o.calleeId]);
}

/** Removes a live call from the registry and persists its final state. */
function finalize(call: LiveCall, status: FinalStatus): void {
  if (call.ringTimer) clearTimeout(call.ringTimer);
  call.ringTimer = null;
  liveCalls.delete(call.id);
  if (userInCall.get(call.callerId) === call.id) userInCall.delete(call.callerId);
  if (userInCall.get(call.calleeId) === call.id) userInCall.delete(call.calleeId);

  const endedAt = nowIso();
  const durationSec =
    status === 'completed' && call.answeredAt
      ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(call.answeredAt)) / 1000))
      : null;
  finishCallRow(call.id, status, endedAt, durationSec);
  recordOutcome({
    callId: call.id,
    callerId: call.callerId,
    calleeId: call.calleeId,
    callerName: call.callerName,
    calleeName: call.calleeName,
    calleeRole: call.calleeRole,
    conversationId: call.conversationId,
    appointmentCode: call.appointmentCode,
    status,
    durationSec,
  });
}

function endActiveCall(call: LiveCall, reason: CallEndReason): void {
  finalize(call, 'completed');
  emitToSocket(call.callerSocketId, 'call:ended', { callId: call.id, reason });
  emitToSocket(call.calleeSocketId, 'call:ended', { callId: call.id, reason });
}

function cancelRingingCall(call: LiveCall): void {
  finalize(call, 'cancelled');
  emitToUserRoom(call.calleeId, 'call:ended', { callId: call.id, reason: 'cancelled' });
  emitToSocket(call.callerSocketId, 'call:ended', { callId: call.id, reason: 'cancelled' });
}

function declineRingingCall(call: LiveCall): void {
  finalize(call, 'declined');
  emitToSocket(call.callerSocketId, 'call:declined', { callId: call.id });
  emitToUserRoom(call.calleeId, 'call:ended', { callId: call.id, reason: 'declined' });
}

export function registerCallHandlers(io: Server, socket: Socket): void {
  ioRef = io;
  const me = socket.data.user as SessionUser;

  socket.on('call:invite', (payload: unknown, ack?: (res: unknown) => void) => {
    const reply = (res: unknown) => {
      if (typeof ack === 'function') ack(res);
    };
    const unavailable = (reason: 'offline' | 'busy' | 'forbidden', extra: Record<string, unknown> = {}) => {
      socket.emit('call:unavailable', { reason, ...extra });
      reply({ error: reason });
    };

    const { toUserId, appointmentId } = (payload ?? {}) as { toUserId?: unknown; appointmentId?: unknown };
    const calleeId = Number(toUserId);
    const caller = getUserRow(me.id);
    const callee = Number.isInteger(calleeId) && calleeId > 0 ? getUserRow(calleeId) : null;
    if (!caller || !callee || !callee.is_active) return unavailable('forbidden');
    const pair = studentDoctorPair(me, callee);
    if (!pair) return unavailable('forbidden');

    let apptId: number | null = null;
    let appointmentCode: string | null = null;
    if (appointmentId !== undefined && appointmentId !== null) {
      apptId = Number(appointmentId);
      const appt = Number.isInteger(apptId)
        ? (db.prepare('SELECT code, student_id, doctor_id FROM appointments WHERE id = ?').get(apptId) as
            | { code: string; student_id: number; doctor_id: number }
            | undefined)
        : undefined;
      if (!appt || appt.student_id !== pair.studentId || appt.doctor_id !== pair.doctorId) {
        return unavailable('forbidden');
      }
      appointmentCode = appt.code;
    }

    if (userInCall.has(me.id) || userInCall.has(calleeId)) return unavailable('busy');

    const { row: conv } = findOrCreateConversation(pair.studentId, pair.doctorId);
    const startedAt = nowIso();

    if (!isOnline(calleeId)) {
      const callId = insertCallRow({
        conversationId: conv.id,
        appointmentId: apptId,
        callerId: me.id,
        calleeId,
        status: 'missed',
        startedAt,
        endedAt: startedAt,
      });
      recordOutcome({
        callId,
        callerId: me.id,
        calleeId,
        callerName: caller.name,
        calleeName: callee.name,
        calleeRole: callee.role,
        conversationId: conv.id,
        appointmentCode,
        status: 'missed',
        durationSec: null,
      });
      return unavailable('offline', { callId });
    }

    const callId = insertCallRow({
      conversationId: conv.id,
      appointmentId: apptId,
      callerId: me.id,
      calleeId,
      status: 'ringing',
      startedAt,
    });
    const call: LiveCall = {
      id: callId,
      callerId: me.id,
      calleeId,
      callerName: caller.name,
      calleeName: callee.name,
      calleeRole: callee.role,
      callerSocketId: socket.id,
      calleeSocketId: null,
      appointmentId: apptId,
      appointmentCode,
      conversationId: conv.id,
      status: 'ringing',
      answeredAt: null,
      ringTimer: null,
    };
    call.ringTimer = setTimeout(() => {
      const live = liveCalls.get(callId);
      if (!live || live.status !== 'ringing') return;
      finalize(live, 'missed');
      emitToSocket(live.callerSocketId, 'call:ended', { callId, reason: 'timeout' });
      emitToUserRoom(live.calleeId, 'call:ended', { callId, reason: 'timeout' });
    }, ringTimeoutMs());
    call.ringTimer.unref?.();
    liveCalls.set(callId, call);
    userInCall.set(me.id, callId);
    userInCall.set(calleeId, callId);

    emitToUserRoom(calleeId, 'call:incoming', {
      callId,
      caller: userMiniFromRow(caller),
      appointmentId: apptId,
      appointmentCode,
    });
    socket.emit('call:ringing', { callId, callee: userMiniFromRow(callee) });
    reply({ callId });
  });

  socket.on('call:accept', (payload: unknown) => {
    const callId = callIdOf(payload);
    const call = liveCalls.get(callId);
    if (!call) {
      socket.emit('call:ended', { callId, reason: 'cancelled' });
      return;
    }
    if (call.calleeId !== me.id) return;
    if (call.status !== 'ringing') {
      socket.emit('call:ended', { callId, reason: 'answered_elsewhere' });
      return;
    }
    if (call.ringTimer) clearTimeout(call.ringTimer);
    call.ringTimer = null;
    call.status = 'active';
    call.answeredAt = nowIso();
    call.calleeSocketId = socket.id;
    markCallAnswered(call.id, call.answeredAt);
    emitToSocket(call.callerSocketId, 'call:accepted', { callId });
    socket.emit('call:accepted', { callId });
    // Stop the ringing on the callee's other tabs.
    emitToUserRoom(call.calleeId, 'call:ended', { callId, reason: 'answered_elsewhere' }, socket.id);
  });

  socket.on('call:decline', (payload: unknown) => {
    const call = liveCalls.get(callIdOf(payload));
    if (!call || call.calleeId !== me.id || call.status !== 'ringing') return;
    declineRingingCall(call);
  });

  socket.on('call:cancel', (payload: unknown) => {
    const call = liveCalls.get(callIdOf(payload));
    if (!call || call.callerId !== me.id) return;
    if (call.status === 'ringing') cancelRingingCall(call);
    else endActiveCall(call, 'hangup');
  });

  socket.on('call:end', (payload: unknown) => {
    const call = liveCalls.get(callIdOf(payload));
    if (!call || (call.callerId !== me.id && call.calleeId !== me.id)) return;
    if (call.status === 'ringing') {
      if (call.callerId === me.id) cancelRingingCall(call);
      else declineRingingCall(call);
      return;
    }
    endActiveCall(call, 'hangup');
  });

  socket.on('call:signal', (payload: unknown) => {
    const { data } = (payload ?? {}) as { data?: unknown };
    const call = liveCalls.get(callIdOf(payload));
    if (!call || call.status !== 'active' || !data || typeof data !== 'object') return;
    if (socket.id === call.callerSocketId) {
      emitToSocket(call.calleeSocketId, 'call:signal', { callId: call.id, data });
    } else if (socket.id === call.calleeSocketId) {
      emitToSocket(call.callerSocketId, 'call:signal', { callId: call.id, data });
    }
  });

  socket.on('disconnect', () => {
    for (const call of [...liveCalls.values()]) {
      if (call.callerSocketId === socket.id) {
        if (call.status === 'ringing') cancelRingingCall(call);
        else {
          finalize(call, 'completed');
          emitToSocket(call.calleeSocketId, 'call:ended', { callId: call.id, reason: 'disconnected' });
        }
      } else if (call.calleeSocketId === socket.id) {
        finalize(call, 'completed');
        emitToSocket(call.callerSocketId, 'call:ended', { callId: call.id, reason: 'disconnected' });
      }
    }
  });
}
