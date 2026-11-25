import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { db } from '../src/db';
import { initRealtime } from '../src/realtime/io';
import { bearer, makeAppointment, makeUser, setupCommsFixtures } from './comms.helpers';

process.env.CALL_RING_TIMEOUT_MS = '400';

let server: http.Server;
let baseUrl: string;
let app: ReturnType<typeof createApp>;
let f: ReturnType<typeof setupCommsFixtures>;
const sockets: Socket[] = [];

function open(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(baseUrl, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function next<T = any>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function invite(socket: Socket, payload: Record<string, unknown>): Promise<{ callId?: number; error?: string }> {
  return socket.timeout(3000).emitWithAck('call:invite', payload);
}

const callRow = (id: number) =>
  db.prepare('SELECT * FROM calls WHERE id = ?').get(id) as {
    status: string;
    answered_at: string | null;
    ended_at: string | null;
    duration_sec: number | null;
    appointment_id: number | null;
  };

const lastCallMessage = (callId: number) =>
  (db.prepare("SELECT * FROM messages WHERE kind = 'call' ORDER BY id DESC").all() as { body: string; meta: string }[]).find(
    (m) => JSON.parse(m.meta).callId === callId,
  );

beforeAll(async () => {
  f = setupCommsFixtures();
  app = createApp();
  server = http.createServer(app);
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('socket authentication', () => {
  it('rejects connections without a valid token', async () => {
    await expect(open('not-a-token')).rejects.toThrow();
  });
});

describe('video call signaling', () => {
  it('runs a full call: invite → incoming → accept → signal relay → end', async () => {
    const appointmentId = makeAppointment(f.student.id, f.doctor.id, 'APT-CALL01');
    const doctor = await open(f.doctor.token);
    const student = await open(f.student.token);

    const incoming = next(student, 'call:incoming');
    const ringing = next(doctor, 'call:ringing');
    const ack = await invite(doctor, { toUserId: f.student.id, appointmentId });
    expect(ack.error).toBeUndefined();
    const callId = ack.callId!;
    expect(callId).toBeGreaterThan(0);

    const inc = await incoming;
    expect(inc.callId).toBe(callId);
    expect(inc.caller.id).toBe(f.doctor.id);
    expect(inc.caller.name).toBe('Dr. Test Physician');
    expect(inc.appointmentCode).toBe('APT-CALL01');
    expect((await ringing).callee.id).toBe(f.student.id);
    expect(callRow(callId).status).toBe('ringing');

    const doctorAccepted = next(doctor, 'call:accepted');
    const studentAccepted = next(student, 'call:accepted');
    student.emit('call:accept', { callId });
    expect((await doctorAccepted).callId).toBe(callId);
    expect((await studentAccepted).callId).toBe(callId);
    expect(callRow(callId).status).toBe('active');
    expect(callRow(callId).answered_at).not.toBeNull();

    const offerAtStudent = next(student, 'call:signal');
    doctor.emit('call:signal', { callId, data: { type: 'offer', sdp: 'v=0 offer' } });
    expect((await offerAtStudent).data).toEqual({ type: 'offer', sdp: 'v=0 offer' });

    const answerAtDoctor = next(doctor, 'call:signal');
    student.emit('call:signal', { callId, data: { type: 'answer', sdp: 'v=0 answer' } });
    expect((await answerAtDoctor).data.type).toBe('answer');

    const candidateAtDoctor = next(doctor, 'call:signal');
    student.emit('call:signal', { callId, data: { type: 'candidate', candidate: { candidate: 'c1' } } });
    expect((await candidateAtDoctor).data.type).toBe('candidate');

    const endedAtStudent = next(student, 'call:ended');
    const callMessage = next(student, 'message:new');
    doctor.emit('call:end', { callId });
    expect(await endedAtStudent).toEqual({ callId, reason: 'hangup' });
    const chip = await callMessage;
    expect(chip.kind).toBe('call');
    expect(chip.meta.callStatus).toBe('completed');
    expect(chip.body).toMatch(/^Video call · /);

    const row = callRow(callId);
    expect(row.status).toBe('completed');
    expect(row.duration_sec).not.toBeNull();
    expect(row.appointment_id).toBe(appointmentId);
    const activity = db.prepare("SELECT * FROM activity_logs WHERE action = 'call.completed'").all() as {
      description: string;
    }[];
    expect(activity.length).toBe(1);
    expect(activity[0].description).toContain('APT-CALL01');

    // Call history is visible over REST.
    const logs = await request(app).get('/api/calls').set(bearer(f.student.token));
    expect(logs.body[0].status).toBe('completed');

    doctor.disconnect();
    student.disconnect();
  });

  it('logs a missed call when the callee is offline', async () => {
    const student = await open(f.student.token);
    const unavailable = next(student, 'call:unavailable');
    const ack = await invite(student, { toUserId: f.doctor2.id });
    expect(ack).toEqual({ error: 'offline' });
    const evt = await unavailable;
    expect(evt.reason).toBe('offline');
    expect(callRow(evt.callId).status).toBe('missed');
    expect(lastCallMessage(evt.callId)?.body).toBe('Missed video call');
    const note = db
      .prepare("SELECT * FROM notifications WHERE user_id = ? AND type = 'call' ORDER BY id DESC")
      .get(f.doctor2.id) as { title: string };
    expect(note.title).toBe('Missed video call from Riya Sharma');
    student.disconnect();
  });

  it('handles decline, cancel, busy and forbidden pairs', async () => {
    const student = await open(f.student.token);
    const doctor = await open(f.doctor.token);

    // Decline
    const incoming = next(doctor, 'call:incoming');
    const declined = next(student, 'call:declined');
    const { callId } = await invite(student, { toUserId: f.doctor.id });
    await incoming;
    doctor.emit('call:decline', { callId });
    expect((await declined).callId).toBe(callId);
    expect(callRow(callId!).status).toBe('declined');
    expect(lastCallMessage(callId!)?.body).toBe('Declined video call');

    // Cancel before answer
    const incoming2 = next(doctor, 'call:incoming');
    const second = await invite(student, { toUserId: f.doctor.id });
    await incoming2;
    const endedAtDoctor = next(doctor, 'call:ended');
    student.emit('call:cancel', { callId: second.callId });
    expect((await endedAtDoctor).reason).toBe('cancelled');
    expect(callRow(second.callId!).status).toBe('cancelled');

    // Busy: doctor is ringing with student, second student tries to call the doctor.
    const student2 = await open(f.student2.token);
    const ringing = next(doctor, 'call:incoming');
    const third = await invite(student, { toUserId: f.doctor.id });
    await ringing;
    const busy = await invite(student2, { toUserId: f.doctor.id });
    expect(busy).toEqual({ error: 'busy' });
    student.emit('call:cancel', { callId: third.callId });

    // Forbidden: student → student, and an appointment that is not theirs.
    expect(await invite(student, { toUserId: f.student2.id })).toEqual({ error: 'forbidden' });
    const otherAppt = makeAppointment(f.student2.id, f.doctor.id, 'APT-OTHER1');
    expect(await invite(student, { toUserId: f.doctor.id, appointmentId: otherAppt })).toEqual({ error: 'forbidden' });

    student.disconnect();
    student2.disconnect();
    doctor.disconnect();
  });

  it('marks unanswered calls as missed after the ring timeout', async () => {
    const student = await open(f.student.token);
    const doctor = await open(f.doctor.token);
    const endedAtCaller = next(student, 'call:ended', 4000);
    const { callId } = await invite(student, { toUserId: f.doctor.id });
    expect(await endedAtCaller).toEqual({ callId, reason: 'timeout' });
    expect(callRow(callId!).status).toBe('missed');
    student.disconnect();
    doctor.disconnect();
  });

  it('ends an active call when a participant disconnects', async () => {
    const student = await open(f.student.token);
    const doctor = await open(f.doctor.token);
    const incoming = next(doctor, 'call:incoming');
    const accepted = next(student, 'call:accepted');
    const { callId } = await invite(student, { toUserId: f.doctor.id });
    await incoming;
    doctor.emit('call:accept', { callId });
    await accepted;
    const ended = next(student, 'call:ended');
    doctor.disconnect();
    expect(await ended).toEqual({ callId, reason: 'disconnected' });
    expect(callRow(callId!).status).toBe('completed');
    student.disconnect();
  });

  it('stops ringing on other tabs when the call is answered elsewhere', async () => {
    const student = await open(f.student.token);
    const doctorTab1 = await open(f.doctor.token);
    const doctorTab2 = await open(f.doctor.token);
    const inc1 = next(doctorTab1, 'call:incoming');
    const inc2 = next(doctorTab2, 'call:incoming');
    const { callId } = await invite(student, { toUserId: f.doctor.id });
    await Promise.all([inc1, inc2]);
    const elsewhere = next(doctorTab2, 'call:ended');
    doctorTab1.emit('call:accept', { callId });
    expect(await elsewhere).toEqual({ callId, reason: 'answered_elsewhere' });
    const ended = next(doctorTab1, 'call:ended');
    student.emit('call:end', { callId });
    expect((await ended).reason).toBe('hangup');
    student.disconnect();
    doctorTab1.disconnect();
    doctorTab2.disconnect();
  });
});

describe('realtime chat', () => {
  it('pushes new messages and typing indicators to the other participant', async () => {
    const pupil = makeUser('student', 'Meera Nair');
    const student = await open(pupil.token);
    const doctor = await open(f.doctor.token);

    const created = await request(app)
      .post('/api/conversations')
      .set(bearer(pupil.token))
      .send({ participantId: f.doctor.id });
    const conversationId = created.body.id as number;
    expect(created.body.otherParty.online).toBe(true);

    const typing = next(doctor, 'typing');
    student.emit('typing', { conversationId, isTyping: true });
    expect(await typing).toEqual({ conversationId, userId: pupil.id, isTyping: true });

    const pushed = next(doctor, 'message:new');
    await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(bearer(pupil.token))
      .send({ body: 'Is the OPD open on Sunday?' })
      .expect(201);
    const msg = await pushed;
    expect(msg.body).toBe('Is the OPD open on Sunday?');
    expect(msg.conversationId).toBe(conversationId);

    // Doctor was online → no "new message" notification.
    const notes = db
      .prepare("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'message' AND body = ?")
      .get(f.doctor.id, 'Is the OPD open on Sunday?') as { c: number };
    expect(notes.c).toBe(0);

    const read = next(student, 'message:read');
    await request(app).patch(`/api/conversations/${conversationId}/read`).set(bearer(f.doctor.token)).expect(200);
    expect((await read).readerId).toBe(f.doctor.id);

    student.disconnect();
    doctor.disconnect();
  });
});
