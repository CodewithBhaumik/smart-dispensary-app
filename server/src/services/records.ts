import fs from 'node:fs';
import path from 'node:path';
import { RECORD_CATEGORY_LABELS, type RecordCategory } from '@shared/constants';
import type { MedicalRecord } from '@shared/types';
import { db, UPLOADS_DIR } from '../db';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { nowIso } from '../lib/time';
import type { SessionUser } from '../middleware/auth';
import { emitInvalidate } from '../realtime/io';
import { logActivity } from './activity';
import { getDoctorMini, getUserMini, getUserRow } from './minis';
import { notify } from './notify';
import { canViewStudentClinicalData, doctorHasPatient } from './relations';

export interface RecordRow {
  id: number;
  student_id: number;
  category: RecordCategory;
  title: string;
  description: string | null;
  record_date: string;
  source: 'consultation' | 'upload';
  doctor_id: number | null;
  consultation_id: number | null;
  appointment_id: number | null;
  prescription_id: number | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: number | null;
  created_at: string;
}

export function toRecord(row: RecordRow): MedicalRecord {
  return {
    id: row.id,
    studentId: row.student_id,
    category: row.category,
    title: row.title,
    description: row.description,
    recordDate: row.record_date,
    source: row.source,
    doctor: row.doctor_id ? getDoctorMini(row.doctor_id) : null,
    consultationId: row.consultation_id,
    appointmentId: row.appointment_id,
    prescriptionId: row.prescription_id,
    file:
      row.file_name && row.file_path
        ? { name: row.file_name, size: row.file_size ?? 0, mimeType: row.mime_type ?? 'application/octet-stream' }
        : null,
    uploadedBy: getUserMini(row.uploaded_by),
    createdAt: row.created_at,
  };
}

export function listRecordsForStudent(studentId: number, category?: string): MedicalRecord[] {
  const rows = (
    category
      ? db
          .prepare(
            'SELECT * FROM medical_records WHERE student_id = ? AND category = ? ORDER BY record_date DESC, created_at DESC, id DESC',
          )
          .all(studentId, category)
      : db
          .prepare('SELECT * FROM medical_records WHERE student_id = ? ORDER BY record_date DESC, created_at DESC, id DESC')
          .all(studentId)
  ) as RecordRow[];
  return rows.map(toRecord);
}

export interface RecordListQuery {
  studentId?: number;
  category?: string;
}

export function listRecords(user: SessionUser, query: RecordListQuery): MedicalRecord[] {
  if (user.role === 'student') return listRecordsForStudent(user.id, query.category);
  if (user.role === 'doctor') {
    if (!query.studentId) throw badRequest('Choose a patient to view their records.');
    if (!doctorHasPatient(user.id, query.studentId)) throw forbidden('This student is not one of your patients.');
    return listRecordsForStudent(query.studentId, query.category);
  }
  if (user.role === 'admin') {
    if (query.studentId) return listRecordsForStudent(query.studentId, query.category);
    const rows = (
      query.category
        ? db
            .prepare('SELECT * FROM medical_records WHERE category = ? ORDER BY record_date DESC, id DESC LIMIT 200')
            .all(query.category)
        : db.prepare('SELECT * FROM medical_records ORDER BY record_date DESC, id DESC LIMIT 200').all()
    ) as RecordRow[];
    return rows.map(toRecord);
  }
  throw forbidden();
}

export function getRecordRow(id: number): RecordRow | null {
  return (db.prepare('SELECT * FROM medical_records WHERE id = ?').get(id) as RecordRow | undefined) ?? null;
}

export interface UploadInput {
  category: RecordCategory;
  title: string;
  recordDate: string;
  description: string | null;
  studentId?: number;
}

export interface UploadedFile {
  originalname: string;
  filename: string;
  size: number;
  mimetype: string;
  path: string;
}

function removeFile(storedName: string | null | undefined) {
  if (!storedName) return;
  try {
    fs.unlinkSync(path.join(UPLOADS_DIR, path.basename(storedName)));
  } catch {
    /* already gone */
  }
}

