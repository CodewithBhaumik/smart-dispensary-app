/**
 * Doctors directory, weekly schedules, leaves and slot generation.
 */
import { ACTIVE_APPOINTMENT_STATUSES, BOOKING_WINDOW_DAYS } from '@shared/constants';
import type { DayAvailability, DoctorDetail, DoctorLeave, DoctorListItem, ScheduleBlock, Slot } from '@shared/types';
import { db } from '../db';
import { notFound } from '../lib/errors';
import { addDaysStr, currentTime, fromMinutes, todayStr, toMinutes, weekdayOf } from '../lib/time';
import {
  doctorProfileFromRow,
  getDoctorProfileRow,
  getUserRow,
  userMiniFromRow,
  type DoctorProfileRow,
  type UserRow,
} from './minis';

const ACTIVE_LIST = ACTIVE_APPOINTMENT_STATUSES.map((s) => `'${s}'`).join(',');

interface ScheduleRow {
  id: number;
  doctor_id: number;
  weekday: number;
  start_time: string;
  end_time: string;
}

export function getSchedule(doctorId: number): ScheduleBlock[] {
  const rows = db
    .prepare('SELECT * FROM doctor_schedules WHERE doctor_id = ? ORDER BY weekday, start_time')
    .all(doctorId) as ScheduleRow[];
  return rows.map((r) => ({ id: r.id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time }));
}

export function getLeaves(doctorId: number, fromDate?: string): DoctorLeave[] {
  const rows = (
    fromDate
      ? db
          .prepare('SELECT id, date, reason FROM doctor_leaves WHERE doctor_id = ? AND date >= ? ORDER BY date')
          .all(doctorId, fromDate)
      : db.prepare('SELECT id, date, reason FROM doctor_leaves WHERE doctor_id = ? ORDER BY date').all(doctorId)
  ) as { id: number; date: string; reason: string | null }[];
  return rows.map((r) => ({ id: r.id, date: r.date, reason: r.reason }));
}

export function isOnLeave(doctorId: number, date: string): boolean {
  return !!db.prepare('SELECT 1 FROM doctor_leaves WHERE doctor_id = ? AND date = ?').get(doctorId, date);
}

/** Slot start/end times generated from the doctor's weekly schedule for a date. */
export function generateSlotTimes(doctorId: number, date: string, slotMinutes: number): { time: string; endTime: string }[] {
  const weekday = weekdayOf(date);
  const blocks = db
    .prepare('SELECT start_time, end_time FROM doctor_schedules WHERE doctor_id = ? AND weekday = ? ORDER BY start_time')
    .all(doctorId, weekday) as { start_time: string; end_time: string }[];
  const out: { time: string; endTime: string }[] = [];
  const seen = new Set<string>();
  for (const b of blocks) {
    const end = toMinutes(b.end_time);
    for (let t = toMinutes(b.start_time); t + slotMinutes <= end; t += slotMinutes) {
      const time = fromMinutes(t);
      if (seen.has(time)) continue;
      seen.add(time);
      out.push({ time, endTime: fromMinutes(t + slotMinutes) });
    }
  }
  return out.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);

export interface SlotOptions {
  /** Marks slots overlapping this student's other active appointments as `own_conflict`. */
  studentId?: number;
  /** Ignore this appointment when checking conflicts (used for rescheduling). */
  excludeAppointmentId?: number;
}

export function getSlots(doctorId: number, date: string, opts: SlotOptions = {}): Slot[] {
  const profile = getDoctorProfileRow(doctorId);
  if (!profile) return [];
  const times = generateSlotTimes(doctorId, date, profile.slot_minutes);
  if (times.length === 0) return [];

  const today = todayStr();
  const nowMin = toMinutes(currentTime());
  const onLeave = isOnLeave(doctorId, date);
  const exclude = opts.excludeAppointmentId ?? -1;

  const booked = db
    .prepare(
      `SELECT start_time, end_time FROM appointments
        WHERE doctor_id = ? AND date = ? AND status <> 'cancelled' AND id <> ?`,
    )
    .all(doctorId, date, exclude) as { start_time: string; end_time: string }[];

  const own = opts.studentId
    ? (db
        .prepare(
          `SELECT start_time, end_time FROM appointments
            WHERE student_id = ? AND date = ? AND status IN (${ACTIVE_LIST}) AND id <> ?`,
        )
        .all(opts.studentId, date, exclude) as { start_time: string; end_time: string }[])
    : [];

  return times.map(({ time, endTime }) => {
    let reason: Slot['reason'] = null;
    if (onLeave) reason = 'leave';
    else if (date < today || (date === today && toMinutes(time) <= nowMin)) reason = 'past';
    else if (booked.some((b) => overlaps(time, endTime, b.start_time, b.end_time))) reason = 'booked';
    else if (own.some((o) => overlaps(time, endTime, o.start_time, o.end_time))) reason = 'own_conflict';
    return { time, endTime, available: reason === null, reason };
  });
}

