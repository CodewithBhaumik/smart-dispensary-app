/** Video call logs (the live signaling state lives in realtime/calls.ts). */
import type { CallStatus } from '@shared/constants';
import type { CallLog } from '@shared/types';
import { db } from '../db';

export interface CallRow {
  id: number;
  conversation_id: number | null;
  appointment_id: number | null;
  caller_id: number;
  callee_id: number;
  status: CallStatus;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
}

export function toCallLog(row: CallRow): CallLog {
  return {
    id: row.id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    appointmentId: row.appointment_id,
    status: row.status,
    startedAt: row.started_at,
    answeredAt: row.answered_at,
    endedAt: row.ended_at,
    durationSec: row.duration_sec,
  };
}

export function insertCallRow(input: {
  conversationId: number | null;
  appointmentId: number | null;
  callerId: number;
  calleeId: number;
  status: CallStatus;
  startedAt: string;
  endedAt?: string | null;
}): number {
  const info = db
    .prepare(
      `INSERT INTO calls (conversation_id, appointment_id, caller_id, callee_id, status, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.conversationId,
      input.appointmentId,
      input.callerId,
      input.calleeId,
      input.status,
      input.startedAt,
      input.endedAt ?? null,
    );
  return Number(info.lastInsertRowid);
}

export function markCallAnswered(id: number, answeredAt: string): void {
  db.prepare("UPDATE calls SET status = 'active', answered_at = ? WHERE id = ?").run(answeredAt, id);
}

export function finishCallRow(id: number, status: CallStatus, endedAt: string, durationSec: number | null): void {
  db.prepare('UPDATE calls SET status = ?, ended_at = ?, duration_sec = ? WHERE id = ?').run(
    status,
    endedAt,
    durationSec,
    id,
  );
}

export function getCallRow(id: number): CallRow | null {
  return (db.prepare('SELECT * FROM calls WHERE id = ?').get(id) as CallRow | undefined) ?? null;
}

export function listCallLogs(userId: number, limit: number): CallLog[] {
  const rows = db
    .prepare(
      `SELECT * FROM calls WHERE caller_id = ? OR callee_id = ?
        ORDER BY started_at DESC, id DESC LIMIT ?`,
    )
    .all(userId, userId, limit) as CallRow[];
  return rows.map(toCallLog);
}

/** "42s", "4m 12s", "1h 03m". */
export function formatCallDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function callMessageBody(status: CallStatus, durationSec: number | null): string {
  switch (status) {
    case 'completed':
      return `Video call · ${formatCallDuration(durationSec ?? 0)}`;
    case 'missed':
      return 'Missed video call';
    case 'declined':
      return 'Declined video call';
    case 'cancelled':
      return 'Cancelled video call';
    default:
      return 'Video call';
  }
}
