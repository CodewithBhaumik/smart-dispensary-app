/**
 * Chat between a student and a doctor: conversations, messages, read receipts.
 * Realtime fan-out happens through realtime/io.ts helpers.
 */
import type { CallStatus, MessageKind } from '@shared/constants';
import type { ChatMessage, Conversation, UserMini } from '@shared/types';
import { db } from '../db';
import { forbidden, notFound } from '../lib/errors';
import { parseJson, toJson } from '../lib/json';
import { nowIso } from '../lib/time';
import { emitInvalidate, emitToUser, isOnline } from '../realtime/io';
import type { SessionUser } from '../middleware/auth';
import { getDoctorProfileRow, getStudentProfileRow, getUserRow, userMiniFromRow } from './minis';
import { notify } from './notify';

export interface ConversationRow {
  id: number;
  student_id: number;
  doctor_id: number;
  created_at: string;
  last_message_at: string;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  kind: MessageKind;
  body: string;
  meta: string | null;
  created_at: string;
  read_at: string | null;
}

export interface CallMessageMeta {
  callStatus?: CallStatus;
  durationSec?: number;
  callId?: number;
}

const DEPARTMENT_SHORT: Record<string, string> = {
  'Computer Science & Engineering': 'CSE',
  'Electronics & Communication': 'ECE',
  'Electrical Engineering': 'EE',
  'Mechanical Engineering': 'ME',
  'Civil Engineering': 'CE',
  'Chemical Engineering': 'CHE',
  Biotechnology: 'BT',
  'Electronics & Instrumentation': 'EIC',
  'Mathematics & Computing': 'MnC',
  'Management (MBA)': 'MBA',
};

export function departmentShort(department: string): string {
  if (DEPARTMENT_SHORT[department]) return DEPARTMENT_SHORT[department];
  const initials = department
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== '&' && w.toLowerCase() !== 'and' && w.toLowerCase() !== 'of')
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return initials || department;
}

/** One-line description shown under a participant's name in the chat UI. */
export function participantSubtitle(userId: number): string | null {
  const user = getUserRow(userId);
  if (!user) return null;
  if (user.role === 'doctor') {
    return getDoctorProfileRow(userId)?.specialty ?? user.title;
  }
  if (user.role === 'student') {
    const p = getStudentProfileRow(userId);
    if (!p) return user.title;
    return `${p.program} ${departmentShort(p.department)} · Year ${p.year}`;
  }
  return user.title;
}

export function toChatMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: row.kind,
    body: row.body,
    meta: parseJson<CallMessageMeta | null>(row.meta, null),
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export function getConversationRow(id: number): ConversationRow | null {
  return (db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined) ?? null;
}

export function isParticipant(conv: ConversationRow, userId: number): boolean {
  return conv.student_id === userId || conv.doctor_id === userId;
}

export function otherParticipantId(conv: ConversationRow, userId: number): number {
  return conv.student_id === userId ? conv.doctor_id : conv.student_id;
}

/** Loads a conversation the user takes part in (404 if missing, 403 if not a participant). */
export function requireConversation(id: number, userId: number): ConversationRow {
  const conv = getConversationRow(id);
  if (!conv) throw notFound('Conversation');
  if (!isParticipant(conv, userId)) throw forbidden('You are not part of this conversation.');
  return conv;
}

export function findOrCreateConversation(
  studentId: number,
  doctorId: number,
): { row: ConversationRow; created: boolean } {
  const existing = db
    .prepare('SELECT * FROM conversations WHERE student_id = ? AND doctor_id = ?')
    .get(studentId, doctorId) as ConversationRow | undefined;
  if (existing) return { row: existing, created: false };
  const now = nowIso();
  const info = db
    .prepare('INSERT INTO conversations (student_id, doctor_id, created_at, last_message_at) VALUES (?, ?, ?, ?)')
    .run(studentId, doctorId, now, now);
  return { row: getConversationRow(Number(info.lastInsertRowid))!, created: true };
}

/**
 * Resolves the (student, doctor) pair for two users, or null when the pair is not
 * a student + doctor combination.
 */
export function studentDoctorPair(
  a: { id: number; role: string },
  b: { id: number; role: string },
): { studentId: number; doctorId: number } | null {
  if (a.role === 'student' && b.role === 'doctor') return { studentId: a.id, doctorId: b.id };
  if (a.role === 'doctor' && b.role === 'student') return { studentId: b.id, doctorId: a.id };
  return null;
}

