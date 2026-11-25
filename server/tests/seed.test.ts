import { beforeAll, describe, expect, it } from 'vitest';
import { EXPIRY_WARNING_DAYS } from '@shared/constants';
import { db, initSchema } from '../src/db';
import { resetDatabase, seedDatabase } from '../src/db/seed';
import { addDaysStr, todayStr } from '../src/lib/time';

const count = (sql: string, ...params: unknown[]) => (db.prepare(sql).get(...params) as { c: number }).c;

describe('demo seed data', () => {
  let seedMs = 0;

  beforeAll(() => {
    initSchema();
    const started = Date.now();
    seedDatabase();
    seedMs = Date.now() - started;
  });

  it('seeds quickly', () => {
    expect(seedMs).toBeLessThan(1500);
  });

  it('has exactly one primary demo identity per role with stable ids', () => {
    const rows = db.prepare('SELECT id, role, name FROM users WHERE is_demo = 1 ORDER BY id').all() as {
      id: number;
      role: string;
      name: string;
    }[];
    expect(rows).toEqual([
      { id: 1, role: 'student', name: 'Aarav Mehta' },
      { id: 2, role: 'doctor', name: 'Dr. Ritu Bassi' },
      { id: 3, role: 'staff', name: 'Abhishek Bhardwaj' },
      { id: 4, role: 'admin', name: 'Dr. Vishal Srivastava' },
    ]);
  });

  it('has doctors with weekly schedules and one inactive student', () => {
    expect(count("SELECT COUNT(*) AS c FROM users WHERE role = 'doctor' AND is_active = 1")).toBeGreaterThanOrEqual(9);
    expect(
      count(
        "SELECT COUNT(*) AS c FROM users u WHERE u.role = 'doctor' AND NOT EXISTS (SELECT 1 FROM doctor_schedules s WHERE s.doctor_id = u.id)",
      ),
    ).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM users WHERE role = 'student'")).toBe(24);
    expect(count("SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND is_active = 0")).toBe(1);
  });

  it('keeps inventory consistent with stock movements', () => {
    expect(count('SELECT COUNT(*) AS c FROM medicines WHERE stock_quantity < 0')).toBe(0);
    expect(count('SELECT COUNT(*) AS c FROM stock_movements WHERE balance_after < 0')).toBe(0);
    const mismatches = db
      .prepare(
        `SELECT m.name FROM medicines m
          WHERE m.stock_quantity <> (SELECT COALESCE(SUM(quantity_change), 0) FROM stock_movements s WHERE s.medicine_id = m.id)`,
      )
      .all();
    expect(mismatches).toEqual([]);
    // running balance: the last movement's balance equals current stock
    const badBalance = db
      .prepare(
        `SELECT m.name FROM medicines m
          WHERE m.stock_quantity <> (SELECT balance_after FROM stock_movements s WHERE s.medicine_id = m.id
                                      ORDER BY s.created_at DESC, s.id DESC LIMIT 1)`,
      )
      .all();
    expect(badBalance).toEqual([]);
    // every fulfilled request deducted stock exactly once per item
    expect(
      count(
        `SELECT COUNT(*) AS c FROM medicine_request_items i JOIN medicine_requests r ON r.id = i.request_id
          WHERE r.status = 'fulfilled' AND NOT EXISTS (
            SELECT 1 FROM stock_movements s WHERE s.request_id = r.id AND s.medicine_id = i.medicine_id AND s.type = 'dispense')`,
      ),
    ).toBe(0);
    expect(
      count(
        `SELECT COUNT(*) AS c FROM stock_movements s JOIN medicine_requests r ON r.id = s.request_id
          WHERE s.type = 'dispense' AND r.status <> 'fulfilled'`,
      ),
    ).toBe(0);
  });

  it('has the intended inventory alert mix', () => {
    const today = todayStr();
    expect(count('SELECT COUNT(*) AS c FROM medicines WHERE stock_quantity > 0 AND stock_quantity <= min_stock')).toBe(5);
    expect(count('SELECT COUNT(*) AS c FROM medicines WHERE stock_quantity = 0')).toBe(2);
    expect(count('SELECT COUNT(*) AS c FROM medicines WHERE expiry_date < ?', today)).toBe(1);
    expect(
      count(
        'SELECT COUNT(*) AS c FROM medicines WHERE expiry_date >= ? AND expiry_date <= ?',
        today,
        addDaysStr(today, EXPIRY_WARNING_DAYS),
      ),
    ).toBe(4);
    const categories = count('SELECT COUNT(DISTINCT category) AS c FROM medicines');
    expect(categories).toBe(12);
  });

  it('never double-books a doctor slot or a student', () => {
    expect(
      count(
        `SELECT COUNT(*) AS c FROM (SELECT doctor_id, date, start_time FROM appointments WHERE status <> 'cancelled'
           GROUP BY doctor_id, date, start_time HAVING COUNT(*) > 1)`,
      ),
    ).toBe(0);
    expect(
      count(
        `SELECT COUNT(*) AS c FROM appointments a JOIN appointments b
            ON a.student_id = b.student_id AND a.date = b.date AND a.id < b.id
           AND a.status <> 'cancelled' AND b.status <> 'cancelled'
           AND a.start_time < b.end_time AND b.start_time < a.end_time`,
      ),
    ).toBe(0);
  });

  it('documents every completed appointment', () => {
    expect(
      count(
        `SELECT COUNT(*) AS c FROM appointments a WHERE a.status = 'completed' AND NOT EXISTS (
           SELECT 1 FROM consultations c WHERE c.appointment_id = a.id AND c.status = 'completed')`,
      ),
    ).toBe(0);
    expect(
      count(
        `SELECT COUNT(*) AS c FROM appointments a WHERE a.status = 'completed' AND NOT EXISTS (
           SELECT 1 FROM medical_records r WHERE r.appointment_id = a.id AND r.category = 'visit_summary')`,
      ),
    ).toBe(0);
    expect(
      count('SELECT COUNT(*) AS c FROM prescription_items i LEFT JOIN medicines m ON m.id = i.medicine_id WHERE m.id IS NULL'),
    ).toBe(0);
    expect(count('SELECT COUNT(*) AS c FROM prescriptions p WHERE NOT EXISTS (SELECT 1 FROM prescription_items i WHERE i.prescription_id = p.id)')).toBe(0);
  });

  it('never prescribes a medicine the student is allergic to (penicillin check)', () => {
    expect(
      count(
        `SELECT COUNT(*) AS c FROM prescription_items i JOIN prescriptions p ON p.id = i.prescription_id
           JOIN student_profiles sp ON sp.user_id = p.student_id
          WHERE sp.allergies LIKE '%Penicillin%' AND i.medicine_name LIKE 'Amoxicillin%'`,
      ),
    ).toBe(0);
  });

  it('gives the demo student a realistic history', () => {
    const today = todayStr();
    expect(count("SELECT COUNT(*) AS c FROM appointments WHERE student_id = 1 AND status = 'scheduled' AND date > ?", today)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM appointments WHERE student_id = 1 AND date = ?', today)).toBe(0);
    expect(count("SELECT COUNT(*) AS c FROM appointments WHERE student_id = 1 AND status = 'completed'")).toBe(3);
    expect(count("SELECT COUNT(*) AS c FROM appointments WHERE student_id = 1 AND status = 'cancelled'")).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM prescriptions WHERE student_id = 1')).toBe(3);
    expect(count('SELECT COUNT(*) AS c FROM medical_records WHERE student_id = 1')).toBe(5);
    expect(count("SELECT COUNT(*) AS c FROM medical_records WHERE student_id = 1 AND file_path IS NOT NULL")).toBe(2);
    expect(count("SELECT COUNT(*) AS c FROM medicine_requests WHERE student_id = 1 AND status = 'fulfilled'")).toBe(1);
    expect(count("SELECT COUNT(*) AS c FROM medicine_requests WHERE student_id = 1 AND status = 'preparing'")).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM notifications WHERE user_id = 1')).toBeGreaterThanOrEqual(8);
    expect(count('SELECT COUNT(*) AS c FROM emergencies WHERE student_id = 1')).toBe(0);
    expect(count('SELECT COUNT(*) AS c FROM conversations WHERE student_id = 1 AND doctor_id = 2')).toBe(1);
  });

  it('has the expected medicine request status mix', () => {
    const rows = db.prepare('SELECT status, COUNT(*) AS c FROM medicine_requests GROUP BY status').all() as {
      status: string;
      c: number;
    }[];
    const by = Object.fromEntries(rows.map((r) => [r.status, r.c]));
    expect(by).toEqual({
      submitted: 4,
      approved: 2,
      preparing: 2,
      ready_for_pickup: 2,
      out_for_delivery: 1,
      fulfilled: 14,
      rejected: 2,
      cancelled: 1,
    });
    // open requests can always be processed: reserved quantities fit current stock
    const short = db
      .prepare(
        `SELECT m.name FROM medicines m JOIN (
            SELECT i.medicine_id, SUM(i.quantity) AS q FROM medicine_request_items i
              JOIN medicine_requests r ON r.id = i.request_id
             WHERE r.status IN ('submitted','approved','preparing','ready_for_pickup','out_for_delivery')
             GROUP BY i.medicine_id) o ON o.medicine_id = m.id
          WHERE o.q > m.stock_quantity`,
      )
      .all();
    expect(short).toEqual([]);
  });

  it('has one active emergency and resolved history', () => {
    expect(count("SELECT COUNT(*) AS c FROM emergencies WHERE status = 'resolved'")).toBe(5);
    expect(count("SELECT COUNT(*) AS c FROM emergencies WHERE status = 'acknowledged'")).toBe(1);
  });

  it('never stores timestamps in the future', () => {
    const now = new Date(Date.now() + 1000).toISOString();
    for (const [table, column] of [
      ['activity_logs', 'created_at'],
      ['notifications', 'created_at'],
      ['status_events', 'created_at'],
      ['stock_movements', 'created_at'],
      ['messages', 'created_at'],
      ['medicine_requests', 'updated_at'],
      ['appointments', 'created_at'],
    ] as const) {
      expect(count(`SELECT COUNT(*) AS c FROM ${table} WHERE ${column} > ?`, now), `${table}.${column}`).toBe(0);
    }
    expect(count('SELECT COUNT(*) AS c FROM activity_logs')).toBeGreaterThan(100);
  });

  it('resets cleanly and repeatedly with stable demo ids', () => {
    const before = count('SELECT COUNT(*) AS c FROM appointments');
    resetDatabase();
    resetDatabase();
    expect(count('SELECT COUNT(*) AS c FROM appointments')).toBe(before);
    expect(count('SELECT COUNT(*) AS c FROM sessions')).toBe(0);
    const ids = db.prepare('SELECT id FROM users WHERE is_demo = 1 ORDER BY id').all() as { id: number }[];
    expect(ids.map((r) => r.id)).toEqual([1, 2, 3, 4]);
    expect((db.prepare("SELECT value FROM meta WHERE key = 'seeded_at'").get() as { value: string }).value).toBeTruthy();
  });
});
