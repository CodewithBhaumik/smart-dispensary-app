/**
 * Deterministic fixtures for CORE API tests (independent of the demo seed).
 * Time is frozen at Wed 25 Nov 2026, 09:00 local so slot logic is predictable.
 */
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { vi } from 'vitest';
import { createApp } from '../src/app';
import { db, initSchema } from '../src/db';

export const FAKE_NOW = new Date(2026, 10, 25, 9, 0, 0); // Wednesday
export const TODAY = '2026-11-25';
export const TOMORROW = '2026-11-26'; // Thursday
export const PASSWORD = 'demo1234';

export function freezeTime() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FAKE_NOW);
}

export type FixtureIds = Record<
  'aarav' | 'priya' | 'rohan' | 'ritu' | 'ajay' | 'pooja' | 'abhishek' | 'vishal' | 'paracetamol' | 'amoxicillin' | 'cetirizine',
  number
>;

export function seedCoreFixtures(): FixtureIds {
  initSchema();
  const hash = bcrypt.hashSync(PASSWORD, 4);
  const now = new Date().toISOString();
  const ids = {} as FixtureIds;
  const insertUser = db.prepare(
    `INSERT INTO users (role, name, email, password_hash, phone, title, avatar_color, is_active, is_demo, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '#0d9488', 1, ?, ?)`,
  );
  const user = (key: keyof FixtureIds, role: string, name: string, email: string, title: string, isDemo = 0) => {
    ids[key] = Number(insertUser.run(role, name, email, hash, '+91 98140 11223', title, isDemo, now).lastInsertRowid);
  };
  user('aarav', 'student', 'Aarav Mehta', 'aarav.mehta@smartdispensary.in', 'B.E. · Year 3', 1);
  user('priya', 'student', 'Priya Sharma', 'priya.sharma@smartdispensary.in', 'B.E. · Year 2');
  user('rohan', 'student', 'Rohan Verma', 'rohan.verma@smartdispensary.in', 'B.Tech · Year 1');
  user('ritu', 'doctor', 'Dr. Ritu Bassi', 'ritu.bassi@smartdispensary.in', 'Sr. Medical Officer', 1);
  user('ajay', 'doctor', 'Dr. Ajay Gupta', 'ajay.gupta@smartdispensary.in', 'Medical Officer');
  user('pooja', 'doctor', 'Dr. Pooja Bansal', 'pooja.bansal@smartdispensary.in', 'Dental Surgeon');
  user('abhishek', 'staff', 'Abhishek Bhardwaj', 'abhishek.bhardwaj@smartdispensary.in', 'Associate (Pharmacist)', 1);
  user('vishal', 'admin', 'Dr. Vishal Srivastava', 'vishal.srivastava@smartdispensary.in', 'Faculty-in-Charge, Health Centre', 1);

  const insertStudent = db.prepare(
    `INSERT INTO student_profiles (user_id, roll_no, department, program, year, gender, date_of_birth, blood_group, hostel, room,
       emergency_contact_name, emergency_contact_phone, emergency_contact_relation, allergies, conditions, medications)
     VALUES (?, ?, ?, 'B.E.', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  insertStudent.run(ids.aarav, '102303147', 'Computer Science & Engineering', 3, 'Male', '2005-03-14', 'B+', 'Hostel J', '214',
    'Rajesh Mehta', '+91 98140 22331', 'Father', '["Penicillin"]', '["Mild asthma"]', '["Salbutamol inhaler (as needed)"]');
  insertStudent.run(ids.priya, '102203588', 'Electronics & Communication', 2, 'Female', '2006-07-02', 'O+', 'Hostel E', '118',
    null, null, null, '[]', '[]', '[]');
  insertStudent.run(ids.rohan, '102403011', 'Mechanical Engineering', 1, 'Male', null, null, 'Hostel H', '305',
    null, null, null, '[]', '[]', '[]');

  const insertDoctor = db.prepare(
    `INSERT INTO doctor_profiles (user_id, specialty, qualifications, experience_years, bio, languages, room, slot_minutes,
       is_accepting, is_visiting, consultation_modes)
     VALUES (?, ?, ?, ?, NULL, '["English","Hindi"]', ?, ?, ?, ?, ?)`,
  );
  insertDoctor.run(ids.ritu, 'General Medicine', 'M.B.B.S, PGDHA', 23, 'OPD 1', 15, 1, 0, '["in_person","video"]');
  insertDoctor.run(ids.ajay, 'Paediatrics & Adolescent Health', 'M.B.B.S, M.D (Pediatrics)', 46, 'OPD 2', 15, 1, 0, '["in_person"]');
  insertDoctor.run(ids.pooja, 'Dental Surgery', 'B.D.S, M.D.S', 8, 'Dental Room', 20, 0, 1, '["in_person"]');

  const insertBlock = db.prepare('INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
  for (const wd of [1, 2, 3, 4, 5]) {
    insertBlock.run(ids.ritu, wd, '09:00', '13:00');
    insertBlock.run(ids.ritu, wd, '14:00', '18:00');
  }
  insertBlock.run(ids.ritu, 6, '10:00', '13:00');
  insertBlock.run(ids.ritu, 0, '10:00', '13:00');
  for (const wd of [0, 1, 2, 3, 4, 5, 6]) insertBlock.run(ids.ajay, wd, '09:00', '13:00');
  for (const wd of [1, 3, 6]) insertBlock.run(ids.pooja, wd, '10:00', '13:00');

  const insertStaff = db.prepare('INSERT INTO staff_profiles (user_id, designation, qualifications, experience_years, shift) VALUES (?, ?, ?, ?, ?)');
  insertStaff.run(ids.abhishek, 'Associate (Pharmacist)', 'D-Pharma, B-Pharma', 12, 'Morning');
  insertStaff.run(ids.vishal, 'Faculty-in-Charge, Health Centre', null, null, null);

  const insertMed = db.prepare(
    `INSERT INTO medicines (name, generic_name, category, form, strength, unit, requires_prescription, stock_quantity, min_stock,
       batch_no, expiry_date, unit_price, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'B-001', ?, ?, ?, ?, ?)`,
  );
  ids.paracetamol = Number(
    insertMed.run('Paracetamol 500 mg', 'Paracetamol', 'Pain & Fever', 'Tablet', '500 mg', 'strip of 10', 0, 100, 20, '2027-06-30', 12, 1, now, now)
      .lastInsertRowid,
  );
  ids.amoxicillin = Number(
    insertMed.run('Amoxicillin 500 mg', 'Amoxicillin', 'Antibiotics', 'Capsule', '500 mg', 'strip of 10', 1, 50, 10, '2026-12-20', 65, 1, now, now)
      .lastInsertRowid,
  );
  ids.cetirizine = Number(
    insertMed.run('Cetirizine 10 mg', 'Cetirizine', 'Allergy & Cold', 'Tablet', '10 mg', 'strip of 10', 0, 5, 20, '2026-10-01', 18, 0, now, now)
      .lastInsertRowid,
  );
  return ids;
}

let appInstance: ReturnType<typeof createApp> | null = null;
export function app() {
  if (!appInstance) appInstance = createApp();
  return appInstance;
}

export async function loginAs(email: string, password = PASSWORD): Promise<string> {
  const res = await request(app()).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export const api = {
  get: (token: string, url: string) => request(app()).get(url).set(bearer(token)),
  post: (token: string, url: string, body?: object) => request(app()).post(url).set(bearer(token)).send(body ?? {}),
  put: (token: string, url: string, body?: object) => request(app()).put(url).set(bearer(token)).send(body ?? {}),
  patch: (token: string, url: string, body?: object) => request(app()).patch(url).set(bearer(token)).send(body ?? {}),
  del: (token: string, url: string) => request(app()).delete(url).set(bearer(token)),
};
