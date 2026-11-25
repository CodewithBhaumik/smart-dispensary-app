import { z } from 'zod';
import type { ConsultationStatus } from '@shared/constants';
import type { Consultation, Vitals } from '@shared/types';
import { db } from '../db';
import { parseJson, toJson } from '../lib/json';
import { nowIso } from '../lib/time';
import { zDate, zOptionalText } from '../lib/validate';
import { getDoctorMini, getStudentMini } from './minis';

export interface ConsultationRow {
  id: number;
  appointment_id: number;
  student_id: number;
  doctor_id: number;
  status: ConsultationStatus;
  symptoms: string;
  vitals: string;
  clinical_notes: string | null;
  observations: string | null;
  diagnosis: string | null;
  advice: string | null;
  follow_up_date: string | null;
  follow_up_notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const vitalField = z.string().trim().max(20).optional();

export const consultationInputSchema = z.object({
  symptoms: z.array(z.string().trim().min(1).max(60)).max(30).optional().default([]),
  vitals: z
    .object({
      temperature: vitalField,
      bloodPressure: vitalField,
      pulse: vitalField,
      spo2: vitalField,
      weight: vitalField,
    })
    .optional()
    .default({}),
  clinicalNotes: zOptionalText(4000),
  observations: zOptionalText(4000),
  diagnosis: zOptionalText(300),
  advice: zOptionalText(4000),
  followUpDate: zDate.optional().nullable().transform((v) => v ?? null),
  followUpNotes: zOptionalText(500),
});
export type ConsultationInput = z.output<typeof consultationInputSchema>;

export function toConsultation(row: ConsultationRow): Consultation {
  const vitals = parseJson<Vitals>(row.vitals, {});
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    status: row.status,
    symptoms: parseJson<string[]>(row.symptoms, []),
    vitals,
    clinicalNotes: row.clinical_notes,
    observations: row.observations,
    diagnosis: row.diagnosis,
    advice: row.advice,
    followUpDate: row.follow_up_date,
    followUpNotes: row.follow_up_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    doctor: getDoctorMini(row.doctor_id),
    student: getStudentMini(row.student_id),
  };
}

export function getConsultationRowByAppointment(appointmentId: number): ConsultationRow | null {
  return (
    (db.prepare('SELECT * FROM consultations WHERE appointment_id = ?').get(appointmentId) as
      | ConsultationRow
      | undefined) ?? null
  );
}

export function getConsultationByAppointment(appointmentId: number): Consultation | null {
  const row = getConsultationRowByAppointment(appointmentId);
  return row ? toConsultation(row) : null;
}

/** Creates an empty draft consultation for an appointment if none exists; returns its id. */
export function ensureDraftConsultation(appointment: { id: number; student_id: number; doctor_id: number }): number {
  const existing = getConsultationRowByAppointment(appointment.id);
  if (existing) return existing.id;
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO consultations (appointment_id, student_id, doctor_id, status, symptoms, vitals, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', '[]', '{}', ?, ?)`,
    )
    .run(appointment.id, appointment.student_id, appointment.doctor_id, now, now);
  return Number(info.lastInsertRowid);
}

/** Overwrites the clinical fields of a consultation (the editor always sends the full form). */
export function writeConsultationFields(consultationId: number, input: ConsultationInput): void {
  const vitals = Object.fromEntries(Object.entries(input.vitals ?? {}).filter(([, v]) => v !== undefined && v !== ''));
  db.prepare(
    `UPDATE consultations
        SET symptoms = ?, vitals = ?, clinical_notes = ?, observations = ?, diagnosis = ?, advice = ?,
            follow_up_date = ?, follow_up_notes = ?, updated_at = ?
      WHERE id = ?`,
  ).run(
    toJson([...new Set(input.symptoms ?? [])]),
    toJson(vitals),
    input.clinicalNotes,
    input.observations,
    input.diagnosis,
    input.advice,
    input.followUpDate,
    input.followUpNotes,
    nowIso(),
    consultationId,
  );
}
