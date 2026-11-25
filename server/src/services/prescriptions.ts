import { z } from 'zod';
import { FREQUENCIES, PRESCRIPTION_VALIDITY_DAYS, type FrequencyCode, type RequestStatus } from '@shared/constants';
import type { Prescription, PrescriptionItem } from '@shared/types';
import { db, tx } from '../db';
import { generateCode } from '../lib/codes';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { bool } from '../lib/json';
import { addDaysStr, nowIso, todayStr } from '../lib/time';
import { zId, zOptionalText } from '../lib/validate';
import type { SessionUser } from '../middleware/auth';
import { emitInvalidate } from '../realtime/io';
import { logActivity } from './activity';
import { getDoctorMini, getStudentMini, getUserRow } from './minis';
import { notify } from './notify';
import { doctorHasPatient } from './relations';

const FREQUENCY_CODES = FREQUENCIES.map((f) => f.value) as [FrequencyCode, ...FrequencyCode[]];

export const prescriptionItemSchema = z.object({
  medicineId: zId,
  dosage: z.string().trim().min(1, 'Enter a dosage, e.g. "1 tablet".').max(60),
  frequency: z.enum(FREQUENCY_CODES, { message: 'Choose how often the medicine should be taken.' }),
  durationDays: z.coerce
    .number()
    .int()
    .min(1, 'Duration must be at least 1 day.')
    .max(90, 'Duration can be at most 90 days.'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.').max(100, 'Quantity can be at most 100.'),
  instructions: zOptionalText(200),
  notes: zOptionalText(300),
});
export type PrescriptionItemInput = z.output<typeof prescriptionItemSchema>;

export const createPrescriptionSchema = z.object({
  appointmentId: zId,
  notes: zOptionalText(1000),
  items: z.array(prescriptionItemSchema).min(1, 'Add at least one medicine.').max(15),
});

export interface PrescriptionRow {
  id: number;
  code: string;
  appointment_id: number | null;
  consultation_id: number | null;
  student_id: number;
  doctor_id: number;
  diagnosis: string | null;
  notes: string | null;
  valid_until: string;
  created_at: string;
}

interface ItemRow {
  id: number;
  prescription_id: number;
  medicine_id: number;
  medicine_name: string;
  dosage: string;
  frequency: string;
  duration_days: number;
  quantity: number;
  instructions: string | null;
  notes: string | null;
  form: string | null;
  strength: string | null;
  requires_prescription: number | null;
}

export function toPrescription(row: PrescriptionRow): Prescription {
  const items = db
    .prepare(
      `SELECT i.*, m.form, m.strength, m.requires_prescription
         FROM prescription_items i LEFT JOIN medicines m ON m.id = i.medicine_id
        WHERE i.prescription_id = ? ORDER BY i.id`,
    )
    .all(row.id) as ItemRow[];
  const latest = db
    .prepare(
      `SELECT id, code, status FROM medicine_requests WHERE prescription_id = ?
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(row.id) as { id: number; code: string; status: RequestStatus } | undefined;
  return {
    id: row.id,
    code: row.code,
    appointmentId: row.appointment_id,
    consultationId: row.consultation_id,
    diagnosis: row.diagnosis,
    notes: row.notes,
    validUntil: row.valid_until,
    createdAt: row.created_at,
    student: getStudentMini(row.student_id),
    doctor: getDoctorMini(row.doctor_id),
    items: items.map(
      (i): PrescriptionItem => ({
        id: i.id,
        medicineId: i.medicine_id,
        medicineName: i.medicine_name,
        form: i.form ?? 'Tablet',
        strength: i.strength,
        dosage: i.dosage,
        frequency: i.frequency,
        durationDays: i.duration_days,
        quantity: i.quantity,
        instructions: i.instructions,
        notes: i.notes,
        requiresPrescription: bool(i.requires_prescription),
      }),
    ),
    latestRequest: latest ? { id: latest.id, code: latest.code, status: latest.status } : null,
  };
}

export function getPrescriptionRow(id: number): PrescriptionRow | null {
  return (db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id) as PrescriptionRow | undefined) ?? null;
}

export function getPrescriptionByAppointment(appointmentId: number): Prescription | null {
  const row = db.prepare('SELECT * FROM prescriptions WHERE appointment_id = ?').get(appointmentId) as
    | PrescriptionRow
    | undefined;
  return row ? toPrescription(row) : null;
}

export function canViewPrescription(user: SessionUser, row: PrescriptionRow): boolean {
  switch (user.role) {
    case 'student':
      return row.student_id === user.id;
    case 'doctor':
      return row.doctor_id === user.id || doctorHasPatient(user.id, row.student_id);
    default:
      return true; // staff dispense against prescriptions, admins oversee
  }
}

export function getPrescriptionForUser(user: SessionUser, id: number): Prescription {
  const row = getPrescriptionRow(id);
  if (!row || !canViewPrescription(user, row)) throw notFound('Prescription');
  return toPrescription(row);
}

export interface PrescriptionListQuery {
  search?: string;
  studentId?: number;
}

export function listPrescriptions(user: SessionUser, query: PrescriptionListQuery = {}): Prescription[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (user.role === 'student') {
    where.push('p.student_id = ?');
    params.push(user.id);
  } else if (user.role === 'doctor') {
    if (query.studentId) {
      if (!doctorHasPatient(user.id, query.studentId)) throw forbidden('This student is not one of your patients.');
      where.push('p.student_id = ?');
      params.push(query.studentId);
    } else {
      where.push('p.doctor_id = ?');
      params.push(user.id);
    }
  } else if (query.studentId) {
    where.push('p.student_id = ?');
    params.push(query.studentId);
  }
  if (query.search) {
    const like = `%${query.search}%`;
    where.push(
      `(p.code LIKE ? OR p.diagnosis LIKE ? OR su.name LIKE ? OR du.name LIKE ?
        OR EXISTS (SELECT 1 FROM prescription_items i WHERE i.prescription_id = p.id AND i.medicine_name LIKE ?))`,
    );
    params.push(like, like, like, like, like);
  }
  const rows = db
    .prepare(
      `SELECT p.* FROM prescriptions p
         JOIN users su ON su.id = p.student_id
         JOIN users du ON du.id = p.doctor_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.created_at DESC, p.id DESC`,
    )
    .all(...params) as PrescriptionRow[];
  return rows.map(toPrescription);
}

interface ResolvedItem extends PrescriptionItemInput {
  medicineName: string;
}

/** Validates items against the formulary (active medicines, no duplicates). */
export function resolvePrescriptionItems(items: PrescriptionItemInput[]): ResolvedItem[] {
  const seen = new Set<number>();
  return items.map((item, index) => {
    const med = db.prepare('SELECT id, name, is_active FROM medicines WHERE id = ?').get(item.medicineId) as
      | { id: number; name: string; is_active: number }
      | undefined;
    if (!med || !bool(med.is_active)) {
      throw badRequest('One of the selected medicines is not available in the formulary.', {
        [`items.${index}.medicineId`]: 'Medicine not available.',
      });
    }
    if (seen.has(med.id)) {
      throw badRequest(`${med.name} is listed more than once.`, {
        [`items.${index}.medicineId`]: 'Duplicate medicine.',
      });
    }
    seen.add(med.id);
    return { ...item, medicineName: med.name };
  });
}

export interface InsertPrescriptionInput {
  appointmentId: number | null;
  consultationId: number | null;
  studentId: number;
  doctorId: number;
  diagnosis: string | null;
  notes: string | null;
  items: ResolvedItem[];
}

/** Inserts a prescription + items (call inside a transaction). Returns { id, code }. */
export function insertPrescription(input: InsertPrescriptionInput): { id: number; code: string } {
  const code = generateCode('RX', 'prescriptions');
  const info = db
    .prepare(
      `INSERT INTO prescriptions (code, appointment_id, consultation_id, student_id, doctor_id, diagnosis, notes, valid_until, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      code,
      input.appointmentId,
      input.consultationId,
      input.studentId,
      input.doctorId,
      input.diagnosis,
      input.notes,
      addDaysStr(todayStr(), PRESCRIPTION_VALIDITY_DAYS),
      nowIso(),
    );
  const id = Number(info.lastInsertRowid);
  const insertItem = db.prepare(
    `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, frequency, duration_days, quantity, instructions, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const item of input.items) {
    insertItem.run(
      id,
      item.medicineId,
      item.medicineName,
      item.dosage,
      item.frequency,
      item.durationDays,
      item.quantity,
      item.instructions,
      item.notes,
    );
  }
  return { id, code };
}

/** Side effects after a prescription is issued (notification, activity, live refresh). */
export function announcePrescription(
  rx: { id: number; code: string },
  doctorId: number,
  studentId: number,
  itemCount: number,
): void {
  const doctor = getUserRow(doctorId);
  const student = getUserRow(studentId);
  notify(studentId, {
    type: 'prescription',
    title: 'New prescription issued',
    body: `${doctor?.name ?? 'Your doctor'} issued prescription ${rx.code} with ${itemCount} ${
      itemCount === 1 ? 'medicine' : 'medicines'
    }. You can request it from the dispensary.`,
    link: `/student/prescriptions?open=${rx.id}`,
  });
  logActivity({
    actorId: doctorId,
    action: 'prescription.created',
    category: 'prescription',
    description: `${doctor?.name ?? 'A doctor'} issued prescription ${rx.code} to ${student?.name ?? 'a student'}`,
    entityType: 'prescription',
    entityId: rx.id,
  });
}

/** POST /prescriptions — prescribe for an appointment after the consultation started/completed. */
export function createPrescriptionForAppointment(
  user: SessionUser,
  input: z.output<typeof createPrescriptionSchema>,
): Prescription {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(input.appointmentId) as
    | { id: number; student_id: number; doctor_id: number; status: string }
    | undefined;
  if (!appt) throw notFound('Appointment');
  if (appt.doctor_id !== user.id) throw forbidden('You can only prescribe for your own appointments.');
  if (appt.status !== 'completed' && appt.status !== 'in_progress') {
    throw conflict('INVALID_STATUS', 'A prescription can be created once the consultation has started.');
  }
  if (db.prepare('SELECT 1 FROM prescriptions WHERE appointment_id = ?').get(appt.id)) {
    throw conflict('PRESCRIPTION_EXISTS', 'A prescription has already been issued for this appointment.');
  }
  const items = resolvePrescriptionItems(input.items);
  const consultation = db
    .prepare('SELECT id, diagnosis FROM consultations WHERE appointment_id = ?')
    .get(appt.id) as { id: number; diagnosis: string | null } | undefined;

  const rx = tx(() => {
    const created = insertPrescription({
      appointmentId: appt.id,
      consultationId: consultation?.id ?? null,
      studentId: appt.student_id,
      doctorId: user.id,
      diagnosis: consultation?.diagnosis ?? null,
      notes: input.notes,
      items,
    });
    db.prepare(
      `UPDATE medical_records SET prescription_id = ?
        WHERE appointment_id = ? AND category = 'visit_summary' AND prescription_id IS NULL`,
    ).run(created.id, appt.id);
    return created;
  });

  announcePrescription(rx, user.id, appt.student_id, items.length);
  emitInvalidate(['prescriptions', 'prescription', 'appointments', 'appointment', 'dashboard', 'records', 'patient']);
  return toPrescription(getPrescriptionRow(rx.id)!);
}
