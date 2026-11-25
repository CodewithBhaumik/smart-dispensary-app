import type { PatientDetail, PatientSummary } from '@shared/types';
import { db } from '../db';
import { forbidden, notFound } from '../lib/errors';
import type { SessionUser } from '../middleware/auth';
import { queryAppointments } from './appointments';
import { toConsultation, type ConsultationRow } from './consultations';
import { getPatientSummary, getUserRow } from './minis';
import { toPrescription, type PrescriptionRow } from './prescriptions';
import { listRecordsForStudent } from './records';
import { doctorHasPatient } from './relations';

export function listPatients(user: SessionUser, search?: string): PatientSummary[] {
  const params: unknown[] = [];
  let sql: string;
  const searchSql = search ? 'AND (u.name LIKE ? OR sp.roll_no LIKE ? OR sp.department LIKE ? OR u.email LIKE ?)' : '';
  const like = `%${search ?? ''}%`;
  if (user.role === 'doctor') {
    sql = `SELECT u.id, MAX(a.date) AS last_seen
             FROM appointments a
             JOIN users u ON u.id = a.student_id
             LEFT JOIN student_profiles sp ON sp.user_id = u.id
            WHERE a.doctor_id = ? ${searchSql}
            GROUP BY u.id
            ORDER BY last_seen DESC, u.name ASC`;
    params.push(user.id);
  } else if (user.role === 'admin') {
    sql = `SELECT u.id FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
            WHERE u.role = 'student' ${searchSql}
            ORDER BY u.name ASC`;
  } else {
    throw forbidden();
  }
  if (search) params.push(like, like, like, like);
  const rows = db.prepare(sql).all(...params) as { id: number }[];
  return rows.map((r) => getPatientSummary(r.id));
}

export function getPatientDetail(user: SessionUser, studentId: number): PatientDetail {
  const target = getUserRow(studentId);
  if (!target || target.role !== 'student') throw notFound('Patient');
  if (user.role === 'doctor') {
    if (!doctorHasPatient(user.id, studentId)) throw forbidden('This student is not one of your patients.');
  } else if (user.role !== 'admin') {
    throw forbidden();
  }
  const consultations = (
    db
      .prepare(
        `SELECT * FROM consultations WHERE student_id = ? AND status = 'completed'
          ORDER BY COALESCE(completed_at, created_at) DESC`,
      )
      .all(studentId) as ConsultationRow[]
  ).map(toConsultation);
  const prescriptions = (
    db
      .prepare('SELECT * FROM prescriptions WHERE student_id = ? ORDER BY created_at DESC, id DESC')
      .all(studentId) as PrescriptionRow[]
  ).map(toPrescription);
  return {
    patient: getPatientSummary(studentId),
    appointments: queryAppointments('a.student_id = ?', [studentId], 'a.date DESC, a.start_time DESC', 100),
    consultations,
    prescriptions,
    records: listRecordsForStudent(studentId),
  };
}
