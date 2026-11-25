import { db } from '../db';
import type { SessionUser } from '../middleware/auth';

/** True when the doctor has (or had) at least one appointment with the student. */
export function doctorHasPatient(doctorId: number, studentId: number): boolean {
  return !!db.prepare('SELECT 1 FROM appointments WHERE doctor_id = ? AND student_id = ? LIMIT 1').get(doctorId, studentId);
}

/** Who may read a student's clinical data (records, prescriptions, history). */
export function canViewStudentClinicalData(user: SessionUser, studentId: number): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'student') return user.id === studentId;
  if (user.role === 'doctor') return doctorHasPatient(user.id, studentId);
  return false;
}