function miniOrPlaceholder(id: number): UserMini {
  const row = getUserRow(id);
  if (row) return userMiniFromRow(row);
  return { id, name: 'Unknown user', role: 'student', avatarColor: '#64748b', title: null };
}

export function toConversation(row: ConversationRow, viewerId: number): Conversation {
  const student = miniOrPlaceholder(row.student_id);
  const doctor = miniOrPlaceholder(row.doctor_id);
  const other = viewerId === row.student_id ? doctor : student;
  const last = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1')
    .get(row.id) as MessageRow | undefined;
  const unread = db
    .prepare(
      `SELECT COUNT(*) AS c FROM messages
        WHERE conversation_id = ? AND sender_id IS NOT NULL AND sender_id <> ? AND read_at IS NULL`,
    )
    .get(row.id, viewerId) as { c: number };
  return {
    id: row.id,
    student,
    doctor,
    otherParty: { ...other, online: isOnline(other.id), subtitle: participantSubtitle(other.id) },
    lastMessage: last ? toChatMessage(last) : null,
    unreadCount: unread.c,
    updatedAt: row.last_message_at,
  };
}

export function listConversations(user: SessionUser): Conversation[] {
  const column = user.role === 'doctor' ? 'doctor_id' : 'student_id';
  const rows = db
    .prepare(`SELECT * FROM conversations WHERE ${column} = ? ORDER BY last_message_at DESC, id DESC`)
    .all(user.id) as ConversationRow[];
  return rows.map((r) => toConversation(r, user.id));
}

export function listMessages(conversationId: number, opts: { before?: number; limit: number }): ChatMessage[] {
  const rows = (
    opts.before
      ? db
          .prepare('SELECT * FROM messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT ?')
          .all(conversationId, opts.before, opts.limit)
      : db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?').all(conversationId, opts.limit)
  ) as MessageRow[];
  return rows.reverse().map(toChatMessage);
}

function insertMessage(
  conv: ConversationRow,
  senderId: number | null,
  kind: MessageKind,
  body: string,
  meta: CallMessageMeta | null,
): ChatMessage {
  const now = nowIso();
  const info = db
    .prepare(
      'INSERT INTO messages (conversation_id, sender_id, kind, body, meta, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, NULL)',
    )
    .run(conv.id, senderId, kind, body, meta ? toJson(meta) : null, now);
  db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(now, conv.id);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(info.lastInsertRowid)) as MessageRow;
  return toChatMessage(row);
}

function messagesLink(role: string, conversationId: number): string {
  return role === 'doctor' ? `/doctor/messages?c=${conversationId}` : `/student/messages?c=${conversationId}`;
}

/** Sends a text message, pushes it live and notifies the recipient when they are offline. */
export function sendMessage(conv: ConversationRow, sender: SessionUser, body: string): ChatMessage {
  const message = insertMessage(conv, sender.id, 'text', body, null);
  const recipientId = otherParticipantId(conv, sender.id);
  emitToUser([conv.student_id, conv.doctor_id], 'message:new', message);
  if (!isOnline(recipientId)) {
    const recipient = getUserRow(recipientId);
    const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;
    notify(recipientId, {
      type: 'message',
      title: `New message from ${sender.name}`,
      body: preview,
      link: messagesLink(recipient?.role ?? 'student', conv.id),
    });
  }
  emitInvalidate(['conversations'], [conv.student_id, conv.doctor_id]);
  return message;
}

/** Inserts a `kind: 'call'` message (call summary chip) and pushes it to both participants. */
export function insertCallMessage(
  conv: ConversationRow,
  callerId: number,
  body: string,
  meta: CallMessageMeta,
): ChatMessage {
  const message = insertMessage(conv, callerId, 'call', body, meta);
  emitToUser([conv.student_id, conv.doctor_id], 'message:new', message);
  return message;
}

/** Marks the other participant's messages as read. Returns the number of updated messages. */
export function markConversationRead(conv: ConversationRow, readerId: number): number {
  const readAt = nowIso();
  const info = db
    .prepare(
      `UPDATE messages SET read_at = ?
        WHERE conversation_id = ? AND sender_id IS NOT NULL AND sender_id <> ? AND read_at IS NULL`,
    )
    .run(readAt, conv.id, readerId);
  if (info.changes > 0) {
    emitToUser([conv.student_id, conv.doctor_id], 'message:read', {
      conversationId: conv.id,
      readerId,
      readAt,
    });
    emitInvalidate(['conversations'], [conv.student_id, conv.doctor_id]);
  }
  return info.changes;
}

export { messagesLink };