export function getAvailability(doctorId: number, days: number, studentId?: number): DayAvailability[] {
  const today = todayStr();
  const out: DayAvailability[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysStr(today, i);
    const slots = getSlots(doctorId, date, { studentId });
    out.push({
      date,
      weekday: weekdayOf(date),
      totalSlots: slots.length,
      freeSlots: slots.filter((s) => s.available).length,
      onLeave: isOnLeave(doctorId, date),
    });
  }
  return out;
}

export function findNextAvailable(doctorId: number): { date: string; time: string } | null {
  const today = todayStr();
  for (let i = 0; i <= BOOKING_WINDOW_DAYS; i++) {
    const date = addDaysStr(today, i);
    const slot = getSlots(doctorId, date).find((s) => s.available);
    if (slot) return { date, time: slot.time };
  }
  return null;
}

function patientsSeen(doctorId: number): number {
  const row = db
    .prepare(`SELECT COUNT(DISTINCT student_id) AS c FROM consultations WHERE doctor_id = ? AND status = 'completed'`)
    .get(doctorId) as { c: number };
  return row.c;
}

function completedConsultations(doctorId: number): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM consultations WHERE doctor_id = ? AND status = 'completed'`)
    .get(doctorId) as { c: number };
  return row.c;
}

export function toDoctorListItem(user: UserRow, profileRow: DoctorProfileRow): DoctorListItem {
  const profile = doctorProfileFromRow(profileRow);
  const todaySlots = getSlots(user.id, todayStr());
  return {
    ...userMiniFromRow(user),
    specialty: profile.specialty,
    qualifications: profile.qualifications,
    room: profile.room,
    email: user.email,
    phone: user.phone,
    experienceYears: profile.experienceYears,
    bio: profile.bio,
    languages: profile.languages,
    isAccepting: profile.isAccepting,
    isVisiting: profile.isVisiting,
    consultationModes: profile.consultationModes,
    slotMinutes: profile.slotMinutes,
    nextAvailable: profile.isAccepting ? findNextAvailable(user.id) : null,
    todayFreeSlots: todaySlots.filter((s) => s.available).length,
    patientsSeen: patientsSeen(user.id),
    schedule: getSchedule(user.id),
  };
}

export interface DoctorListQuery {
  search?: string;
  specialty?: string;
  availableToday?: boolean;
}

export function listDoctors(query: DoctorListQuery = {}): DoctorListItem[] {
  const where: string[] = [`u.role = 'doctor'`, 'u.is_active = 1'];
  const params: unknown[] = [];
  if (query.search) {
    where.push('(u.name LIKE ? OR p.specialty LIKE ? OR p.qualifications LIKE ? OR u.title LIKE ?)');
    const like = `%${query.search}%`;
    params.push(like, like, like, like);
  }
  if (query.specialty) {
    where.push('p.specialty = ? COLLATE NOCASE');
    params.push(query.specialty);
  }
  const rows = db
    .prepare(
      `SELECT u.*, p.user_id, p.specialty, p.qualifications, p.experience_years, p.bio, p.languages, p.room,
              p.slot_minutes, p.is_accepting, p.is_visiting, p.consultation_modes
         FROM users u JOIN doctor_profiles p ON p.user_id = u.id
        WHERE ${where.join(' AND ')}
        ORDER BY p.is_visiting ASC, u.id ASC`,
    )
    .all(...params) as (UserRow & DoctorProfileRow)[];
  let items = rows.map((r) => toDoctorListItem(r, r));
  if (query.availableToday) items = items.filter((d) => d.isAccepting && d.todayFreeSlots > 0);
  return items;
}

export function listSpecialties(): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT p.specialty FROM doctor_profiles p JOIN users u ON u.id = p.user_id
        WHERE u.is_active = 1 ORDER BY p.specialty`,
    )
    .all() as { specialty: string }[];
  return rows.map((r) => r.specialty);
}

/** Loads an active doctor or throws 404. */
export function requireDoctor(id: number): { user: UserRow; profile: DoctorProfileRow } {
  const user = getUserRow(id);
  const profile = user && user.role === 'doctor' ? getDoctorProfileRow(id) : null;
  if (!user || !profile) throw notFound('Doctor');
  return { user, profile };
}

export function getDoctorDetail(id: number): DoctorDetail {
  const { user, profile } = requireDoctor(id);
  return {
    ...toDoctorListItem(user, profile),
    leaves: getLeaves(id, todayStr()),
    completedConsultations: completedConsultations(id),
  };
}
