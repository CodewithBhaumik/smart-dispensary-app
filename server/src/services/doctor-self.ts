/** Doctor self-service: weekly OPD schedule, accepting toggle, leave days. */
import { z } from 'zod';
import { ACTIVE_APPOINTMENT_STATUSES, APPOINTMENT_MODES, type AppointmentMode } from '@shared/constants';
import type { DoctorLeave, ScheduleBlock } from '@shared/types';
import { db, tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';
import { bool, parseJson, toJson } from '../lib/json';
import { todayStr, toMinutes } from '../lib/time';
import { zDate, zOptionalText } from '../lib/validate';
import type { SessionUser } from '../middleware/auth';
import { emitInvalidate } from '../realtime/io';
import { logActivity } from './activity';
import { fmtDate } from './core-format';
import { getLeaves, getSchedule } from './doctors';
import { getDoctorProfileRow } from './minis';
import { replaceSchedule, scheduleBlockSchema } from './users';

const ACTIVE_LIST = ACTIVE_APPOINTMENT_STATUSES.map((s) => `'${s}'`).join(',');
const KEYS = ['doctors', 'doctor', 'slots', 'availability', 'schedule', 'dashboard'];

export const scheduleUpdateSchema = z.object({
  slotMinutes: z.coerce
    .number()
    .int()
    .refine((v) => [10, 15, 20, 30].includes(v), 'Slot length must be 10, 15, 20 or 30 minutes.'),
  consultationModes: z.array(z.enum(APPOINTMENT_MODES)).min(1, 'Offer at least one consultation mode.'),
  schedule: z.array(scheduleBlockSchema).max(40),
});

export const acceptingSchema = z.object({ isAccepting: z.boolean() });
export const leaveSchema = z.object({ date: zDate, reason: zOptionalText(200) });

export interface ScheduleState {
  slotMinutes: number;
  isAccepting: boolean;
  consultationModes: AppointmentMode[];
  schedule: ScheduleBlock[];
  leaves: DoctorLeave[];
}

export function getScheduleState(doctorId: number): ScheduleState {
  const p = getDoctorProfileRow(doctorId);
  if (!p) throw notFound('Doctor');
  return {
    slotMinutes: p.slot_minutes,
    isAccepting: bool(p.is_accepting),
    consultationModes: parseJson<AppointmentMode[]>(p.consultation_modes, ['in_person']),
    schedule: getSchedule(doctorId),
    leaves: getLeaves(doctorId, todayStr()),
  };
}

export function updateSchedule(user: SessionUser, input: z.output<typeof scheduleUpdateSchema>): ScheduleState {
  for (const block of input.schedule) {
    if (toMinutes(block.endTime) - toMinutes(block.startTime) < input.slotMinutes) {
      throw badRequest(`Each session must be at least ${input.slotMinutes} minutes long.`, { schedule: 'Session too short.' });
    }
  }
  tx(() => {
    replaceSchedule(user.id, input.schedule);
    db.prepare('UPDATE doctor_profiles SET slot_minutes = ?, consultation_modes = ? WHERE user_id = ?').run(
      input.slotMinutes,
      toJson(input.consultationModes),
      user.id,
    );
  });
  logActivity({
    actorId: user.id,
    action: 'availability.updated',
    category: 'appointment',
    description: `${user.name} updated their weekly OPD schedule`,
    entityType: 'user',
    entityId: user.id,
  });
  emitInvalidate(KEYS);
  return getScheduleState(user.id);
}

export function setAccepting(user: SessionUser, isAccepting: boolean): { isAccepting: boolean } {
  db.prepare('UPDATE doctor_profiles SET is_accepting = ? WHERE user_id = ?').run(isAccepting ? 1 : 0, user.id);
  logActivity({
    actorId: user.id,
    action: 'availability.updated',
    category: 'appointment',
    description: `${user.name} ${isAccepting ? 'resumed accepting' : 'paused'} new appointments`,
    entityType: 'user',
    entityId: user.id,
  });
  emitInvalidate(KEYS);
  return { isAccepting };
}

export function addLeave(user: SessionUser, input: z.output<typeof leaveSchema>): DoctorLeave {
  if (input.date < todayStr()) throw badRequest('Leave can only be marked for today or a future date.', { date: 'Past date.' });
  if (db.prepare('SELECT 1 FROM doctor_leaves WHERE doctor_id = ? AND date = ?').get(user.id, input.date)) {
    throw conflict('LEAVE_EXISTS', `You are already on leave on ${fmtDate(input.date)}.`);
  }
  const booked = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM appointments WHERE doctor_id = ? AND date = ? AND status IN (${ACTIVE_LIST})`)
      .get(user.id, input.date) as { c: number }
  ).c;
  if (booked > 0) {
    throw conflict(
      'HAS_APPOINTMENTS',
      `You have ${booked} appointment${booked === 1 ? '' : 's'} on ${fmtDate(input.date)}. Cancel or reschedule ${
        booked === 1 ? 'it' : 'them'
      } first.`,
    );
  }
  const info = db
    .prepare('INSERT INTO doctor_leaves (doctor_id, date, reason) VALUES (?, ?, ?)')
    .run(user.id, input.date, input.reason);
  logActivity({
    actorId: user.id,
    action: 'availability.updated',
    category: 'appointment',
    description: `${user.name} marked leave on ${fmtDate(input.date)}`,
    entityType: 'user',
    entityId: user.id,
  });
  emitInvalidate(KEYS);
  return { id: Number(info.lastInsertRowid), date: input.date, reason: input.reason };
}

export function removeLeave(user: SessionUser, leaveId: number): void {
  const row = db.prepare('SELECT id, date FROM doctor_leaves WHERE id = ? AND doctor_id = ?').get(leaveId, user.id) as
    | { id: number; date: string }
    | undefined;
  if (!row) throw notFound('Leave');
  db.prepare('DELETE FROM doctor_leaves WHERE id = ?').run(leaveId);
  logActivity({
    actorId: user.id,
    action: 'availability.updated',
    category: 'appointment',
    description: `${user.name} cancelled their leave on ${fmtDate(row.date)}`,
    entityType: 'user',
    entityId: user.id,
  });
  emitInvalidate(KEYS);
}