/** Saves an uploaded document as a medical record. Removes the stored file if validation fails. */
export function createUploadedRecord(user: SessionUser, input: UploadInput, file: UploadedFile | undefined): MedicalRecord {
  if (!file) throw badRequest('Choose a file to upload.', { file: 'A file is required.' });
  let studentId: number;
  try {
    if (user.role === 'student') {
      studentId = user.id;
    } else if (user.role === 'doctor') {
      if (!input.studentId) throw badRequest('Choose the patient this document belongs to.');
      if (!doctorHasPatient(user.id, input.studentId)) throw forbidden('This student is not one of your patients.');
      studentId = input.studentId;
    } else {
      throw forbidden('Only students and doctors can upload medical documents.');
    }
    if (input.category === 'visit_summary') {
      throw badRequest('Visit summaries are created automatically after consultations.', {
        category: 'Choose another category.',
      });
    }
  } catch (err) {
    removeFile(file.filename);
    throw err;
  }

  const info = db
    .prepare(
      `INSERT INTO medical_records
         (student_id, category, title, description, record_date, source, doctor_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'upload', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      studentId,
      input.category,
      input.title,
      input.description,
      input.recordDate,
      user.role === 'doctor' ? user.id : null,
      file.originalname,
      file.filename,
      file.size,
      file.mimetype,
      user.id,
      nowIso(),
    );
  const id = Number(info.lastInsertRowid);
  const student = getUserRow(studentId);
  const label = RECORD_CATEGORY_LABELS[input.category].toLowerCase();
  logActivity({
    actorId: user.id,
    action: 'record.uploaded',
    category: 'record',
    description:
      user.role === 'doctor'
        ? `${user.name} added a ${label} "${input.title}" to ${student?.name ?? 'a patient'}'s records`
        : `${user.name} uploaded a ${label} "${input.title}"`,
    entityType: 'medical_record',
    entityId: id,
  });
  if (user.role === 'doctor') {
    notify(studentId, {
      type: 'system',
      title: 'New document in your records',
      body: `${user.name} added "${input.title}" (${RECORD_CATEGORY_LABELS[input.category]}) to your medical records.`,
      link: '/student/records',
    });
  }
  emitInvalidate(['records', 'patient', 'dashboard']);
  return toRecord(getRecordRow(id)!);
}

export function canViewRecord(user: SessionUser, row: RecordRow): boolean {
  return canViewStudentClinicalData(user, row.student_id);
}

export function getRecordFile(user: SessionUser, id: number): { absPath: string; fileName: string; mimeType: string } {
  const row = getRecordRow(id);
  if (!row || !canViewRecord(user, row)) throw notFound('Record');
  if (!row.file_path || !row.file_name) throw notFound('File');
  const absPath = path.join(UPLOADS_DIR, path.basename(row.file_path));
  if (!fs.existsSync(absPath)) throw notFound('File');
  return { absPath, fileName: row.file_name, mimeType: row.mime_type ?? 'application/octet-stream' };
}

export function deleteRecord(user: SessionUser, id: number): void {
  const row = getRecordRow(id);
  if (!row || !canViewRecord(user, row)) throw notFound('Record');
  if (row.source !== 'upload' || row.uploaded_by !== user.id) {
    throw forbidden('You can only delete documents you uploaded.');
  }
  db.prepare('DELETE FROM medical_records WHERE id = ?').run(id);
  removeFile(row.file_path);
  logActivity({
    actorId: user.id,
    action: 'record.deleted',
    category: 'record',
    description: `${user.name} deleted the document "${row.title}"`,
    entityType: 'medical_record',
    entityId: id,
  });
  emitInvalidate(['records', 'patient', 'dashboard']);
}

export interface VisitSummaryInput {
  studentId: number;
  doctorId: number;
  consultationId: number;
  appointmentId: number;
  prescriptionId: number | null;
  recordDate: string;
  title: string;
  description: string | null;
}

/** Visit summary auto-created when a consultation completes (call inside a transaction). */
export function insertVisitSummary(input: VisitSummaryInput): number {
  const info = db
    .prepare(
      `INSERT INTO medical_records
         (student_id, category, title, description, record_date, source, doctor_id, consultation_id, appointment_id, prescription_id, uploaded_by, created_at)
       VALUES (?, 'visit_summary', ?, ?, ?, 'consultation', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.studentId,
      input.title,
      input.description,
      input.recordDate,
      input.doctorId,
      input.consultationId,
      input.appointmentId,
      input.prescriptionId,
      input.doctorId,
      nowIso(),
    );
  return Number(info.lastInsertRowid);
}
