/**
 * Self-contained fixtures for the chat / call tests (independent of the demo seed).
 */
import { db, initSchema } from '../src/db';
import { nowIso, todayStr } from '../src/lib/time';
import { createSession } from '../src/middleware/auth';

type FixtureRole = 'student' | 'doctor' | 'staff';

let counter = 0;

export function makeUser(role: FixtureRole, name: string): { id: number; token: string; name: string } {
  counter += 1;
  const email = `comms.${role}.${counter}@test.local`;
  const info = db
    .prepare(
      `INSERT INTO users (role, name, email, password_hash, phone, title, avatar_color, is_active, is_demo, created_at)
       VALUES (?, ?, ?, 'x', NULL, ?, '#0d9488', 1, 0, ?)`,
    )
    .run(role, name, email, role === 'doctor' ? 'Medical Officer' : null, nowIso());
  const id = Number(info.lastInsertRowid);
  if (role === 'student') {
    db.prepare(
      'INSERT INTO student_profiles (user_id, roll_no, department, program, year) VALUES (?, ?, ?, ?, ?)',
    ).run(id, `TST${1000 + counter}`, 'Computer Science & Engineering', 'B.E.', 3);
  } else if (role === 'doctor') {
    db.prepare('INSERT INTO doctor_profiles (user_id, specialty, qualifications) VALUES (?, ?, ?)').run(
      id,
      'General Medicine',
      'M.B.B.S',
    );
  } else {
    db.prepare('INSERT INTO staff_profiles (user_id, designation) VALUES (?, ?)').run(id, 'Pharmacist');
  }
  return { id, token: createSession(id), name };
}

let slot = 0;

export function makeAppointment(studentId: number, doctorId: number, code: string): number {
  const now = nowIso();
  slot += 1;
  const start = `${String(9 + slot).padStart(2, '0')}:00`;
  const end = `${String(9 + slot).padStart(2, '0')}:15`;
  const info = db
    .prepare(
      `INSERT INTO appointments (code, student_id, doctor_id, date, start_time, end_time, mode, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'video', 'General consultation', 'scheduled', ?, ?)`,
    )
    .run(code, studentId, doctorId, todayStr(), start, end, now, now);
  return Number(info.lastInsertRowid);
}

export function setupCommsFixtures() {
  initSchema();
  return {
    student: makeUser('student', 'Riya Sharma'),
    student2: makeUser('student', 'Kabir Singh'),
    doctor: makeUser('doctor', 'Dr. Test Physician'),
    doctor2: makeUser('doctor', 'Dr. Offline Doctor'),
    staff: makeUser('staff', 'Test Pharmacist'),
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
