/**
 * Appointment lifecycle: booking (with conflict prevention), rescheduling, cancellation,
 * check-in with queue tokens, consultation start / draft / completion.
 */
import { z } from 'zod';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  APPOINTMENT_MODE_LABELS,
  APPOINTMENT_MODES,
  APPOINTMENT_STATUSES,
  BOOKING_WINDOW_DAYS,
  type AppointmentMode,
  type AppointmentStatus,
  type Role,
} from '@shared/constants';
import type { Appointment, AppointmentDetail, Consultation, DoctorMini, StudentMini } from '@shared/types';
import { db, tx } from '../db';
import { generateCode } from '../lib/codes';
import { AppError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { currentTime, daysBetween, isValidDateStr, nowIso, todayStr, toMinutes } from '../lib/time';
import { zDate, zId, zOptionalText, zTime } from '../lib/validate';
import type { SessionUser } from '../middleware/auth';
import { emitInvalidate } from '../realtime/io';
import { logActivity } from './activity';
import {
  consultationInputSchema,
  ensureDraftConsultation,
  getConsultationByAppointment,
  getConsultationRowByAppointment,
  toConsultation,
  writeConsultationFields,
} from './consultations';
import { fmtDate, fmtSlot, fmtTime } from './core-format';
import { generateSlotTimes, isOnLeave, requireDoctor } from './doctors';
import { getDoctorMini, getPatientSummary, getStudentMini, getUserRow } from './minis';
import { notify } from './notify';
import {
  announcePrescription,
  getPrescriptionByAppointment,
  insertPrescription,
  prescriptionItemSchema,
  resolvePrescriptionItems,
} from './prescriptions';
import { insertVisitSummary } from './records';
import { addStatusEvent, getTimeline } from './status-events';

const ACTIVE_LIST = ACTIVE_APPOINTMENT_STATUSES.map((s) => `'${s}'`).join(',');

/** Keys refreshed in open clients after any appointment change. */
const APPOINTMENT_KEYS = [
  'appointments',
  'appointment',
  'dashboard',
  'slots',
  'availability',
  'doctors',
  'doctor',
  'patients',
  'patient',
];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
export const bookSchema = z.object({
  doctorId: zId,
  date: zDate,
  startTime: zTime,
  mode: z.enum(APPOINTMENT_MODES).default('in_person'),
  reason: z.string().trim().min(2, 'Choose a reason for your visit.').max(120),
  notes: zOptionalText(1000),
});

export const rescheduleSchema = z.object({ date: zDate, startTime: zTime });
export const cancelSchema = z.object({ reason: zOptionalText(300) });
export const checkInByCodeSchema = z.object({
  code: z.string().trim().min(3, 'Enter the appointment code.').max(20),
});

export const completeSchema = z.object({
  consultation: consultationInputSchema,
  prescription: z
    .object({
      notes: zOptionalText(1000),
      items: z.array(prescriptionItemSchema).max(15).default([]),
    })
    .optional()
    .nullable(),
});

export const listQuerySchema = z.object({
  scope: z.enum(['upcoming', 'past', 'today', 'all']).optional().default('all'),
  status: z.string().optional(),
  search: z.string().trim().max(100).optional(),
  date: zDate.optional(),
  doctorId: zId.optional(),
  studentId: zId.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(300),
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------
export interface AppointmentRow {
  id: number;
  code: string;
  student_id: number;
  doctor_id: number;
  date: string;
  start_time: string;
  end_time: string;
  mode: AppointmentMode;
  reason: string;
  notes: string | null;
  status: AppointmentStatus;
  token_no: number | null;
  checked_in_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancelled_by_role: Role | null;
  rescheduled_count: number;
  created_at: string;
  updated_at: string;
  consultation_id?: number | null;
  prescription_id?: number | null;
}

const BASE_SELECT = `
  SELECT a.*, c.id AS consultation_id, p.id AS prescription_id
    FROM appointments a
    LEFT JOIN consultations c ON c.appointment_id = a.id
    LEFT JOIN prescriptions p ON p.appointment_id = a.id`;

export interface MiniCache {
  students: Map<number, StudentMini>;
  doctors: Map<number, DoctorMini>;
}
export const newMiniCache = (): MiniCache => ({ students: new Map(), doctors: new Map() });

export function toAppointment(row: AppointmentRow, cache: MiniCache = newMiniCache()): Appointment {
  let student = cache.students.get(row.student_id);
  if (!student) {
    student = getStudentMini(row.student_id);
    cache.students.set(row.student_id, student);
  }
  let doctor = cache.doctors.get(row.doctor_id);
  if (!doctor) {
    doctor = getDoctorMini(row.doctor_id);
    cache.doctors.set(row.doctor_id, doctor);
  }
  return {
    id: row.id,
    code: row.code,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    mode: row.mode,
    reason: row.reason,
    notes: row.notes,
    status: row.status,
    tokenNo: row.token_no,
    checkedInAt: row.checked_in_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    cancelledByRole: row.cancelled_by_role,
    rescheduledCount: row.rescheduled_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    student,
    doctor,
    consultationId: row.consultation_id ?? null,
    prescriptionId: row.prescription_id ?? null,
  };
}

export function getAppointmentRow(id: number): AppointmentRow {
  const row = db.prepare(`${BASE_SELECT} WHERE a.id = ?`).get(id) as AppointmentRow | undefined;
  if (!row) throw notFound('Appointment');
  return row;
}

export function getAppointment(id: number): Appointment {
  return toAppointment(getAppointmentRow(id));
}

/** Appointments matching a raw WHERE clause (used by dashboards). */
export function queryAppointments(whereSql: string, params: unknown[], orderSql: string, limit = 500): Appointment[] {
  const rows = db
    .prepare(`${BASE_SELECT} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ?`)
    .all(...params, limit) as AppointmentRow[];
  const cache = newMiniCache();
  return rows.map((r) => toAppointment(r, cache));
}

export function canViewAppointment(user: SessionUser, row: AppointmentRow): boolean {
  if (user.role === 'student') return row.student_id === user.id;
  if (user.role === 'doctor') return row.doctor_id === user.id;
  return true; // staff & admin
}

export function getAppointmentDetail(id: number): AppointmentDetail {
  const row = getAppointmentRow(id);
  return {
    ...toAppointment(row),
    consultation: getConsultationByAppointment(id),
    prescription: getPrescriptionByAppointment(id),
    patient: getPatientSummary(row.student_id),
    timeline: getTimeline('appointment', id),
  };
}

export function getAppointmentDetailForUser(user: SessionUser, id: number): AppointmentDetail {
  const row = getAppointmentRow(id);
  if (!canViewAppointment(user, row)) throw notFound('Appointment');
  return getAppointmentDetail(id);
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
export function listAppointments(user: SessionUser, q: z.output<typeof listQuerySchema>): Appointment[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const today = todayStr();

  if (user.role === 'student') {
    where.push('a.student_id = ?');
    params.push(user.id);
  } else if (user.role === 'doctor') {
    where.push('a.doctor_id = ?');
    params.push(user.id);
  }
  if (q.doctorId) {
    where.push('a.doctor_id = ?');
    params.push(q.doctorId);
  }
  if (q.studentId) {
    where.push('a.student_id = ?');
    params.push(q.studentId);
  }

  let order = 'a.date DESC, a.start_time DESC';
  switch (q.scope) {
    case 'upcoming':
      where.push(`a.date >= ? AND a.status IN (${ACTIVE_LIST})`);
      params.push(today);
      order = 'a.date ASC, a.start_time ASC';
      break;
    case 'past':
      where.push(`(a.status IN ('completed','cancelled') OR a.date < ?)`);
      params.push(today);
      break;
    case 'today':
      where.push('a.date = ?');
      params.push(today);
      order = 'a.start_time ASC';
      break;
    default:
      break;
  }

  if (q.status) {
    const statuses = q.status
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is AppointmentStatus => (APPOINTMENT_STATUSES as readonly string[]).includes(s));
    if (statuses.length) {
      where.push(`a.status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
  }
  if (q.date) {
    where.push('a.date = ?');
    params.push(q.date);
  }
  if (q.search) {
    const like = `%${q.search}%`;
    where.push('(a.code LIKE ? OR su.name LIKE ? OR du.name LIKE ? OR sp.roll_no LIKE ? OR a.reason LIKE ?)');
    params.push(like, like, like, like, like);
  }

  const rows = db
    .prepare(
      `SELECT a.*, c.id AS consultation_id, p.id AS prescription_id
         FROM appointments a
         JOIN users su ON su.id = a.student_id
         JOIN users du ON du.id = a.doctor_id
         LEFT JOIN student_profiles sp ON sp.user_id = a.student_id
         LEFT JOIN consultations c ON c.appointment_id = a.id
         LEFT JOIN prescriptions p ON p.appointment_id = a.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${order}
        LIMIT ?`,
    )
    .all(...params, q.limit) as AppointmentRow[];
  const cache = newMiniCache();
  return rows.map((r) => toAppointment(r, cache));
}

// ---------------------------------------------------------------------------
// Slot validation shared by booking & rescheduling
// ---------------------------------------------------------------------------
interface SlotCheck {
  doctorId: number;
  studentId: number;
  date: string;
  startTime: string;
  mode: AppointmentMode;
  excludeAppointmentId?: number;
  checkAccepting: boolean;
}

/** Validates a requested slot; returns its end time. Throws descriptive 400/409 errors. */
function validateSlot(input: SlotCheck): string {
  const { user: doctor, profile } = requireDoctor(input.doctorId);
  if (!doctor.is_active) throw notFound('Doctor');
  const doctorName = doctor.name;
  const exclude = input.excludeAppointmentId ?? -1;

  if (input.checkAccepting && !profile.is_accepting) {
    throw conflict('DOCTOR_UNAVAILABLE', `${doctorName} is not accepting appointments right now.`);
  }
  const modes = parseJson<AppointmentMode[]>(profile.consultation_modes, ['in_person']);
  if (!modes.includes(input.mode)) {
    throw badRequest(
      `${doctorName} does not offer ${APPOINTMENT_MODE_LABELS[input.mode].toLowerCase()}s.`,
      { mode: 'Choose another consultation mode.' },
      'MODE_NOT_OFFERED',
    );
  }
  if (!isValidDateStr(input.date)) throw badRequest('Choose a valid date.', { date: 'Invalid date.' });

  const today = todayStr();
  const offset = daysBetween(today, input.date);
  if (offset < 0) throw badRequest('That date has already passed.', { date: 'Choose a future date.' }, 'PAST_SLOT');
  if (offset > BOOKING_WINDOW_DAYS) {
    throw badRequest(
      `Appointments can be booked up to ${BOOKING_WINDOW_DAYS} days in advance.`,
      { date: 'Outside the booking window.' },
      'OUTSIDE_WINDOW',
    );
  }
  if (isOnLeave(input.doctorId, input.date)) {
    throw badRequest(`${doctorName} is on leave on ${fmtDate(input.date)}.`, { date: 'Doctor on leave.' }, 'DOCTOR_ON_LEAVE');
  }
  const slot = generateSlotTimes(input.doctorId, input.date, profile.slot_minutes).find((s) => s.time === input.startTime);
  if (!slot) {
    throw badRequest(
      `${fmtTime(input.startTime)} is not one of ${doctorName}'s OPD slots on ${fmtDate(input.date)}.`,
      { startTime: 'Choose one of the available slots.' },
      'INVALID_SLOT',
    );
  }
  if (input.date === today && toMinutes(input.startTime) <= toMinutes(currentTime())) {
    throw badRequest('That time slot has already passed. Please choose a later slot.', { startTime: 'Slot passed.' }, 'PAST_SLOT');
  }

  const start = input.startTime;
  const end = slot.endTime;
  const takenByDoctor = db
    .prepare(
      `SELECT 1 FROM appointments
        WHERE doctor_id = ? AND date = ? AND status <> 'cancelled' AND id <> ?
          AND start_time < ? AND end_time > ?`,
    )
    .get(input.doctorId, input.date, exclude, end, start);
  if (takenByDoctor) {
    throw conflict('SLOT_TAKEN', 'This slot has just been booked. Please pick another time.');
  }
  const overlapping = db
    .prepare(
      `SELECT a.start_time, u.name AS doctor_name FROM appointments a JOIN users u ON u.id = a.doctor_id
        WHERE a.student_id = ? AND a.date = ? AND a.status IN (${ACTIVE_LIST}) AND a.id <> ?
          AND a.start_time < ? AND a.end_time > ?`,
    )
    .get(input.studentId, input.date, exclude, end, start) as { start_time: string; doctor_name: string } | undefined;
  if (overlapping) {
    throw conflict(
      'STUDENT_CONFLICT',
      `You already have an appointment with ${overlapping.doctor_name} at ${fmtTime(overlapping.start_time)} on ${fmtDate(
        input.date,
      )}. Choose a time that doesn't overlap.`,
    );
  }
  const sameDoctorSameDay = db
    .prepare(
      `SELECT 1 FROM appointments
        WHERE student_id = ? AND doctor_id = ? AND date = ? AND status IN (${ACTIVE_LIST}) AND id <> ?`,
    )
    .get(input.studentId, input.doctorId, input.date, exclude);
  if (sameDoctorSameDay) {
    throw conflict(
      'DUPLICATE_BOOKING',
      `You already have an appointment with ${doctorName} on ${fmtDate(input.date)}.`,
    );
  }
  return end;
}

function isUniqueSlotError(err: unknown): boolean {
  return typeof (err as { code?: string })?.code === 'string' && (err as { code: string }).code.startsWith('SQLITE_CONSTRAINT');
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
export function createAppointment(user: SessionUser, input: z.output<typeof bookSchema>): Appointment {
  const endTime = validateSlot({
    doctorId: input.doctorId,
    studentId: user.id,
    date: input.date,
    startTime: input.startTime,
    mode: input.mode,
    checkAccepting: true,
  });

  let id: number;
  try {
    id = tx(() => {
      const now = nowIso();
      const code = generateCode('APT', 'appointments');
      const info = db
        .prepare(
          `INSERT INTO appointments (code, student_id, doctor_id, date, start_time, end_time, mode, reason, notes, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
        )
        .run(code, user.id, input.doctorId, input.date, input.startTime, endTime, input.mode, input.reason, input.notes, now, now);
      const newId = Number(info.lastInsertRowid);
      addStatusEvent('appointment', newId, 'scheduled', 'Appointment booked', user.id, now);
      return newId;
    });
  } catch (err) {
    if (isUniqueSlotError(err)) throw conflict('SLOT_TAKEN', 'This slot has just been booked. Please pick another time.');
    throw err;
  }

  const appt = getAppointment(id);
  const when = fmtSlot(appt.date, appt.startTime);
  notify(user.id, {
    type: 'appointment',
    title: 'Appointment confirmed',
    body: `Your ${appt.mode === 'video' ? 'video consultation' : 'appointment'} with ${appt.doctor.name} is confirmed for ${when}. Reference ${appt.code}.`,
    link: `/student/appointments?open=${id}`,
  });
  notify(appt.doctor.id, {
    type: 'appointment',
    title: 'New appointment booked',
    body: `${appt.student.name} booked ${when} — ${appt.reason}${appt.mode === 'video' ? ' (video)' : ''}.`,
    link: `/doctor/appointments?open=${id}`,
  });
  logActivity({
    actorId: user.id,
    action: 'appointment.booked',
    category: 'appointment',
    description: `${appt.student.name} booked ${appt.mode === 'video' ? 'a video consultation' : 'an appointment'} with ${appt.doctor.name} for ${when}`,
    entityType: 'appointment',
    entityId: id,
  });
  emitInvalidate(APPOINTMENT_KEYS);
  return appt;
}

export function rescheduleAppointment(
  user: SessionUser,
  id: number,
  input: z.output<typeof rescheduleSchema>,
): Appointment {
  const row = getAppointmentRow(id);
  const isOwner = user.role === 'student' && row.student_id === user.id;
  const isDoctor = user.role === 'doctor' && row.doctor_id === user.id;
  if (!isOwner && !isDoctor) {
    if (!canViewAppointment(user, row)) throw notFound('Appointment');
    throw forbidden('Only the patient or the doctor can reschedule this appointment.');
  }
  if (row.status !== 'scheduled') {
    throw conflict('INVALID_STATUS', 'Only scheduled appointments can be rescheduled.');
  }
  if (row.date === input.date && row.start_time === input.startTime) {
    throw badRequest('Choose a different date or time to reschedule.', { startTime: 'Same as the current slot.' });
  }
  const endTime = validateSlot({
    doctorId: row.doctor_id,
    studentId: row.student_id,
    date: input.date,
    startTime: input.startTime,
    mode: row.mode,
    excludeAppointmentId: id,
    checkAccepting: false,
  });
  const from = fmtSlot(row.date, row.start_time);
  const to = fmtSlot(input.date, input.startTime);
  try {
    tx(() => {
      const now = nowIso();
      db.prepare(
        `UPDATE appointments SET date = ?, start_time = ?, end_time = ?, rescheduled_count = rescheduled_count + 1, updated_at = ?
          WHERE id = ?`,
      ).run(input.date, input.startTime, endTime, now, id);
      addStatusEvent('appointment', id, 'scheduled', `Rescheduled from ${from} to ${to}`, user.id, now);
    });
  } catch (err) {
    if (isUniqueSlotError(err)) throw conflict('SLOT_TAKEN', 'This slot has just been booked. Please pick another time.');
    throw err;
  }
  const appt = getAppointment(id);
  notify(appt.student.id, {
    type: 'appointment',
    title: 'Appointment rescheduled',
    body: `Your appointment with ${appt.doctor.name} (${appt.code}) has moved to ${to}.`,
    link: `/student/appointments?open=${id}`,
  });
  if (isOwner) {
    notify(appt.doctor.id, {
      type: 'appointment',
      title: 'Appointment rescheduled',
      body: `${appt.student.name} moved their appointment from ${from} to ${to}.`,
      link: `/doctor/appointments?open=${id}`,
    });
  }
  logActivity({
    actorId: user.id,
    action: 'appointment.rescheduled',
    category: 'appointment',
    description: `${user.name} rescheduled ${appt.code} (${appt.student.name} with ${appt.doctor.name}) to ${to}`,
    entityType: 'appointment',
    entityId: id,
  });
  emitInvalidate(APPOINTMENT_KEYS);
  return appt;
}

export function cancelAppointment(user: SessionUser, id: number, reason: string | null): Appointment {
  const row = getAppointmentRow(id);
  if (!canViewAppointment(user, row)) throw notFound('Appointment');
  if (user.role === 'staff') throw forbidden('Dispensary staff cannot cancel appointments.');
  if (user.role === 'student') {
    if (row.status !== 'scheduled') {
      throw conflict('INVALID_STATUS', 'Only scheduled appointments can be cancelled. Please contact the health centre.');
    }
  } else if (row.status !== 'scheduled' && row.status !== 'checked_in') {
    throw conflict('INVALID_STATUS', 'This appointment can no longer be cancelled.');
  }
  const finalReason =
    reason ?? (user.role === 'student' ? 'Cancelled by student' : user.role === 'doctor' ? 'Cancelled by doctor' : 'Cancelled by health centre');
  tx(() => {
    const now = nowIso();
    db.prepare(
      `UPDATE appointments SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, cancelled_by_role = ?, updated_at = ?
        WHERE id = ?`,
    ).run(now, finalReason, user.role, now, id);
    addStatusEvent('appointment', id, 'cancelled', finalReason, user.id, now);
  });
  const appt = getAppointment(id);
  const when = fmtSlot(appt.date, appt.startTime);
  notify(appt.student.id, {
    type: 'appointment',
    title: 'Appointment cancelled',
    body:
      user.role === 'student'
        ? `Your appointment with ${appt.doctor.name} on ${when} has been cancelled.`
        : `${user.name} cancelled your appointment on ${when}. Reason: ${finalReason}.`,
    link: `/student/appointments?open=${id}`,
  });
  if (user.role !== 'doctor') {
    notify(appt.doctor.id, {
      type: 'appointment',
      title: 'Appointment cancelled',
      body: `${appt.student.name}'s appointment on ${when} was cancelled${user.role === 'student' ? ' by the student' : ''}.`,
      link: `/doctor/appointments?open=${id}`,
    });
  }
  logActivity({
    actorId: user.id,
    action: 'appointment.cancelled',
    category: 'appointment',
    description: `${user.name} cancelled ${appt.code} (${appt.student.name} with ${appt.doctor.name}, ${when})`,
    entityType: 'appointment',
    entityId: id,
  });
  emitInvalidate(APPOINTMENT_KEYS);
  return appt;
}

function performCheckIn(user: SessionUser, row: AppointmentRow): Appointment {
  if (row.status !== 'scheduled') {
    const msg =
      row.status === 'checked_in'
        ? 'This patient is already checked in.'
        : `This appointment is ${row.status.replace('_', ' ')} and cannot be checked in.`;
    throw conflict('INVALID_STATUS', msg);
  }
  const today = todayStr();
  if (row.date !== today) {
    throw badRequest(
      row.date > today ? `Check-in opens on ${fmtDate(row.date)}.` : 'This appointment date has already passed.',
      undefined,
      'NOT_TODAY',
    );
  }
  const token = tx(() => {
    const next = db
      .prepare('SELECT COALESCE(MAX(token_no), 0) + 1 AS next FROM appointments WHERE doctor_id = ? AND date = ?')
      .get(row.doctor_id, row.date) as { next: number };
    const now = nowIso();
    db.prepare(
      `UPDATE appointments SET status = 'checked_in', checked_in_at = ?, token_no = ?, updated_at = ? WHERE id = ?`,
    ).run(now, next.next, now, row.id);
    addStatusEvent('appointment', row.id, 'checked_in', `Checked in · token #${next.next}`, user.id, now);
    return next.next;
  });
  const appt = getAppointment(row.id);
  notify(appt.student.id, {
    type: 'appointment',
    title: `You're checked in — token #${token}`,
    body:
      appt.mode === 'video'
        ? `${appt.doctor.name} will start your video consultation shortly.`
        : `Please wait near ${appt.doctor.room ?? 'the OPD'}. ${appt.doctor.name} will call you shortly.`,
    link: `/student/appointments?open=${appt.id}`,
  });
  if (user.id !== appt.doctor.id) {
    notify(appt.doctor.id, {
      type: 'appointment',
      title: 'Patient checked in',
      body: `${appt.student.name} is waiting (token #${token}) for their ${fmtTime(appt.startTime)} appointment.`,
      link: `/doctor/appointments?open=${appt.id}`,
    });
  }
  logActivity({
    actorId: user.id,
    action: 'appointment.checked_in',
    category: 'appointment',
    description: `${appt.student.name} was checked in for ${appt.doctor.name} (token #${token})`,
    entityType: 'appointment',
    entityId: appt.id,
  });
  emitInvalidate(APPOINTMENT_KEYS);
  return appt;
}

export function checkIn(user: SessionUser, id: number): Appointment {
  const row = getAppointmentRow(id);
  if (!canViewAppointment(user, row)) throw notFound('Appointment');
  if (user.role === 'student') throw forbidden('Please ask the health centre desk or your doctor to check you in.');
  return performCheckIn(user, row);
}

export function checkInByCode(user: SessionUser, code: string): Appointment {
  const found = db.prepare('SELECT id FROM appointments WHERE code = ? COLLATE NOCASE').get(code.trim()) as
    | { id: number }
    | undefined;
  if (!found) throw notFound('Appointment');
  const row = getAppointmentRow(found.id);
  if (user.role === 'student') throw forbidden();
  if (user.role === 'doctor' && row.doctor_id !== user.id) {
    throw forbidden('This appointment belongs to another doctor.');
  }
  return performCheckIn(user, row);
}

function requireOwnDoctorAppointment(user: SessionUser, id: number): AppointmentRow {
  const row = getAppointmentRow(id);
  if (user.role !== 'doctor') throw forbidden('Only the consulting doctor can do this.');
  if (row.doctor_id !== user.id) throw notFound('Appointment');
  return row;
}

export function startConsultation(user: SessionUser, id: number): AppointmentDetail {
  const row = requireOwnDoctorAppointment(user, id);
  if (row.status === 'in_progress') {
    ensureDraftConsultation(row);
    return getAppointmentDetail(id);
  }
  if (row.date !== todayStr()) {
    throw badRequest(
      row.date > todayStr()
        ? `This consultation is scheduled for ${fmtDate(row.date)}.`
        : 'This appointment date has already passed.',
      undefined,
      'NOT_TODAY',
    );
  }
  if (row.status === 'scheduled' && row.mode !== 'video') {
    throw conflict('NOT_CHECKED_IN', 'Check the patient in before starting the consultation.');
  }
  if (row.status !== 'scheduled' && row.status !== 'checked_in') {
    throw conflict('INVALID_STATUS', `This appointment is ${row.status.replace('_', ' ')}.`);
  }
  tx(() => {
    const now = nowIso();
    db.prepare(`UPDATE appointments SET status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
    ensureDraftConsultation(row);
    addStatusEvent('appointment', id, 'in_progress', 'Consultation started', user.id, now);
  });
  const appt = getAppointment(id);
  notify(appt.student.id, {
    type: 'consultation',
    title: 'Consultation started',
    body:
      appt.mode === 'video'
        ? `${appt.doctor.name} has started your video consultation. Join the call from your appointment.`
        : `${appt.doctor.name} is ready to see you now${appt.doctor.room ? ` in ${appt.doctor.room}` : ''}.`,
    link: `/student/appointments?open=${id}`,
  });
  logActivity({
    actorId: user.id,
    action: 'consultation.started',
    category: 'consultation',
    description: `${appt.doctor.name} started a consultation with ${appt.student.name}`,
    entityType: 'appointment',
    entityId: id,
  });
  emitInvalidate(APPOINTMENT_KEYS);
  return getAppointmentDetail(id);
}

export function saveConsultationDraft(
  user: SessionUser,
  id: number,
  input: z.output<typeof consultationInputSchema>,
): Consultation {
  const row = requireOwnDoctorAppointment(user, id);
  if (row.status !== 'in_progress') {
    throw conflict('INVALID_STATUS', 'Start the consultation before saving notes.');
  }
  const consultationId = ensureDraftConsultation(row);
  writeConsultationFields(consultationId, input);
  emitInvalidate(['appointment'], [user.id]);
  return toConsultation(getConsultationRowByAppointment(id)!);
}

function summarise(input: z.output<typeof consultationInputSchema>): string | null {
  const parts: string[] = [];
  if (input.symptoms?.length) parts.push(`Symptoms: ${input.symptoms.join(', ')}.`);
  if (input.diagnosis) parts.push(`Diagnosis: ${input.diagnosis}.`);
  if (input.advice) parts.push(`Advice: ${input.advice}`);
  if (input.followUpDate) parts.push(`Follow-up: ${fmtDate(input.followUpDate)}.`);
  const text = parts.join(' ').trim();
  return text ? text.slice(0, 900) : null;
}

export function completeConsultation(
  user: SessionUser,
  id: number,
  input: z.output<typeof completeSchema>,
): AppointmentDetail {
  const row = requireOwnDoctorAppointment(user, id);
  if (row.status === 'completed') throw conflict('INVALID_STATUS', 'This consultation is already completed.');
  if (row.status !== 'in_progress') throw conflict('INVALID_STATUS', 'Start the consultation before completing it.');

  const c = input.consultation;
  if (!c.symptoms?.length && !c.clinicalNotes && !c.diagnosis) {
    throw badRequest('Add symptoms, clinical notes or a diagnosis before completing the consultation.', {
      diagnosis: 'Required to complete.',
    });
  }
  if (c.followUpDate && c.followUpDate < todayStr()) {
    throw badRequest('Follow-up date cannot be in the past.', { followUpDate: 'Choose a future date.' });
  }
  const rxItems = input.prescription?.items?.length ? resolvePrescriptionItems(input.prescription.items) : [];
  if (rxItems.length && db.prepare('SELECT 1 FROM prescriptions WHERE appointment_id = ?').get(id)) {
    throw conflict('PRESCRIPTION_EXISTS', 'A prescription has already been issued for this appointment.');
  }

  const result = tx(() => {
    const now = nowIso();
    const consultationId = ensureDraftConsultation(row);
    writeConsultationFields(consultationId, c);
    db.prepare(`UPDATE consultations SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`).run(
      now,
      now,
      consultationId,
    );
    db.prepare(`UPDATE appointments SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`).run(now, now, id);
    let rx: { id: number; code: string } | null = null;
    if (rxItems.length) {
      rx = insertPrescription({
        appointmentId: id,
        consultationId,
        studentId: row.student_id,
        doctorId: user.id,
        diagnosis: c.diagnosis,
        notes: input.prescription?.notes ?? null,
        items: rxItems,
      });
    }
    const existingRx = rx ?? (db.prepare('SELECT id, code FROM prescriptions WHERE appointment_id = ?').get(id) as
      | { id: number; code: string }
      | undefined) ?? null;
    insertVisitSummary({
      studentId: row.student_id,
      doctorId: user.id,
      consultationId,
      appointmentId: id,
      prescriptionId: existingRx?.id ?? null,
      recordDate: row.date,
      title: c.diagnosis ? `Visit summary — ${c.diagnosis}` : `Consultation with ${user.name}`,
      description: summarise(c),
    });
    addStatusEvent('appointment', id, 'completed', 'Consultation completed', user.id, now);
    return { rx };
  });

  const appt = getAppointment(id);
  notify(appt.student.id, {
    type: 'consultation',
    title: 'Consultation completed',
    body: `${appt.doctor.name} completed your consultation${c.diagnosis ? ` (${c.diagnosis})` : ''}. ${
      c.followUpDate ? `Follow-up recommended on ${fmtDate(c.followUpDate)}.` : 'Your visit summary is in your medical records.'
    }`,
    link: `/student/appointments?open=${id}`,
  });
  logActivity({
    actorId: user.id,
    action: 'consultation.completed',
    category: 'consultation',
    description: `${appt.doctor.name} completed a consultation with ${appt.student.name}${c.diagnosis ? ` (${c.diagnosis})` : ''}`,
    entityType: 'appointment',
    entityId: id,
  });
  if (result.rx) announcePrescription(result.rx, user.id, appt.student.id, rxItems.length);
  emitInvalidate([...APPOINTMENT_KEYS, 'prescriptions', 'prescription', 'records']);
  return getAppointmentDetail(id);
}

/** Throws unless the user may read the appointment. Exported for other modules (e.g. calls). */
export function assertCanViewAppointment(user: SessionUser, id: number): AppointmentRow {
  const row = getAppointmentRow(id);
  if (!canViewAppointment(user, row)) throw new AppError(404, 'NOT_FOUND', 'Appointment not found.');
  return row;
}

/** Student display name helper for other services. */
export function studentName(id: number): string {
  return getUserRow(id)?.name ?? 'Student';
}
