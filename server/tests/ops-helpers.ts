/**
 * Self-contained fixtures for the OPS test suites (no dependency on the demo seed).
 * Sessions are minted directly, so these tests don't depend on the auth routes either.
 */
import bcrypt from 'bcryptjs';
import type { Role } from '@shared/constants';
import { createApp } from '../src/app';
import { db, initSchema } from '../src/db';
import { addDaysStr, nowIso, todayStr } from '../src/lib/time';
import { createSession } from '../src/middleware/auth';

const HASH = bcrypt.hashSync('demo1234', 4);
let counter = 0;

export function bootstrap() {
  initSchema();
  return createApp();
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export interface TestUser {
  id: number;
  token: string;
  name: string;
}

export function createUser(role: Role, name?: string): TestUser {
  counter++;
  const displayName = name ?? `Ops ${role} ${counter}`;
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO users (role, name, email, password_hash, phone, title, avatar_color, is_active, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, '#0d9488', 1, 0, ?)`,
    )
    .run(role, displayName, `ops.${role}.${counter}@test.local`, HASH, '+91 98000 0000' + (counter % 10), null, now);
  const id = Number(info.lastInsertRowid);
  if (role === 'student') {
    db.prepare(
      `INSERT INTO student_profiles (user_id, roll_no, department, program, year, blood_group, hostel, room, allergies, conditions)
       VALUES (?, ?, 'Computer Science & Engineering', 'B.E.', 3, 'B+', 'Hostel J', '214', '["Penicillin"]', '["Mild asthma"]')`,
    ).run(id, `OPS${100000 + counter}`);
  } else if (role === 'doctor') {
    db.prepare(
      `INSERT INTO doctor_profiles (user_id, specialty, qualifications) VALUES (?, 'General Medicine', 'M.B.B.S')`,
    ).run(id);
  } else {
    db.prepare(`INSERT INTO staff_profiles (user_id, designation) VALUES (?, ?)`).run(
      id,
      role === 'staff' ? 'Pharmacist' : 'Administrator',
    );
  }
  return { id, token: createSession(id), name: displayName };
}

export interface MedOptions {
  name?: string;
  stock?: number;
  min?: number;
  expiry?: string | null;
  rx?: boolean;
  active?: boolean;
  category?: string;
  unit?: string;
}

export function createMed(opts: MedOptions = {}): number {
  counter++;
  const now = nowIso();
  const info = db
    .prepare(
      `INSERT INTO medicines (name, generic_name, category, form, strength, unit, description, usage_instructions,
         requires_prescription, stock_quantity, min_stock, batch_no, expiry_date, manufacturer, unit_price, is_active,
         created_at, updated_at)
       VALUES (?, NULL, ?, 'Tablet', '500 mg', ?, NULL, NULL, ?, ?, ?, 'B-OPS', ?, 'Test Pharma', 12.5, ?, ?, ?)`,
    )
    .run(
      opts.name ?? `Ops Med ${counter}`,
      opts.category ?? 'Pain & Fever',
      opts.unit ?? 'strip of 10',
      opts.rx ? 1 : 0,
      opts.stock ?? 100,
      opts.min ?? 10,
      opts.expiry === undefined ? addDaysStr(todayStr(), 365) : opts.expiry,
      opts.active === false ? 0 : 1,
      now,
      now,
    );
  return Number(info.lastInsertRowid);
}

export function createPrescription(
  studentId: number,
  doctorId: number,
  items: { medicineId: number; quantity: number }[],
  validUntil = addDaysStr(todayStr(), 30),
): { id: number; code: string } {
  counter++;
  const code = `RX-OPS${counter}`;
  const info = db
    .prepare(
      `INSERT INTO prescriptions (code, student_id, doctor_id, diagnosis, notes, valid_until, created_at)
       VALUES (?, ?, ?, 'Viral fever', NULL, ?, ?)`,
    )
    .run(code, studentId, doctorId, validUntil, nowIso());
  const id = Number(info.lastInsertRowid);
  const insert = db.prepare(
    `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, frequency, duration_days, quantity)
     VALUES (?, ?, (SELECT name FROM medicines WHERE id = ?), '1 tablet', 'BD', 5, ?)`,
  );
  for (const item of items) insert.run(id, item.medicineId, item.medicineId, item.quantity);
  return { id, code };
}

export const stockOf = (medicineId: number): number =>
  (db.prepare('SELECT stock_quantity AS s FROM medicines WHERE id = ?').get(medicineId) as { s: number }).s;

export const notificationCount = (userId: number): number =>
  (db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?').get(userId) as { c: number }).c;

export const latestNotification = (userId: number) =>
  db
    .prepare('SELECT title, body, link FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1')
    .get(userId) as { title: string; body: string; link: string } | undefined;

export const dispenseCount = (requestId: number): number =>
  (
    db.prepare("SELECT COUNT(*) AS c FROM stock_movements WHERE request_id = ? AND type = 'dispense'").get(requestId) as {
      c: number;
    }
  ).c;
