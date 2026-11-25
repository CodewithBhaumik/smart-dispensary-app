/**
 * Demo dataset for Smart Dispensary.
 *
 * - Deterministic (seeded PRNG) and anchored to the current local date, so dashboards
 *   always look "live" right after seeding or resetting.
 * - Internally consistent: every fulfilled request / counter dispense has a stock
 *   movement, stock levels equal the sum of their movements, timelines are ordered,
 *   no doctor slot or student time is double-booked.
 */
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import {
  DEMO_PASSWORD,
  FREQUENCIES,
  PRESCRIPTION_VALIDITY_DAYS,
  type AppointmentMode,
  type AppointmentStatus,
  type FulfilmentMethod,
  type RequestStatus,
  type Role,
} from '@shared/constants';
import { db, setMeta, tx, UPLOADS_DIR } from '../index';
import {
  addDaysStr,
  dateOfIso,
  fromMinutes,
  localIso,
  nowIso,
  parseDateStr,
  todayStr,
  toMinutes,
  weekdayOf,
} from '../../lib/time';
import { ALLERGY_CONFLICTS, TEMPLATES, type ClinicalTemplate, type RxSpec } from './clinical';
import { MEDICINES, type MedicineSeed } from './medicines';
import { buildPdf, type PdfLine } from './pdf';
import {
  ADMINS,
  AVATAR_COLORS,
  DOCTORS,
  STAFF,
  STUDENTS,
  batchFor,
  type DoctorSeed,
  type StaffSeed,
  type StudentSeed,
  type TemplateGroup,
} from './people';
import { createRng, type Rng } from './rng';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let cachedHash: string | null = null;
function passwordHash(): string {
  if (!cachedHash) cachedHash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  return cachedHash;
}

/** Inserts the complete demo dataset. Assumes the tables are empty. */
export function seedDatabase(): void {
  const hash = passwordHash();
  tx(() => {
    new DemoSeeder(hash).run();
    setMeta('seeded_at', nowIso());
  });
}

/** Wipes every table (and uploaded files that belong to the data) and reloads the demo dataset. */
export function resetDatabase(): void {
  passwordHash(); // hash outside the transaction
  for (const file of uploadedFiles()) safeUnlink(path.join(UPLOADS_DIR, file));
  tx(() => {
    wipeAllTables();
    seedDatabase();
  });
}

const WIPE_ORDER = [
  'sessions',
  'notifications',
  'activity_logs',
  'status_events',
  'messages',
  'calls',
  'conversations',
  'medical_records',
  'stock_movements',
  'medicine_request_items',
  'medicine_requests',
  'prescription_items',
  'prescriptions',
  'consultations',
  'appointments',
  'emergencies',
  'doctor_leaves',
  'doctor_schedules',
  'student_profiles',
  'doctor_profiles',
  'staff_profiles',
  'medicines',
  'users',
  'meta',
];

function wipeAllTables(): void {
  for (const table of WIPE_ORDER) db.prepare(`DELETE FROM ${table}`).run();
  try {
    db.prepare('DELETE FROM sqlite_sequence').run();
  } catch {
    /* sqlite_sequence only exists once an AUTOINCREMENT table has rows */
  }
}

/**
 * Files that belong to the current dataset: everything referenced by medical records plus
 * the generated seed documents. (Unreferenced files are left alone so a test database
 * sharing the uploads folder can never delete another database's files.)
 */
function uploadedFiles(): string[] {
  const files = new Set<string>();
  try {
    const rows = db.prepare('SELECT file_path FROM medical_records WHERE file_path IS NOT NULL').all() as {
      file_path: string;
    }[];
    for (const r of rows) files.add(path.basename(r.file_path));
  } catch {
    /* table may not exist yet */
  }
  try {
    for (const name of fs.readdirSync(UPLOADS_DIR)) if (name.startsWith('seed-')) files.add(name);
  } catch {
    /* uploads folder missing */
  }
  return [...files];
}

function safeUnlink(file: string): void {
  try {
    fs.unlinkSync(file);
  } catch {
    /* already gone or locked */
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function fmtDay(date: string): string {
  const d = parseDateStr(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function fmtDayLong(date: string): string {
  const d = parseDateStr(date);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
function fmtDateFull(date: string): string {
  const d = parseDateStr(date);
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${suffix}`;
}
function fmtDuration(sec: number): string {
  return `${Math.floor(sec / 60)}m ${pad2(sec % 60)}s`;
}
const addMin = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------
// Internal records
// ---------------------------------------------------------------------------

interface DoctorRec extends DoctorSeed {
  id: number;
}
interface StaffRec extends StaffSeed {
  id: number;
}
interface StudentRec extends StudentSeed {
  id: number;
  createdAt: string;
  rollNo: string;
  active: boolean;
}
interface MedRec extends MedicineSeed {
  id: number;
  createdAt: string;
  batchNo: string;
  expiryDate: string;
}

interface Plan {
  student: StudentRec;
  doctor: DoctorRec;
  date: string;
  start: string;
  end: string;
  mode: AppointmentMode;
  tpl: ClinicalTemplate;
  notes: string | null;
  status: AppointmentStatus;
  createdAt: string;
  cancel?: { role: Role; actorId: number; actorName: string; reason: string; at: string };
  checkedInAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  tokenNo: number | null;
  rxOverride?: RxSpec[];
  rxMode?: 'counter' | 'request' | 'none';
  tag?: string;
}

interface RxInfo {
  id: number;
  code: string;
  student: StudentRec;
  doctor: DoctorRec;
  appointmentId: number;
  createdAt: string;
  validUntil: string;
  items: { med: MedRec; qty: number }[];
  mode: 'counter' | 'request' | 'none';
  used: boolean;
  tag?: string;
}

interface StockEvent {
  med: MedRec;
  type: 'dispense' | 'adjustment' | 'restock';
  qty: number; // positive magnitude
  at: string;
  requestId: number | null;
  reference: string | null;
  reason: string;
  by: number;
}

type TimeKey = 'created' | 'approved' | 'preparing' | 'ready' | 'dispatched' | 'fulfilled' | 'rejected' | 'cancelled';
type Times = Partial<Record<TimeKey, string>> & { created: string };

interface RequestPlan {
  student: StudentRec;
  status: RequestStatus;
  fulfilment: FulfilmentMethod;
  rx: RxInfo | null;
  items: { med: MedRec; qty: number }[];
  times: Times;
  notes: string | null;
  staffNotes: string | null;
  rejectionReason?: string;
  cancelReason?: string;
  tag?: string;
}

const RX_NOTES = [
  'Complete the full course even if you feel better.',
  'Drink plenty of water and rest well.',
  'Avoid outside food for a few days.',
  'Return to the OPD if symptoms worsen.',
];

const STUDENT_CANCEL_REASONS = [
  'Exam schedule clash',
  'Feeling better now',
  'Travelling home for the weekend',
  'Lab session rescheduled',
  'Booked the wrong slot',
];
const DOCTOR_CANCEL_REASONS = [
  'Doctor on emergency duty',
  'Doctor attending a medical camp',
  'Rescheduled due to OPD rush — please rebook',
];
const ADMIN_CANCEL_REASONS = ['Slot blocked for the vaccination drive', 'Health centre maintenance work'];

const REQUEST_NOTES = [
  'Please deliver after 6 PM — I have labs till then.',
  'I will collect it after my 4 PM class.',
  'Running out of my regular supply.',
  'Please pack the syrup carefully.',
];
const STAFF_NOTES = ['Packed with dosage labels.', 'Checked against the prescription.', 'Student informed by phone.'];

// ---------------------------------------------------------------------------
// Seeder
// ---------------------------------------------------------------------------

class DemoSeeder {
  private rng: Rng = createRng(20261125);
  private now = new Date();
  private nowMs = this.now.getTime();
  private nowIsoStr = this.now.toISOString();
  private today = todayStr();
  private nowMin = this.now.getHours() * 60 + this.now.getMinutes();
  private activityCutoff = localIso(addDaysStr(todayStr(), -30), '00:00');
  private codes = new Set<string>();
  private rolls = new Set<string>();

  private doctors: DoctorRec[] = [];
  private doc = new Map<string, DoctorRec>();
  private staffByKey = new Map<string, StaffRec>();
  private students: StudentRec[] = [];
  private stu = new Map<string, StudentRec>();
  private meds: MedRec[] = [];
  private med = new Map<string, MedRec>();
  private medById = new Map<number, MedRec>();

  private leaves = new Set<string>();
  private taken = new Set<string>();
  private busy = new Map<string, [number, number][]>();
  private docDay = new Set<string>();
  private plans: Plan[] = [];
  private apptIdByTag = new Map<string, number>();
  private apptPlanById = new Map<number, Plan>();
  private prescriptions: RxInfo[] = [];
  private stockEvents: StockEvent[] = [];
  private avail = new Map<number, number>();
  private requestIdByTag = new Map<string, number>();
  private convIdByPair = new Map<string, number>();
  private lastLogins = new Map<number, string>();
  private colorIndex = 0;

  constructor(private hash: string) {}

  run(): void {
    this.insertPeople();
    this.insertMedicines();
    this.insertLeaves();
    this.planAppointments();
    this.insertAppointments();
    this.insertRequests();
    this.addWalkInsAndAdjustments();
    this.finalizeStock();
    this.insertEmergencies();
    this.insertConversations();
    this.insertUploads();
    this.insertMiscNotifications();
    this.insertMiscActivity();
  }

  // -------------------------------------------------------------------------
  // Low-level helpers
  // -------------------------------------------------------------------------

  private get ritu() {
    return this.doc.get('ritu')!;
  }
  private get abhishek() {
    return this.staffByKey.get('abhishek')!;
  }
  private get vishal() {
    return this.staffByKey.get('vishal')!;
  }
  private get aarav() {
    return this.stu.get('aarav')!;
  }

  private code(prefix: 'APT' | 'RX' | 'MR' | 'EMG', length = 6): string {
    for (;;) {
      let c = `${prefix}-`;
      for (let i = 0; i < length; i++) c += CODE_ALPHABET[Math.floor(this.rng.next() * CODE_ALPHABET.length)];
      if (!this.codes.has(c)) {
        this.codes.add(c);
        return c;
      }
    }
  }

  private dayIso(daysFromToday: number, time: string): string {
    return localIso(addDaysStr(this.today, daysFromToday), time);
  }

  private minutesAgo(min: number): string {
    return new Date(this.nowMs - min * 60_000).toISOString();
  }

  /** Never allow a seeded timestamp in the future. */
  private past(iso: string, marginMin = 1): string {
    const limit = this.nowMs - marginMin * 60_000;
    return Date.parse(iso) > limit ? new Date(limit).toISOString() : iso;
  }

  private randTime(fromHour: number, toHour: number, step = 5): string {
    const from = fromHour * 60;
    const to = toHour * 60;
    return fromMinutes(from + step * this.rng.int(0, Math.floor((to - from) / step)));
  }

  private activity(
    actorId: number | null,
    action: string,
    category: string,
    description: string,
    entityType: string | null,
    entityId: number | null,
    at: string,
  ): void {
    if (at < this.activityCutoff || Date.parse(at) > this.nowMs) return;
    db.prepare(
      `INSERT INTO activity_logs (actor_id, action, category, description, entity_type, entity_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(actorId, action, category, description, entityType, entityId, at);
  }

  private notify(
    userId: number,
    type: string,
    title: string,
    body: string,
    link: string | null,
    at: string,
    isRead: boolean,
  ): void {
    db.prepare(
      'INSERT INTO notifications (user_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(userId, type, title, body, link, isRead ? 1 : 0, this.past(at));
  }

  private statusEvent(entity: string, id: number, status: string, note: string | null, actorId: number | null, at: string) {
    db.prepare(
      'INSERT INTO status_events (entity_type, entity_id, status, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(entity, id, status, note, actorId, at);
  }

  private nextColor(): string {
    return AVATAR_COLORS[this.colorIndex++ % AVATAR_COLORS.length];
  }

  /** Pharmacist on shift at the given time. */
  private pharmacistAt(iso: string): StaffRec {
    const d = new Date(iso);
    const m = d.getHours() * 60 + d.getMinutes();
    if (m >= 510 && m < 870) return this.rng.chance(0.75) ? this.abhishek : this.staffByKey.get('anish')!;
    if (m >= 870 && m < 1230) return this.staffByKey.get('kamalpreet')!;
    return this.staffByKey.get('arjun')!;
  }

  /** Nurse / medical assistant who checks patients in at the given time. */
  private checkInStaff(iso: string): StaffRec {
    const d = new Date(iso);
    const m = d.getHours() * 60 + d.getMinutes();
    if (m < 510 || m >= 1230) return this.staffByKey.get('avtar')!;
    if (m < 870) return this.staffByKey.get('satvir')!;
    return this.staffByKey.get('jasmine')!;
  }

  // -------------------------------------------------------------------------
  // People
  // -------------------------------------------------------------------------

  private insertUser(u: {
    role: Role;
    name: string;
    email: string;
    phone: string;
    title: string;
    isActive: boolean;
    isDemo: boolean;
    createdAt: string;
  }): number {
    const info = db
      .prepare(
        `INSERT INTO users (role, name, email, password_hash, phone, title, avatar_color, is_active, is_demo, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        u.role,
        u.name,
        u.email,
        this.hash,
        u.phone,
        u.title,
        this.nextColor(),
        u.isActive ? 1 : 0,
        u.isDemo ? 1 : 0,
        u.createdAt,
      );
    return Number(info.lastInsertRowid);
  }

  private addStudent(s: StudentSeed): void {
    const createdAt = this.dayIso(-s.createdDaysAgo, s.key === 'gurleen' ? '11:20' : '10:00');
    let rollNo = s.rollNo;
    while (!rollNo || this.rolls.has(rollNo)) {
      rollNo = `10${batchFor(s.year)}${s.deptCode}${String(this.rng.int(100, 699)).padStart(3, '0')}`;
    }
    this.rolls.add(rollNo);
    const email = `${s.name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.')}@smartdispensary.in`;
    const id = this.insertUser({
      role: 'student',
      name: s.name,
      email,
      phone: s.phone,
      title: `${s.program} · ${s.department} · Year ${s.year}`,
      isActive: !s.inactive,
      isDemo: !!s.demo,
      createdAt,
    });
    db.prepare(
      `INSERT INTO student_profiles (user_id, roll_no, department, program, year, gender, date_of_birth, blood_group,
         hostel, room, emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
         allergies, conditions, medications, height_cm, weight_kg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      rollNo,
      s.department,
      s.program,
      s.year,
      s.gender,
      s.dob,
      s.bloodGroup,
      s.hostel,
      s.room,
      s.contactName,
      s.contactPhone,
      s.contactRelation,
      JSON.stringify(s.allergies),
      JSON.stringify(s.conditions),
      JSON.stringify(s.medications),
      s.heightCm,
      s.weightKg,
    );
    const rec: StudentRec = { ...s, id, createdAt, rollNo, active: !s.inactive };
    this.students.push(rec);
    this.stu.set(s.key, rec);
  }

  private addDoctor(d: DoctorSeed): void {
    const id = this.insertUser({
      role: 'doctor',
      name: d.name,
      email: d.email,
      phone: d.phone,
      title: d.title,
      isActive: true,
      isDemo: !!d.demo,
      createdAt: this.dayIso(-d.createdDaysAgo, '09:30'),
    });
    db.prepare(
      `INSERT INTO doctor_profiles (user_id, specialty, qualifications, experience_years, bio, languages, room,
         slot_minutes, is_accepting, is_visiting, consultation_modes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(
      id,
      d.specialty,
      d.qualifications,
      d.experience,
      d.bio,
      JSON.stringify(d.languages),
      d.room,
      d.slot,
      d.visiting ? 1 : 0,
      JSON.stringify(d.modes),
    );
    const insertBlock = db.prepare(
      'INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)',
    );
    for (const block of d.schedule) for (const day of block.days) insertBlock.run(id, day, block.start, block.end);
    const rec: DoctorRec = { ...d, id };
    this.doctors.push(rec);
    this.doc.set(d.key, rec);
  }

  private addStaff(s: StaffSeed): void {
    const id = this.insertUser({
      role: s.role,
      name: s.name,
      email: s.email,
      phone: s.phone,
      title: s.designation,
      isActive: true,
      isDemo: !!s.demo,
      createdAt: this.dayIso(-s.createdDaysAgo, '09:00'),
    });
    db.prepare(
      'INSERT INTO staff_profiles (user_id, designation, qualifications, experience_years, shift) VALUES (?, ?, ?, ?, ?)',
    ).run(id, s.designation, s.qualifications, s.experience, s.shift);
    this.staffByKey.set(s.key, { ...s, id });
  }

  private insertPeople(): void {
    // Primary demo identities first so their ids are stable: 1 student, 2 doctor, 3 staff, 4 admin.
    this.addStudent(STUDENTS[0]);
    this.addDoctor(DOCTORS[0]);
    this.addStaff(STAFF[0]);
    this.addStaff(ADMINS[0]);
    for (const d of DOCTORS.slice(1)) this.addDoctor(d);
    for (const s of STAFF.slice(1)) this.addStaff(s);
    this.addStaff(ADMINS[1]);
    for (const s of STUDENTS.slice(1)) this.addStudent(s);

    // Last sign-ins (and matching auth.login activity).
    const setLogin = (id: number, name: string, at: string) => {
      db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(at, id);
      this.lastLogins.set(id, at);
      this.activity(id, 'auth.login', 'auth', `${name} signed in`, 'user', id, at);
    };
    setLogin(this.aarav.id, this.aarav.name, this.minutesAgo(26 * 60 + 14));
    setLogin(this.ritu.id, this.ritu.name, this.minutesAgo(3 * 60 + 8));
    setLogin(this.abhishek.id, this.abhishek.name, this.minutesAgo(5 * 60 + 41));
    setLogin(this.vishal.id, this.vishal.name, this.minutesAgo(20 * 60 + 3));
    for (const d of this.doctors.slice(1)) {
      if (this.rng.chance(0.8)) setLogin(d.id, d.name, this.minutesAgo(this.rng.int(2, 6 * 24) * 60 + this.rng.int(0, 59)));
    }
    for (const s of this.staffByKey.values()) {
      if (s.demo) continue;
      if (this.rng.chance(0.8)) setLogin(s.id, s.name, this.minutesAgo(this.rng.int(2, 5 * 24) * 60 + this.rng.int(0, 59)));
    }
    for (const s of this.students.slice(1)) {
      if (!s.active || !this.rng.chance(0.7)) continue;
      const at = this.minutesAgo(this.rng.int(4, 9 * 24) * 60 + this.rng.int(0, 59));
      if (at > s.createdAt) setLogin(s.id, s.name, at);
    }
  }

  // -------------------------------------------------------------------------
  // Medicines
  // -------------------------------------------------------------------------

  private insertMedicines(): void {
    const insert = db.prepare(
      `INSERT INTO medicines (name, generic_name, category, form, strength, unit, description, usage_instructions,
         requires_prescription, stock_quantity, min_stock, batch_no, expiry_date, manufacturer, unit_price,
         is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    );
    for (const m of MEDICINES) {
      const createdAt = m.addedDaysAgo ? this.dayIso(-m.addedDaysAgo, '10:15') : this.dayIso(-60, '09:00');
      const expiryDate = addDaysStr(this.today, m.expiryDays);
      const mfgMonth = this.rng.int(1, 12);
      const batchNo = `${m.batch}${this.rng.pick(['25', '26'])}${pad2(mfgMonth)}${this.rng.pick(['A', 'B', 'C', 'D'])}`;
      const info = insert.run(
        m.name,
        m.generic,
        m.category,
        m.form,
        m.strength,
        m.unit,
        m.description,
        m.usage,
        m.rx ? 1 : 0,
        m.target,
        m.minStock,
        batchNo,
        expiryDate,
        m.manufacturer,
        m.price,
        createdAt,
        createdAt,
      );
      const rec: MedRec = { ...m, id: Number(info.lastInsertRowid), createdAt, batchNo, expiryDate };
      this.meds.push(rec);
      this.med.set(m.name, rec);
      this.medById.set(rec.id, rec);
      this.avail.set(rec.id, m.target);
    }
  }

  private m(name: string): MedRec {
    const rec = this.med.get(name);
    if (!rec) throw new Error(`Seed: unknown medicine "${name}"`);
    return rec;
  }

  // -------------------------------------------------------------------------
  // Scheduling helpers
  // -------------------------------------------------------------------------

  private slotsFor(d: DoctorRec, date: string): { start: string; end: string }[] {
    const wd = weekdayOf(date);
    const out: { start: string; end: string }[] = [];
    for (const block of d.schedule) {
      if (!block.days.includes(wd)) continue;
      for (let t = toMinutes(block.start); t + d.slot <= toMinutes(block.end); t += d.slot) {
        out.push({ start: fromMinutes(t), end: fromMinutes(t + d.slot) });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  private canBook(s: StudentRec, d: DoctorRec, date: string, start: string, end: string): boolean {
    if (this.leaves.has(`${d.id}|${date}`)) return false;
    if (this.taken.has(`${d.id}|${date}|${start}`)) return false;
    if (this.docDay.has(`${s.id}|${d.id}|${date}`)) return false;
    const a = toMinutes(start);
    const b = toMinutes(end);
    return (this.busy.get(`${s.id}|${date}`) ?? []).every(([x, y]) => b <= x || a >= y);
  }

  private reserve(p: Plan): void {
    this.taken.add(`${p.doctor.id}|${p.date}|${p.start}`);
    this.docDay.add(`${p.student.id}|${p.doctor.id}|${p.date}`);
    const key = `${p.student.id}|${p.date}`;
    const list = this.busy.get(key) ?? [];
    list.push([toMinutes(p.start), toMinutes(p.end)]);
    this.busy.set(key, list);
    this.plans.push(p);
  }

  /** Nearest date (in [minOff, maxOff] days from today) on which the doctor has the given slot. */
  private nearestDay(d: DoctorRec, target: number, minOff: number, maxOff: number, time: string): string {
    const offsets: number[] = [];
    for (let o = minOff; o <= maxOff; o++) offsets.push(o);
    offsets.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b);
    for (const o of offsets) {
      const date = addDaysStr(this.today, o);
      if (this.slotsFor(d, date).some((s) => s.start === time) && !this.leaves.has(`${d.id}|${date}`)) return date;
    }
    throw new Error(`Seed: no working day for ${d.name} near ${target}`);
  }

  private templatesFor(group: TemplateGroup, s: StudentRec): ClinicalTemplate[] {
    return TEMPLATES.filter((t) => t.group === group && (!t.female || s.gender === 'Female'));
  }

  private pickTemplate(d: DoctorRec, s: StudentRec): ClinicalTemplate {
    const list = this.templatesFor(d.group, s);
    return this.rng.weighted(list.map((t) => [t, t.weight] as const));
  }

  private pickMode(d: DoctorRec, tpl: ClinicalTemplate): AppointmentMode {
    if (!d.modes.includes('video') || tpl.videoOk === false) return 'in_person';
    return this.rng.chance(d.key === 'ishita' ? 0.4 : 0.15) ? 'video' : 'in_person';
  }

  private eligibleStudents(before: string): StudentRec[] {
    return this.students.filter((s) => s.active && !s.demo && s.createdAt < before);
  }

  private makePlan(
    s: StudentRec,
    d: DoctorRec,
    date: string,
    slot: { start: string; end: string },
    status: AppointmentStatus,
    createdAt: string,
    extra: Partial<Plan> = {},
  ): Plan {
    const tpl = extra.tpl ?? this.pickTemplate(d, s);
    return {
      student: s,
      doctor: d,
      date,
      start: slot.start,
      end: slot.end,
      mode: extra.mode ?? this.pickMode(d, tpl),
      tpl,
      notes: extra.notes !== undefined ? extra.notes : this.rng.chance(0.45) ? this.rng.pick(tpl.studentNotes) : null,
      status,
      createdAt,
      checkedInAt: null,
      startedAt: null,
      completedAt: null,
      tokenNo: null,
      ...extra,
    };
  }

  /** Fill check-in / start / completion timestamps for a completed appointment. */
  private completeTimes(p: Plan): void {
    const startIso = localIso(p.date, p.start);
    if (p.mode === 'in_person') p.checkedInAt = this.past(addMin(startIso, -this.rng.int(5, 20)), 6);
    p.startedAt = this.past(addMin(startIso, this.rng.int(0, 4)), 4);
    p.completedAt = this.past(addMin(p.startedAt, p.doctor.slot - this.rng.int(1, 4)), 1);
    if (p.completedAt <= p.startedAt) p.completedAt = addMin(p.startedAt, 2);
    if (p.checkedInAt && p.checkedInAt >= p.startedAt) p.checkedInAt = addMin(p.startedAt, -3);
  }

  private cancelPlan(p: Plan): void {
    const role = this.rng.weighted([
      ['student', 0.6],
      ['doctor', 0.3],
      ['admin', 0.1],
    ] as const) as Role;
    const startIso = localIso(p.date, p.start);
    const earliest = Date.parse(p.createdAt) + 30 * 60_000;
    const latest = Date.parse(startIso) - 30 * 60_000;
    const at =
      latest > earliest
        ? new Date(earliest + Math.floor(this.rng.next() * (latest - earliest))).toISOString()
        : addMin(p.createdAt, 10);
    const actor =
      role === 'student'
        ? { id: p.student.id, name: p.student.name }
        : role === 'doctor'
          ? { id: p.doctor.id, name: p.doctor.name }
          : this.rng.chance(0.5)
            ? { id: this.vishal.id, name: this.vishal.name }
            : { id: this.staffByKey.get('neha')!.id, name: 'Neha' };
    const reason =
      role === 'student'
        ? this.rng.pick(STUDENT_CANCEL_REASONS)
        : role === 'doctor'
          ? this.rng.pick(DOCTOR_CANCEL_REASONS)
          : this.rng.pick(ADMIN_CANCEL_REASONS);
    p.status = 'cancelled';
    p.cancel = { role, actorId: actor.id, actorName: actor.name, reason, at: this.past(at, 5) };
  }

  // -------------------------------------------------------------------------
  // Appointments — planning
  // -------------------------------------------------------------------------

  private insertLeaves(): void {
    const pooja = this.doc.get('pooja')!;
    for (let o = 5; o <= 12; o++) {
      const date = addDaysStr(this.today, o);
      if (this.slotsFor(pooja, date).length) {
        db.prepare('INSERT INTO doctor_leaves (doctor_id, date, reason) VALUES (?, ?, ?)').run(
          pooja.id,
          date,
          'Attending a dental conference',
        );
        this.leaves.add(`${pooja.id}|${date}`);
        const at = this.minutesAgo(2 * 24 * 60 + 130);
        this.activity(
          pooja.id,
          'availability.updated',
          'appointment',
          `${pooja.name} marked leave on ${fmtDay(date)} (Attending a dental conference)`,
          'user',
          pooja.id,
          at,
        );
        break;
      }
    }
  }

  private planAppointments(): void {
    this.planAaravAppointments();
    this.planToday();
    this.planPast();
    this.planFuture();
    this.assignTokens();
  }

  private planAaravAppointments(): void {
    const a = this.aarav;
    const jeevan = this.doc.get('jeevan')!;
    const arvind = this.doc.get('arvind')!;
    const mahroosh = this.doc.get('mahroosh')!;
    const ishita = this.doc.get('ishita')!;
    const tpl = (key: string) => TEMPLATES.find((t) => t.key === key)!;
    const slot = (d: DoctorRec, start: string) => ({ start, end: fromMinutes(toMinutes(start) + d.slot) });

    // ~T-40: viral fever, night OPD, dispensed at the counter.
    const d40 = this.nearestDay(jeevan, -40, -43, -37, '21:15');
    const p40 = this.makePlan(a, jeevan, d40, slot(jeevan, '21:15'), 'completed', localIso(d40, '19:40'), {
      tpl: tpl('viral-fever'),
      mode: 'in_person',
      notes: 'High fever since last night with body ache.',
      rxOverride: [
        { med: 'Paracetamol 650 mg', dosage: '1 tablet', freq: 'TDS', days: 3, instructions: 'After food' },
        { med: 'Cetirizine 10 mg', dosage: '1 tablet', freq: 'HS', days: 5, instructions: 'At bedtime' },
      ],
      rxMode: 'counter',
      tag: 'aarav-fever',
    });
    this.completeTimes(p40);
    this.reserve(p40);

    // T-18: allergic rhinitis with Dr. Ritu Bassi; medicines collected via a pickup request.
    const d18 = addDaysStr(this.today, -18);
    const p18 = this.makePlan(a, this.ritu, d18, slot(this.ritu, '10:30'), 'completed', localIso(addDaysStr(d18, -1), '20:05'), {
      tpl: tpl('allergic-rhinitis'),
      mode: 'in_person',
      notes: 'Continuous sneezing every morning and a blocked nose for a week.',
      rxOverride: [
        { med: 'Montelukast 10 mg + Levocetirizine 5 mg', dosage: '1 tablet', freq: 'HS', days: 10, instructions: 'At bedtime' },
        { med: 'Steam Inhalation Capsules', dosage: '1 capsule in hot water', freq: 'BD', days: 7, instructions: 'For steam inhalation only' },
        { med: 'Vitamin C 500 mg (Chewable)', dosage: '1 tablet', freq: 'OD', days: 10, instructions: 'After food' },
      ],
      rxMode: 'request',
      tag: 'aarav-rhinitis',
    });
    this.completeTimes(p18);
    this.reserve(p18);

    // ~T-10: cancelled by the student.
    const d10 = this.nearestDay(mahroosh, -10, -12, -8, '17:00');
    const p10 = this.makePlan(a, mahroosh, d10, slot(mahroosh, '17:00'), 'cancelled', localIso(addDaysStr(d10, -3), '18:00'), {
      tpl: tpl('headache'),
      mode: 'in_person',
      notes: 'Headaches in the evening after long study sessions.',
      tag: 'aarav-cancelled',
    });
    p10.cancel = {
      role: 'student',
      actorId: a.id,
      actorName: a.name,
      reason: 'Exam schedule clash',
      at: localIso(addDaysStr(d10, -1), '22:30'),
    };
    this.reserve(p10);

    // ~T-6: dermatology (acne); prescription not yet collected.
    const d6 = this.nearestDay(arvind, -6, -8, -4, '16:20');
    const p6 = this.makePlan(a, arvind, d6, slot(arvind, '16:20'), 'completed', localIso(addDaysStr(d6, -2), '22:10'), {
      tpl: tpl('acne'),
      mode: 'in_person',
      notes: 'Pimples on the forehead and cheeks for a few months.',
      rxOverride: [
        { med: 'Clindamycin 1% Gel', dosage: 'Apply thin layer', freq: 'HS', days: 42, instructions: 'Apply locally', notes: 'Apply at night on clean, dry skin' },
        { med: 'Benzoyl Peroxide 2.5% Gel', dosage: 'Apply thin layer', freq: 'OD', days: 42, instructions: 'Apply locally', notes: 'Morning application; may cause mild dryness' },
      ],
      rxMode: 'none',
      tag: 'aarav-acne',
    });
    this.completeTimes(p6);
    this.reserve(p6);

    // Upcoming video counselling session (T+3 or the next weekday).
    const dUp = this.nearestDay(ishita, 3, 3, 9, '11:30');
    const pUp = this.makePlan(a, ishita, dUp, slot(ishita, '11:30'), 'scheduled', this.dayIso(-2, '21:15'), {
      tpl: tpl('exam-stress'),
      mode: 'video',
      notes: 'Finding it hard to sleep before end-semester exams; would like to talk to someone.',
      tag: 'aarav-upcoming',
    });
    this.reserve(pUp);
  }

  private planToday(): void {
    const today = this.today;
    const pool = () => this.eligibleStudents(this.dayIso(-2, '00:00'));

    const planDay = (d: DoctorRec, slots: { start: string; end: string }[], markCheckIn: boolean) => {
      const futureSlots: Plan[] = [];
      for (const slot of slots) {
        const student = this.rng.shuffle(pool()).find((s) => this.canBook(s, d, today, slot.start, slot.end));
        if (!student) continue;
        const created = this.dayIso(-this.rng.int(1, 3), this.randTime(8, 22));
        const done = toMinutes(slot.start) + d.slot <= this.nowMin - 2;
        const p = this.makePlan(student, d, today, slot, done ? 'completed' : 'scheduled', created);
        if (done) this.completeTimes(p);
        else futureSlots.push(p);
        this.reserve(p);
      }
      futureSlots.sort((x, y) => x.start.localeCompare(y.start));
      const first = futureSlots[0];
      if (first && (markCheckIn || this.rng.chance(0.4))) {
        first.status = 'checked_in';
        first.mode = 'in_person';
        first.checkedInAt = this.minutesAgo(this.rng.int(3, 14));
      }
    };

    // Demo doctor: ~8 appointments spread across today's OPD.
    const ritu = this.ritu;
    const rituSlots = this.slotsFor(ritu, today);
    if (rituSlots.length) {
      const picks: { start: string; end: string }[] = [];
      const n = Math.min(8, rituSlots.length);
      for (let k = 0; k < n; k++) {
        const idx = Math.round((k * (rituSlots.length - 1)) / Math.max(1, n - 1));
        if (!picks.includes(rituSlots[idx])) picks.push(rituSlots[idx]);
      }
      planDay(ritu, picks, true);
    }

    for (const d of this.doctors) {
      if (d.key === 'ritu' || this.leaves.has(`${d.id}|${today}`)) continue;
      const slots = this.slotsFor(d, today);
      if (!slots.length) continue;
      planDay(d, this.rng.pickN(slots, this.rng.int(2, 4)), false);
    }
  }

  private planPast(): void {
    for (let off = 45; off >= 1; off--) {
      const date = addDaysStr(this.today, -off);
      for (const d of this.doctors) {
        const slots = this.slotsFor(d, date);
        if (!slots.length || this.leaves.has(`${d.id}|${date}`)) continue;
        const n = Math.round(d.load * (0.4 + this.rng.next() * 1.2));
        for (const slot of this.rng.pickN(slots, n)) {
          const createdDay = -off - this.rng.int(1, 4);
          const created = this.dayIso(createdDay, this.randTime(8, 22));
          const student = this.rng
            .shuffle(this.eligibleStudents(created))
            .find((s) => this.canBook(s, d, date, slot.start, slot.end));
          if (!student) continue;
          const p = this.makePlan(student, d, date, slot, 'completed', created);
          if (this.rng.chance(0.12)) this.cancelPlan(p);
          else this.completeTimes(p);
          this.reserve(p);
        }
      }
    }
  }

  private planFuture(): void {
    const target = 35;
    let created = 0;
    let rituCount = 0;
    const weights = this.doctors.map((d) => [d, d.key === 'ritu' ? 2.2 : d.load] as const);
    for (let attempt = 0; attempt < 600 && created < target; attempt++) {
      const d = rituCount < 7 ? this.ritu : this.rng.weighted(weights);
      const date = addDaysStr(this.today, this.rng.int(1, 10));
      const slots = this.slotsFor(d, date);
      if (!slots.length || this.leaves.has(`${d.id}|${date}`)) continue;
      const slot = this.rng.pick(slots);
      const bookedAt = this.minutesAgo(this.rng.int(20, 72 * 60));
      const student = this.rng
        .shuffle(this.eligibleStudents(bookedAt))
        .find((s) => this.canBook(s, d, date, slot.start, slot.end));
      if (!student) continue;
      this.reserve(this.makePlan(student, d, date, slot, 'scheduled', bookedAt));
      created++;
      if (d.key === 'ritu') rituCount++;
    }
  }

  private assignTokens(): void {
    const groups = new Map<string, Plan[]>();
    for (const p of this.plans) {
      if (!p.checkedInAt) continue;
      const key = `${p.doctor.id}|${p.date}`;
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    for (const list of groups.values()) {
      list.sort((a, b) => a.checkedInAt!.localeCompare(b.checkedInAt!));
      list.forEach((p, i) => (p.tokenNo = i + 1));
    }
  }

  // -------------------------------------------------------------------------
  // Appointments — insertion (+ consultations, prescriptions, records)
  // -------------------------------------------------------------------------

  private insertAppointments(): void {
    const ordered = [...this.plans].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const p of ordered) this.insertAppointment(p);
  }

  private insertAppointment(p: Plan): void {
    const code = this.code('APT');
    const updatedAt = p.completedAt ?? p.cancel?.at ?? p.checkedInAt ?? p.createdAt;
    const info = db
      .prepare(
        `INSERT INTO appointments (code, student_id, doctor_id, date, start_time, end_time, mode, reason, notes, status,
           token_no, checked_in_at, started_at, completed_at, cancelled_at, cancel_reason, cancelled_by_role,
           rescheduled_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        code,
        p.student.id,
        p.doctor.id,
        p.date,
        p.start,
        p.end,
        p.mode,
        p.tpl.reason,
        p.notes,
        p.status,
        p.tokenNo,
        p.checkedInAt,
        p.startedAt,
        p.completedAt,
        p.cancel?.at ?? null,
        p.cancel?.reason ?? null,
        p.cancel?.role ?? null,
        p.createdAt,
        updatedAt,
      );
    const id = Number(info.lastInsertRowid);
    if (p.tag) this.apptIdByTag.set(p.tag, id);
    this.apptPlanById.set(id, p);

    const when = `${fmtDay(p.date)}, ${fmt12(p.start)}`;
    this.statusEvent('appointment', id, 'scheduled', p.mode === 'video' ? 'Video consultation booked' : null, p.student.id, p.createdAt);
    this.activity(
      p.student.id,
      'appointment.booked',
      'appointment',
      `${p.student.name} booked ${p.mode === 'video' ? 'a video consultation' : 'an appointment'} with ${p.doctor.name} for ${when}`,
      'appointment',
      id,
      p.createdAt,
    );

    if (p.cancel) {
      this.statusEvent('appointment', id, 'cancelled', p.cancel.reason, p.cancel.actorId, p.cancel.at);
      const desc =
        p.cancel.role === 'student'
          ? `${p.student.name} cancelled the appointment with ${p.doctor.name} on ${when}`
          : `${p.cancel.actorName} cancelled ${p.student.name}'s appointment with ${p.doctor.name} on ${when}`;
      this.activity(p.cancel.actorId, 'appointment.cancelled', 'appointment', desc, 'appointment', id, p.cancel.at);
      return;
    }

    if (p.checkedInAt) {
      const by = this.checkInStaff(p.checkedInAt);
      this.statusEvent('appointment', id, 'checked_in', p.tokenNo ? `Token #${p.tokenNo}` : null, by.id, p.checkedInAt);
      if (p.date === this.today) {
        this.activity(
          by.id,
          'appointment.checked_in',
          'appointment',
          `${p.student.name} checked in for ${p.doctor.name} (token #${p.tokenNo})`,
          'appointment',
          id,
          p.checkedInAt,
        );
      }
    }
    if (p.status !== 'completed' || !p.startedAt || !p.completedAt) return;

    this.statusEvent('appointment', id, 'in_progress', null, p.doctor.id, p.startedAt);
    this.statusEvent('appointment', id, 'completed', null, p.doctor.id, p.completedAt);
    const consultationId = this.insertConsultation(p, id);
    const rx = this.insertPrescription(p, id, consultationId);
    this.insertVisitRecord(p, id, consultationId, rx?.id ?? null);
  }

  private makeVitals(p: Plan): Record<string, string> {
    if (p.mode === 'video') {
      return p.tpl.fever ? { temperature: `${(99.6 + this.rng.next() * 1.6).toFixed(1)} °F` } : {};
    }
    const fever = !!p.tpl.fever;
    return {
      temperature: `${(fever ? 99.6 + this.rng.next() * 2.2 : 97.8 + this.rng.next() * 1.0).toFixed(1)} °F`,
      bloodPressure: `${this.rng.int(108, 128)}/${this.rng.int(68, 84)}`,
      pulse: String(fever ? this.rng.int(88, 104) : this.rng.int(66, 86)),
      spo2: String(this.rng.int(96, 99)),
      weight: String(p.student.weightKg),
    };
  }

  private insertConsultation(p: Plan, appointmentId: number): number {
    const tpl = p.tpl;
    const symptoms = this.rng.pickN(tpl.symptoms, Math.min(tpl.symptoms.length, this.rng.int(2, 4)));
    let followUpDate: string | null = null;
    let followUpNotes: string | null = null;
    if (tpl.followUp && this.rng.chance(tpl.followUp.chance)) {
      followUpDate = addDaysStr(p.date, this.rng.int(tpl.followUp.days[0], tpl.followUp.days[1]));
      followUpNotes = tpl.followUp.note;
    }
    const info = db
      .prepare(
        `INSERT INTO consultations (appointment_id, student_id, doctor_id, status, symptoms, vitals, clinical_notes,
           observations, diagnosis, advice, follow_up_date, follow_up_notes, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        appointmentId,
        p.student.id,
        p.doctor.id,
        JSON.stringify(symptoms),
        JSON.stringify(this.makeVitals(p)),
        this.rng.pick(tpl.clinicalNotes),
        this.rng.pick(tpl.observations),
        tpl.diagnosis,
        tpl.advice,
        followUpDate,
        followUpNotes,
        p.startedAt,
        p.completedAt,
        p.completedAt,
      );
    const id = Number(info.lastInsertRowid);
    this.activity(
      p.doctor.id,
      'consultation.completed',
      'consultation',
      `${p.doctor.name} completed a consultation with ${p.student.name} — ${tpl.diagnosis}`,
      'appointment',
      appointmentId,
      p.completedAt!,
    );
    return id;
  }

  private quantityFor(med: MedRec, freq: string, days: number): number {
    if (!med.countable) return med.unit.startsWith('tube') && days > 30 ? 2 : 1;
    const perDay = FREQUENCIES.find((f) => f.value === freq)?.perDay ?? 1;
    const doses = freq === 'STAT' ? 1 : freq === 'SOS' ? Math.max(2, Math.ceil(days * 1.5)) : perDay * days;
    return Math.max(1, Math.ceil(doses / med.packSize));
  }

  private conflictsWithAllergy(s: StudentRec, med: MedRec): boolean {
    return s.allergies.some((allergen) => (ALLERGY_CONFLICTS[allergen] ?? []).some((frag) => med.name.includes(frag)));
  }

  private insertPrescription(p: Plan, appointmentId: number, consultationId: number): RxInfo | null {
    const specs = p.rxOverride ?? (this.rng.chance(p.tpl.rxChance) ? p.tpl.rx : []);
    const items = specs
      .map((spec) => ({ spec, med: this.m(spec.med) }))
      .filter(({ med }) => !this.conflictsWithAllergy(p.student, med));
    if (!items.length) return null;

    const code = this.code('RX');
    const createdAt = addMin(p.completedAt!, 1);
    const validUntil = addDaysStr(p.date, PRESCRIPTION_VALIDITY_DAYS);
    const notes = p.rxOverride ? null : this.rng.chance(0.4) ? this.rng.pick(RX_NOTES) : null;
    const info = db
      .prepare(
        `INSERT INTO prescriptions (code, appointment_id, consultation_id, student_id, doctor_id, diagnosis, notes, valid_until, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(code, appointmentId, consultationId, p.student.id, p.doctor.id, p.tpl.diagnosis, notes, validUntil, this.past(createdAt));
    const id = Number(info.lastInsertRowid);
    const insertItem = db.prepare(
      `INSERT INTO prescription_items (prescription_id, medicine_id, medicine_name, dosage, frequency, duration_days,
         quantity, instructions, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const rxItems: { med: MedRec; qty: number }[] = [];
    for (const { spec, med } of items) {
      const qty = this.quantityFor(med, spec.freq, spec.days);
      insertItem.run(id, med.id, med.name, spec.dosage, spec.freq, spec.days, qty, spec.instructions ?? null, spec.notes ?? null);
      rxItems.push({ med, qty });
    }
    const mode = p.rxMode ?? (this.rng.chance(0.55) ? 'counter' : 'none');
    const rx: RxInfo = {
      id,
      code,
      student: p.student,
      doctor: p.doctor,
      appointmentId,
      createdAt: this.past(createdAt),
      validUntil,
      items: rxItems,
      mode,
      used: mode !== 'none',
      tag: p.tag,
    };
    this.prescriptions.push(rx);
    this.activity(
      p.doctor.id,
      'prescription.created',
      'prescription',
      `${p.doctor.name} issued prescription ${code} to ${p.student.name} (${plural(rxItems.length, 'item')})`,
      'prescription',
      id,
      rx.createdAt,
    );

    if (mode === 'counter') {
      const at = this.past(addMin(rx.createdAt, this.rng.int(5, 20)));
      const by = this.pharmacistAt(at);
      for (const item of rxItems) {
        this.stockEvents.push({
          med: item.med,
          type: 'dispense',
          qty: item.qty,
          at,
          requestId: null,
          reference: code,
          reason: 'Dispensed at the OPD counter',
          by: by.id,
        });
      }
    }
    return rx;
  }

  private insertVisitRecord(p: Plan, appointmentId: number, consultationId: number, prescriptionId: number | null): void {
    db.prepare(
      `INSERT INTO medical_records (student_id, category, title, description, record_date, source, doctor_id,
         consultation_id, appointment_id, prescription_id, uploaded_by, created_at)
       VALUES (?, 'visit_summary', ?, ?, ?, 'consultation', ?, ?, ?, ?, ?, ?)`,
    ).run(
      p.student.id,
      p.tpl.diagnosis,
      `Seen by ${p.doctor.name} (${p.doctor.specialty}). ${p.tpl.advice}`,
      p.date,
      p.doctor.id,
      consultationId,
      appointmentId,
      prescriptionId,
      p.doctor.id,
      p.completedAt,
    );
  }

  // -------------------------------------------------------------------------
  // Medicine requests
  // -------------------------------------------------------------------------

  private readonly durations: Record<string, [number, number]> = {
    approved: [15, 90],
    preparing: [10, 40],
    ready: [30, 120],
    dispatched: [20, 60],
    fulfilledPickup: [60, 600],
    fulfilledDelivery: [25, 70],
  };

  private steps(status: RequestStatus, fulfilment: FulfilmentMethod): TimeKey[] {
    const last: TimeKey = fulfilment === 'pickup' ? 'ready' : 'dispatched';
    switch (status) {
      case 'approved':
        return ['approved'];
      case 'preparing':
        return ['approved', 'preparing'];
      case 'ready_for_pickup':
        return ['approved', 'preparing', 'ready'];
      case 'out_for_delivery':
        return ['approved', 'preparing', 'dispatched'];
      case 'fulfilled':
        return ['approved', 'preparing', last, 'fulfilled'];
      default:
        return [];
    }
  }

  private stepDuration(step: TimeKey, fulfilment: FulfilmentMethod): number {
    const key = step === 'fulfilled' ? (fulfilment === 'pickup' ? 'fulfilledPickup' : 'fulfilledDelivery') : step;
    const [a, b] = this.durations[key] ?? [10, 30];
    return this.rng.int(a, b);
  }

  private forwardTimes(status: RequestStatus, fulfilment: FulfilmentMethod, created: string): Times {
    const times: Times = { created };
    let t = created;
    for (const step of this.steps(status, fulfilment)) {
      t = addMin(t, this.stepDuration(step, fulfilment));
      times[step] = t;
    }
    return times;
  }

  /** Timeline whose latest event happened `tailMin` minutes ago. */
  private backwardTimes(status: RequestStatus, fulfilment: FulfilmentMethod, tailMin: number): Times {
    const steps = this.steps(status, fulfilment);
    const durs = steps.map((s) => this.stepDuration(s, fulfilment));
    const total = durs.reduce((a, b) => a + b, 0);
    const created = this.minutesAgo(tailMin + total);
    const times: Times = { created };
    let t = created;
    steps.forEach((step, i) => {
      t = addMin(t, durs[i]);
      times[step] = t;
    });
    return times;
  }

  private otcPool(): MedRec[] {
    return this.meds.filter((m) => !m.rx && m.target > 0 && m.expiryDays > 0 && !m.addedDaysAgo);
  }

  private pickOtcItems(open: boolean): { med: MedRec; qty: number }[] {
    const count = this.rng.int(1, 3);
    const items: { med: MedRec; qty: number }[] = [];
    for (const med of this.rng.shuffle(this.otcPool())) {
      if (items.length >= count) break;
      const qty = this.rng.int(1, 3);
      if (open && (this.avail.get(med.id) ?? 0) < qty) continue;
      items.push({ med, qty });
    }
    if (!items.length) items.push({ med: this.m('Electral Powder 21.8 g'), qty: 1 });
    if (open) for (const it of items) this.avail.set(it.med.id, (this.avail.get(it.med.id) ?? 0) - it.qty);
    return items;
  }

  /** Items of a prescription that can still be served (open requests reserve stock). */
  private rxItemsFor(rx: RxInfo, open: boolean): { med: MedRec; qty: number }[] | null {
    const items = rx.items.filter((it) => !open || (this.avail.get(it.med.id) ?? 0) >= it.qty);
    if (!items.length || (open && items.length < rx.items.length && this.rng.chance(0.5))) return null;
    if (open) for (const it of items) this.avail.set(it.med.id, (this.avail.get(it.med.id) ?? 0) - it.qty);
    return items.map((it) => ({ ...it }));
  }

  private studentForOtc(createdBefore: string, needsDelivery: boolean): StudentRec {
    const pool = this.eligibleStudents(createdBefore).filter((s) => !needsDelivery || s.hostel !== 'Day Scholar');
    return this.rng.pick(pool);
  }

  private findRx(filter: (rx: RxInfo) => boolean, newestFirst = false): RxInfo | null {
    const list = this.prescriptions.filter((rx) => !rx.used && rx.mode === 'none' && rx.tag === undefined && filter(rx));
    if (!list.length) return null;
    if (newestFirst) return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return this.rng.pick(list);
  }

  private insertRequests(): void {
    const plans: RequestPlan[] = [];
    const deliveryOrPickup = (s: StudentRec, pDelivery: number): FulfilmentMethod =>
      s.hostel !== 'Day Scholar' && this.rng.chance(pDelivery) ? 'delivery' : 'pickup';

    // 1. Aarav — fulfilled pickup from the T-18 prescription.
    const aaravRx = this.prescriptions.find((rx) => rx.tag === 'aarav-rhinitis');
    if (aaravRx) {
      aaravRx.used = true;
      const day = dateOfIso(aaravRx.createdAt);
      const created = localIso(day, '12:10');
      plans.push({
        student: this.aarav,
        status: 'fulfilled',
        fulfilment: 'pickup',
        rx: aaravRx,
        items: aaravRx.items.map((it) => ({ ...it })),
        times: {
          created,
          approved: localIso(day, '12:40'),
          preparing: localIso(day, '13:05'),
          ready: localIso(day, '15:30'),
          fulfilled: localIso(addDaysStr(day, 1), '10:05'),
        },
        notes: null,
        staffNotes: 'Packed with dosage labels.',
        tag: 'aarav-fulfilled',
      });
    }

    // 2. Aarav — open OTC delivery request being prepared.
    const ors = this.m('ORS (WHO formula) Sachet');
    const vitC = this.m('Vitamin C 500 mg (Chewable)');
    this.avail.set(ors.id, (this.avail.get(ors.id) ?? 0) - 4);
    this.avail.set(vitC.id, (this.avail.get(vitC.id) ?? 0) - 2);
    plans.push({
      student: this.aarav,
      status: 'preparing',
      fulfilment: 'delivery',
      rx: null,
      items: [
        { med: ors, qty: 4 },
        { med: vitC, qty: 2 },
      ],
      times: {
        created: this.minutesAgo(300),
        approved: this.minutesAgo(240),
        preparing: this.minutesAgo(180),
      },
      notes: 'Please deliver after 6 PM — I have labs till then.',
      staffNotes: null,
      tag: 'aarav-open',
    });

    // 3. One request fulfilled today (OTC pickup).
    {
      const s = this.studentForOtc(this.minutesAgo(400), false);
      plans.push({
        student: s,
        status: 'fulfilled',
        fulfilment: 'pickup',
        rx: null,
        items: this.pickOtcItems(false),
        times: {
          created: this.minutesAgo(360),
          approved: this.minutesAgo(330),
          preparing: this.minutesAgo(300),
          ready: this.minutesAgo(240),
          fulfilled: this.minutesAgo(62),
        },
        notes: null,
        staffNotes: this.rng.pick(STAFF_NOTES),
      });
    }

    // 4. Historic fulfilled requests: 8 from prescriptions + 4 OTC.
    const histFrom = this.dayIso(-30, '00:00');
    const histTo = this.dayIso(-2, '00:00');
    let rxFulfilled = 0;
    for (let i = 0; i < 40 && rxFulfilled < 8; i++) {
      const rx = this.findRx((r) => r.createdAt >= histFrom && r.createdAt <= histTo);
      if (!rx) break;
      rx.used = true;
      const fulfilment = deliveryOrPickup(rx.student, 0.35);
      const times = this.forwardTimes('fulfilled', fulfilment, addMin(rx.createdAt, this.rng.int(30, 300)));
      if (Date.parse(times.fulfilled!) > this.nowMs - 60 * 60_000) continue;
      plans.push({
        student: rx.student,
        status: 'fulfilled',
        fulfilment,
        rx,
        items: rx.items.map((it) => ({ ...it })),
        times,
        notes: this.rng.chance(0.25) ? this.rng.pick(REQUEST_NOTES) : null,
        staffNotes: this.rng.chance(0.4) ? this.rng.pick(STAFF_NOTES) : null,
      });
      rxFulfilled++;
    }
    for (let i = 0; i < 12 - rxFulfilled; i++) {
      const created = this.dayIso(-this.rng.int(2, 28), this.randTime(9, 19));
      const s = this.studentForOtc(created, false);
      const fulfilment = deliveryOrPickup(s, 0.5);
      plans.push({
        student: s,
        status: 'fulfilled',
        fulfilment,
        rx: null,
        items: this.pickOtcItems(false),
        times: this.forwardTimes('fulfilled', fulfilment, created),
        notes: this.rng.chance(0.25) ? this.rng.pick(REQUEST_NOTES) : null,
        staffNotes: this.rng.chance(0.4) ? this.rng.pick(STAFF_NOTES) : null,
      });
    }

    // 5. Open requests (stock is reserved so staff can process all of them in the demo).
    const openSpecs: { status: RequestStatus; withRx: boolean; tail: [number, number]; fulfilment?: FulfilmentMethod }[] = [
      { status: 'ready_for_pickup', withRx: true, tail: [60, 600], fulfilment: 'pickup' },
      { status: 'ready_for_pickup', withRx: false, tail: [60, 600], fulfilment: 'pickup' },
      { status: 'out_for_delivery', withRx: false, tail: [5, 25], fulfilment: 'delivery' },
      { status: 'preparing', withRx: true, tail: [10, 60] },
      { status: 'approved', withRx: true, tail: [20, 120] },
      { status: 'approved', withRx: false, tail: [20, 120] },
      { status: 'submitted', withRx: true, tail: [10, 240] },
      { status: 'submitted', withRx: true, tail: [30, 360] },
      { status: 'submitted', withRx: false, tail: [10, 300] },
      { status: 'submitted', withRx: false, tail: [45, 360] },
    ];
    for (const spec of openSpecs) {
      const tail = this.rng.int(spec.tail[0], spec.tail[1]);
      let plan: RequestPlan | null = null;
      if (spec.withRx) {
        for (let attempt = 0; attempt < 12 && !plan; attempt++) {
          const fulfilmentGuess: FulfilmentMethod = spec.fulfilment ?? 'pickup';
          const times = this.backwardTimes(spec.status, fulfilmentGuess, tail);
          const rx = this.findRx(
            (r) => r.createdAt < addMin(times.created, -10) && r.validUntil >= dateOfIso(times.created),
            attempt === 0,
          );
          if (!rx) break;
          const items = this.rxItemsFor(rx, true);
          if (!items) {
            rx.used = true; // not servable — skip it for open requests
            continue;
          }
          rx.used = true;
          const fulfilment = spec.fulfilment ?? deliveryOrPickup(rx.student, 0.4);
          plan = {
            student: rx.student,
            status: spec.status,
            fulfilment,
            rx,
            items,
            times: fulfilment === fulfilmentGuess ? times : this.backwardTimes(spec.status, fulfilment, tail),
            notes: this.rng.chance(0.3) ? this.rng.pick(REQUEST_NOTES) : null,
            staffNotes: null,
          };
        }
      }
      if (!plan) {
        const fulfilment = spec.fulfilment ?? (this.rng.chance(0.5) ? 'delivery' : 'pickup');
        const times = this.backwardTimes(spec.status, fulfilment, tail);
        const s = this.studentForOtc(times.created, fulfilment === 'delivery');
        plan = {
          student: s,
          status: spec.status,
          fulfilment,
          rx: null,
          items: this.pickOtcItems(true),
          times,
          notes: this.rng.chance(0.3) ? this.rng.pick(REQUEST_NOTES) : null,
          staffNotes: null,
        };
      }
      plans.push(plan);
    }

    // 6. Rejected and cancelled requests.
    const rejectionReasons = [
      'Already dispensed at the OPD counter after your consultation.',
      'Not required for the prescribed course — please consult the doctor again if symptoms continue.',
    ];
    for (const reason of rejectionReasons) {
      const created = this.dayIso(-this.rng.int(5, 20), this.randTime(9, 20));
      const s = this.studentForOtc(created, false);
      plans.push({
        student: s,
        status: 'rejected',
        fulfilment: 'pickup',
        rx: null,
        items: this.pickOtcItems(false),
        times: { created, rejected: addMin(created, this.rng.int(30, 180)) },
        notes: null,
        staffNotes: null,
        rejectionReason: reason,
      });
    }
    {
      const created = this.dayIso(-7, '13:10');
      const s = this.studentForOtc(created, true);
      plans.push({
        student: s,
        status: 'cancelled',
        fulfilment: 'delivery',
        rx: null,
        items: this.pickOtcItems(false),
        times: { created, cancelled: addMin(created, 50) },
        notes: null,
        staffNotes: null,
        cancelReason: 'No longer needed — feeling better.',
      });
    }

    plans.sort((a, b) => a.times.created.localeCompare(b.times.created));
    for (const plan of plans) this.insertRequest(plan);
  }

  private insertRequest(plan: RequestPlan): void {
    const code = this.code('MR');
    const t = plan.times;
    const location =
      plan.fulfilment === 'delivery'
        ? plan.student.room
          ? `${plan.student.hostel}, Room ${plan.student.room}`
          : plan.student.hostel
        : null;
    const handledAt = t.approved ?? t.rejected ?? null;
    const handler = handledAt ? this.pharmacistAt(handledAt) : null;
    const updatedAt = [t.created, t.approved, t.preparing, t.ready, t.dispatched, t.fulfilled, t.rejected, t.cancelled]
      .filter((x): x is string => !!x)
      .sort()
      .pop()!;
    const info = db
      .prepare(
        `INSERT INTO medicine_requests (code, student_id, prescription_id, fulfilment, delivery_location, notes, status,
           rejection_reason, staff_notes, handled_by, approved_at, preparing_at, ready_at, dispatched_at, fulfilled_at,
           rejected_at, cancelled_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        code,
        plan.student.id,
        plan.rx?.id ?? null,
        plan.fulfilment,
        location,
        plan.notes,
        plan.status,
        plan.rejectionReason ?? null,
        plan.staffNotes,
        handler?.id ?? null,
        t.approved ?? null,
        t.preparing ?? null,
        t.ready ?? null,
        t.dispatched ?? null,
        t.fulfilled ?? null,
        t.rejected ?? null,
        t.cancelled ?? null,
        t.created,
        updatedAt,
      );
    const id = Number(info.lastInsertRowid);
    if (plan.tag) this.requestIdByTag.set(plan.tag, id);
    const insertItem = db.prepare(
      'INSERT INTO medicine_request_items (request_id, medicine_id, medicine_name, quantity) VALUES (?, ?, ?, ?)',
    );
    for (const it of plan.items) insertItem.run(id, it.med.id, it.med.name, it.qty);

    const s = plan.student;
    const units = plan.items.reduce((sum, it) => sum + it.qty, 0);
    const link = `/student/requests?open=${id}`;
    const staffLink = `/staff/requests?open=${id}`;
    const via = plan.fulfilment === 'delivery' ? 'campus delivery' : 'pickup';

    // Timeline, activity
    this.statusEvent('medicine_request', id, 'submitted', plan.notes, s.id, t.created);
    this.activity(
      s.id,
      'medicine_request.submitted',
      'medicine_request',
      `${s.name} requested ${plural(plan.items.length, 'medicine')} (${plural(units, 'unit')}) for ${via} — ${code}`,
      'medicine_request',
      id,
      t.created,
    );
    const staffStep = (status: RequestStatus, at: string | undefined, note: string | null, verb: string) => {
      if (!at || !handler) return;
      this.statusEvent('medicine_request', id, status, note, handler.id, at);
      this.activity(handler.id, `medicine_request.${status}`, 'medicine_request', `${handler.name} ${verb} ${code} for ${s.name}`, 'medicine_request', id, at);
    };
    if (plan.status === 'rejected') {
      staffStep('rejected', t.rejected, plan.rejectionReason ?? null, 'rejected');
    } else if (plan.status === 'cancelled') {
      this.statusEvent('medicine_request', id, 'cancelled', plan.cancelReason ?? null, s.id, t.cancelled!);
      this.activity(s.id, 'medicine_request.cancelled', 'medicine_request', `${s.name} cancelled medicine request ${code}`, 'medicine_request', id, t.cancelled!);
    } else {
      staffStep('approved', t.approved, null, 'approved');
      staffStep('preparing', t.preparing, null, 'started preparing');
      staffStep('ready_for_pickup', t.ready, 'Collect from dispensary counter 2 with your ID card.', 'marked ready for pickup');
      staffStep('out_for_delivery', t.dispatched, `Out for delivery to ${location}`, 'sent out for delivery');
      staffStep(
        'fulfilled',
        t.fulfilled,
        plan.fulfilment === 'pickup' ? 'Collected by the student' : `Delivered to ${location}`,
        'fulfilled',
      );
    }

    // Stock deduction for fulfilled requests.
    if (plan.status === 'fulfilled' && t.fulfilled && handler) {
      for (const it of plan.items) {
        this.stockEvents.push({
          med: it.med,
          type: 'dispense',
          qty: it.qty,
          at: t.fulfilled,
          requestId: id,
          reference: code,
          reason: 'Dispensed against medicine request',
          by: handler.id,
        });
      }
    }

    // Notifications
    const isAarav = s.id === this.aarav.id;
    const recent = t.created >= this.dayIso(-10, '00:00');
    const studentNote = (status: RequestStatus, at: string, read: boolean) => {
      const n = this.requestNotification(status, code, location, plan.rejectionReason);
      if (n) this.notify(s.id, 'medicine_request', n.title, n.body, link, at, read);
    };
    if (isAarav) {
      if (plan.status === 'fulfilled') {
        studentNote('approved', t.approved!, true);
        studentNote('ready_for_pickup', t.ready!, true);
        studentNote('fulfilled', t.fulfilled!, true);
      } else {
        studentNote('approved', t.approved!, true);
        studentNote('preparing', t.preparing!, false);
      }
    } else if (recent && plan.status !== 'cancelled') {
      const lastAt = updatedAt;
      const unread = ['ready_for_pickup', 'out_for_delivery', 'approved'].includes(plan.status);
      studentNote(plan.status, lastAt, !unread);
    }
    if (plan.status === 'submitted') {
      this.notify(
        this.abhishek.id,
        'medicine_request',
        'New medicine request',
        `${s.name} requested ${plural(plan.items.length, 'item')} for ${via} — ${code}.`,
        staffLink,
        t.created,
        false,
      );
    }
    if (plan.status === 'cancelled') {
      this.notify(
        this.abhishek.id,
        'medicine_request',
        'Request cancelled by student',
        `${s.name} cancelled ${code}. No action needed.`,
        staffLink,
        t.cancelled!,
        true,
      );
    }
  }

  private requestNotification(
    status: RequestStatus,
    code: string,
    location: string | null,
    reason?: string,
  ): { title: string; body: string } | null {
    switch (status) {
      case 'submitted':
        return { title: 'Medicine request submitted', body: `Your request ${code} has been sent to the dispensary.` };
      case 'approved':
        return { title: 'Medicine request approved', body: `${code} was approved by the pharmacist and will be prepared shortly.` };
      case 'preparing':
        return { title: 'Your medicines are being prepared', body: `${code} is being packed at the dispensary.` };
      case 'ready_for_pickup':
        return { title: 'Ready for pickup', body: `${code} is ready. Collect it from dispensary counter 2 with your ID card.` };
      case 'out_for_delivery':
        return { title: 'Out for delivery', body: `${code} is on its way to ${location ?? 'your hostel'}.` };
      case 'fulfilled':
        return location
          ? { title: 'Medicines delivered', body: `${code} was delivered to ${location}.` }
          : { title: 'Medicines collected', body: `${code} was collected from the dispensary.` };
      case 'rejected':
        return { title: 'Medicine request rejected', body: `${code} could not be approved: ${reason ?? 'see details.'}` };
      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Inventory movements
  // -------------------------------------------------------------------------

  private addWalkInsAndAdjustments(): void {
    for (const med of this.meds.filter((m) => m.walkIn)) {
      const out = med.target === 0;
      const total = out ? this.rng.int(med.packSize > 1 ? 28 : 16, med.packSize > 1 ? 40 : 24) : 0;
      const count = out ? this.rng.int(8, 12) : this.rng.int(3, 6);
      const amounts: number[] = [];
      if (out) {
        let left = total;
        for (let i = 0; i < count - 1; i++) {
          const q = Math.max(1, Math.min(left - (count - 1 - i), this.rng.int(1, 4)));
          amounts.push(q);
          left -= q;
        }
        amounts.push(Math.max(1, left));
      } else {
        for (let i = 0; i < count; i++) amounts.push(this.rng.int(1, 3));
      }
      const days = amounts.map((_, i) =>
        out && i === amounts.length - 1 ? 3 : this.rng.int(out ? 4 : 1, 58),
      );
      amounts.forEach((qty, i) => {
        const at = this.past(this.dayIso(-days[i], this.randTime(9, 21)));
        this.stockEvents.push({
          med,
          type: 'dispense',
          qty,
          at,
          requestId: null,
          reference: 'OPD walk-in',
          reason: 'Walk-in OTC dispensing at the OPD counter',
          by: this.pharmacistAt(at).id,
        });
      });
    }
    const adjust = (name: string, qty: number, daysAgo: number, time: string, by: StaffRec, reason: string) =>
      this.stockEvents.push({
        med: this.m(name),
        type: 'adjustment',
        qty,
        at: this.dayIso(-daysAgo, time),
        requestId: null,
        reference: 'Stock audit',
        reason,
        by: by.id,
      });
    adjust('Paracetamol 500 mg', 2, 14, '10:30', this.abhishek, 'Damaged strips found during the monthly stock audit');
    adjust('Ibuprofen 400 mg', 1, 21, '16:00', this.staffByKey.get('kamalpreet')!, 'Strip damaged by moisture');
  }

  private finalizeStock(): void {
    const insert = db.prepare(
      `INSERT INTO stock_movements (medicine_id, type, quantity_change, balance_after, reason, reference, request_id,
         performed_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    let poSeq = 101;
    for (const med of this.meds) {
      const events = this.stockEvents.filter((e) => e.med.id === med.id);
      const outflow = events.reduce((sum, e) => sum + e.qty, 0);

      // Restocks only for comfortably stocked items from the opening stock count.
      const restocks: StockEvent[] = [];
      if (!med.addedDaysAgo && med.target >= 30 && med.target > med.minStock && med.expiryDays > 60) {
        const n = this.rng.weighted([
          [0, 0.2],
          [1, 0.55],
          [2, 0.25],
        ] as const);
        let budget = med.target;
        for (let i = 0; i < n; i++) {
          const qty = Math.round(budget * (i === 0 ? 0.3 + this.rng.next() * 0.2 : 0.2 + this.rng.next() * 0.1));
          if (qty < 5) break;
          budget -= qty;
          const at = this.dayIso(-this.rng.int(8, 45), this.randTime(11, 16));
          const by = this.rng.chance(0.7) ? this.abhishek : this.staffByKey.get('anish')!;
          const d = new Date(at);
          restocks.push({
            med,
            type: 'restock',
            qty,
            at,
            requestId: null,
            reference: `PO-${String(d.getFullYear()).slice(2)}${pad2(d.getMonth() + 1)}-${poSeq++}`,
            reason: `Supply received from ${med.manufacturer}`,
            by: by.id,
          });
        }
      }
      const inflow = restocks.reduce((sum, e) => sum + e.qty, 0);
      const initial = med.target + outflow - inflow;
      if (initial <= 0) throw new Error(`Seed: stock maths failed for ${med.name}`);

      type Move = { type: string; change: number; at: string; reason: string; reference: string | null; requestId: number | null; by: number };
      const moves: Move[] = [
        {
          type: 'initial',
          change: initial,
          at: med.createdAt,
          reason: med.addedDaysAgo ? 'New item added to the formulary' : 'Opening stock (quarterly stock count)',
          reference: null,
          requestId: null,
          by: this.abhishek.id,
        },
        ...[...restocks, ...events]
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((e) => ({
            type: e.type,
            change: e.type === 'restock' ? e.qty : -e.qty,
            at: e.at,
            reason: e.reason,
            reference: e.reference,
            requestId: e.requestId,
            by: e.by,
          })),
      ];
      let balance = 0;
      for (const mv of moves) {
        if (mv.at < med.createdAt) throw new Error(`Seed: movement before ${med.name} was added`);
        balance += mv.change;
        if (balance < 0) throw new Error(`Seed: negative stock for ${med.name}`);
        insert.run(med.id, mv.type, mv.change, balance, mv.reason, mv.reference, mv.requestId, mv.by, mv.at);
        const actor = mv.by === this.abhishek.id ? this.abhishek : [...this.staffByKey.values()].find((s) => s.id === mv.by)!;
        if (mv.type === 'restock') {
          this.activity(actor.id, 'inventory.restocked', 'inventory', `${actor.name} restocked ${med.name} (+${mv.change} × ${med.unit})`, 'medicine', med.id, mv.at);
        } else if (mv.type === 'adjustment') {
          this.activity(actor.id, 'inventory.adjusted', 'inventory', `${actor.name} adjusted ${med.name} stock by ${mv.change} (${mv.reason})`, 'medicine', med.id, mv.at);
        } else if (mv.type === 'initial' && med.addedDaysAgo) {
          this.activity(actor.id, 'inventory.medicine_added', 'inventory', `${actor.name} added ${med.name} to the inventory (${mv.change} × ${med.unit})`, 'medicine', med.id, mv.at);
        }
      }
      if (balance !== med.target) throw new Error(`Seed: final stock mismatch for ${med.name}`);
      db.prepare('UPDATE medicines SET updated_at = ? WHERE id = ?').run(moves[moves.length - 1].at, med.id);
    }
  }

  // -------------------------------------------------------------------------
  // Emergencies
  // -------------------------------------------------------------------------

  private insertEmergencies(): void {
    const responder = (key: string) => {
      const s = this.staffByKey.get(key);
      if (s) return { id: s.id, name: `${s.name} (${s.designation.replace(/^Senior Associate \(Staff Nurse\)$/, 'Staff Nurse')})`, phone: s.phone };
      const d = this.doc.get(key)!;
      return { id: d.id, name: `${d.name} (${d.title})`, phone: d.phone };
    };
    const resolved = [
      {
        student: 'yash',
        category: 'Injury / accident',
        severity: 'high',
        description: 'Fell during a football match and hurt the left knee; unable to put weight on the leg.',
        location: 'Sports complex — football ground',
        daysAgo: 27,
        time: '18:40',
        handler: 'avtar',
        responder: 'avtar',
        resolution:
          'First aid given (ice pack and compression bandage). Escorted to the health centre; X-ray advised at the referral hospital, no fracture suspected clinically.',
        resolveMin: 55,
      },
      {
        student: 'meera',
        category: 'Fainting / unconscious',
        severity: 'high',
        description: 'Fainted in the library reading hall; regained consciousness within a minute but feels dizzy and weak.',
        location: 'Library — 2nd floor reading hall',
        daysAgo: 19,
        time: '11:25',
        handler: 'satvir',
        responder: 'satvir',
        resolution: 'Vitals stable; likely a vasovagal episode after skipping breakfast. ORS given, observed for an hour and sent back to the hostel.',
        resolveMin: 75,
      },
      {
        student: 'simran',
        category: 'Severe allergic reaction',
        severity: 'critical',
        description: 'Lips swelling and an itchy rash after eating at the canteen; known peanut allergy.',
        location: 'Dining hall — Hostel E',
        daysAgo: 14,
        time: '13:05',
        handler: 'satvir',
        responder: 'satvir',
        resolution:
          'Treated promptly by the medical officer on duty; swelling subsided within the hour. Advised to carry an allergy card and avoid peanut-containing food.',
        resolveMin: 70,
      },
      {
        student: 'karan',
        category: 'Breathing difficulty',
        severity: 'high',
        description: 'Asthma attack at night; the reliever inhaler is not giving full relief.',
        location: 'Hostel M, Room 401',
        daysAgo: 9,
        time: '23:10',
        handler: 'arjun',
        responder: 'jeevan',
        resolution: 'Nebulisation given at the health centre; breathing normal with SpO2 98%. Advised to review inhaler technique and carry the inhaler at all times.',
        resolveMin: 50,
      },
      {
        student: 'sneha',
        category: 'Injury / accident',
        severity: 'moderate',
        description: 'Deep cut on a finger from broken glassware in the lab; bleeding controlled with a cloth.',
        location: 'Academic block — Chemical engineering lab 3',
        daysAgo: 4,
        time: '15:20',
        handler: 'jasmine',
        responder: 'jasmine',
        resolution: 'Wound cleaned and dressed; no sutures needed. Tetanus immunisation is up to date.',
        resolveMin: 40,
      },
    ] as const;

    const insert = db.prepare(
      `INSERT INTO emergencies (code, student_id, category, severity, description, location, contact_phone,
         emergency_contact, additional_info, status, responder_name, responder_phone, resolution_notes, handled_by,
         acknowledged_at, assigned_at, resolved_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const contactOf = (s: StudentRec) => `${s.contactName} (${s.contactRelation}) · ${s.contactPhone}`;

    for (const e of resolved) {
      const s = this.stu.get(e.student)!;
      const created = this.dayIso(-e.daysAgo, e.time);
      const ack = addMin(created, this.rng.int(1, 3));
      const assigned = addMin(ack, this.rng.int(2, 5));
      const done = addMin(assigned, e.resolveMin);
      const handler = this.staffByKey.get(e.handler)!;
      const resp = responder(e.responder);
      const code = this.code('EMG', 4);
      const info = insert.run(
        code,
        s.id,
        e.category,
        e.severity,
        e.description,
        e.location,
        s.phone,
        contactOf(s),
        s.allergies.length ? `Known allergies: ${s.allergies.join(', ')}` : null,
        'resolved',
        resp.name,
        resp.phone,
        e.resolution,
        handler.id,
        ack,
        assigned,
        done,
        created,
        done,
      );
      const id = Number(info.lastInsertRowid);
      this.statusEvent('emergency', id, 'submitted', null, s.id, created);
      this.statusEvent('emergency', id, 'acknowledged', 'Emergency desk alerted', handler.id, ack);
      this.statusEvent('emergency', id, 'responder_assigned', `${resp.name} assigned`, handler.id, assigned);
      this.statusEvent('emergency', id, 'resolved', e.resolution, handler.id, done);
      this.activity(s.id, 'emergency.submitted', 'emergency', `${s.name} raised an emergency: ${e.category} at ${e.location}`, 'emergency', id, created);
      this.activity(handler.id, 'emergency.acknowledged', 'emergency', `${handler.name} acknowledged emergency ${code}`, 'emergency', id, ack);
      this.activity(handler.id, 'emergency.responder_assigned', 'emergency', `${handler.name} assigned ${resp.name} to emergency ${code}`, 'emergency', id, assigned);
      this.activity(handler.id, 'emergency.resolved', 'emergency', `Emergency ${code} (${e.category}) was resolved`, 'emergency', id, done);
      this.notify(s.id, 'emergency', 'Emergency request resolved', `Your emergency request ${code} has been marked resolved. Take care!`, '/student/emergency', done, true);
      if (e.student === 'simran') {
        this.notify(this.vishal.id, 'emergency', 'Emergency resolved', `${code} — ${e.category} (${s.name}) was resolved by the health centre team.`, `/admin/emergencies?open=${id}`, done, true);
      }
    }

    // Active emergency, acknowledged a few minutes ago.
    const vikram = this.stu.get('vikram')!;
    const created = this.minutesAgo(25);
    const ack = this.minutesAgo(21);
    const satvir = this.staffByKey.get('satvir')!;
    const code = this.code('EMG', 4);
    const category = 'High fever';
    const location = 'Hostel K, Room 305';
    const info = insert.run(
      code,
      vikram.id,
      category,
      'moderate',
      'Fever of 103 °F since the evening with shivering and body ache; unable to walk to the health centre.',
      location,
      vikram.phone,
      contactOf(vikram),
      'No known allergies. Took one paracetamol 500 mg about two hours ago.',
      'acknowledged',
      null,
      null,
      null,
      satvir.id,
      ack,
      null,
      null,
      created,
      ack,
    );
    const id = Number(info.lastInsertRowid);
    this.statusEvent('emergency', id, 'submitted', null, vikram.id, created);
    this.statusEvent('emergency', id, 'acknowledged', 'Emergency desk alerted — arranging a responder', satvir.id, ack);
    this.activity(vikram.id, 'emergency.submitted', 'emergency', `${vikram.name} raised an emergency: ${category} at ${location}`, 'emergency', id, created);
    this.activity(satvir.id, 'emergency.acknowledged', 'emergency', `${satvir.name} acknowledged emergency ${code}`, 'emergency', id, ack);
    this.notify(vikram.id, 'emergency', 'Emergency request received', `${code} was submitted. The health centre has been alerted.`, '/student/emergency', created, true);
    this.notify(vikram.id, 'emergency', 'Emergency acknowledged', `${satvir.name} acknowledged ${code} and is arranging a responder.`, '/student/emergency', ack, false);
    const alertBody = `${vikram.name} · ${location} — ${category} (moderate).`;
    for (const s of this.staffByKey.values()) {
      const link = s.role === 'admin' ? `/admin/emergencies?open=${id}` : `/staff/emergencies?open=${id}`;
      this.notify(s.id, 'emergency', 'Emergency alert', alertBody, link, created, s.id === satvir.id);
    }
    for (const d of this.doctors) this.notify(d.id, 'emergency', 'Emergency alert', alertBody, null, created, false);
  }

  // -------------------------------------------------------------------------
  // Chat & calls
  // -------------------------------------------------------------------------

  private insertConversations(): void {
    const aaravRhinitisId = this.apptIdByTag.get('aarav-rhinitis');
    const d18 = aaravRhinitisId ? this.apptPlanById.get(aaravRhinitisId)!.date : addDaysStr(this.today, -18);
    const on = (date: string, time: string) => localIso(date, time);
    type Msg = { from: 's' | 'd'; at: string; body: string; read?: boolean };
    type CallSpec = { caller: 's' | 'd'; startedAt: string; durationSec: number; insertAfter: number };

    const conversation = (studentKey: string, doctorKey: string, msgs: Msg[], call?: CallSpec) => {
      const s = this.stu.get(studentKey)!;
      const d = this.doc.get(doctorKey)!;
      const all = msgs.map((m) => ({ ...m, at: this.past(m.at) }));
      const callEnd = call ? addMin(call.startedAt, call.durationSec / 60) : null;
      const times = [...all.map((m) => m.at), ...(callEnd ? [callEnd] : [])].sort();
      const info = db
        .prepare('INSERT INTO conversations (student_id, doctor_id, created_at, last_message_at) VALUES (?, ?, ?, ?)')
        .run(s.id, d.id, times[0], times[times.length - 1]);
      const convId = Number(info.lastInsertRowid);
      this.convIdByPair.set(`${studentKey}|${doctorKey}`, convId);
      const insertMsg = db.prepare(
        'INSERT INTO messages (conversation_id, sender_id, kind, body, meta, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      const emit = (m: Msg) => {
        const sender = m.from === 's' ? s.id : d.id;
        const readAt = m.read === false ? null : this.past(addMin(m.at, this.rng.int(1, 20)));
        insertMsg.run(convId, sender, 'text', m.body, null, m.at, readAt);
      };
      all.forEach((m, i) => {
        emit(m);
        if (call && call.insertAfter === i && callEnd) {
          const callerId = call.caller === 's' ? s.id : d.id;
          const calleeId = call.caller === 's' ? d.id : s.id;
          const answered = new Date(Date.parse(call.startedAt) + 11_000).toISOString();
          const c = db
            .prepare(
              `INSERT INTO calls (conversation_id, appointment_id, caller_id, callee_id, status, started_at, answered_at, ended_at, duration_sec)
               VALUES (?, NULL, ?, ?, 'completed', ?, ?, ?, ?)`,
            )
            .run(convId, callerId, calleeId, call.startedAt, answered, callEnd, call.durationSec);
          const callId = Number(c.lastInsertRowid);
          insertMsg.run(
            convId,
            callerId,
            'call',
            `Video call · ${fmtDuration(call.durationSec)}`,
            JSON.stringify({ callStatus: 'completed', durationSec: call.durationSec, callId }),
            callEnd,
            callEnd,
          );
          const callerName = call.caller === 's' ? s.name : d.name;
          const calleeName = call.caller === 's' ? d.name : s.name;
          this.activity(callerId, 'call.completed', 'call', `${callerName} completed a ${fmtDuration(call.durationSec)} video call with ${calleeName}`, 'call', callId, callEnd);
        }
      });
      return convId;
    };

    const d19 = addDaysStr(d18, 1);
    const d24 = addDaysStr(d18, 6);
    conversation(
      'aarav',
      'ritu',
      [
        { from: 's', at: on(d19, '09:12'), body: "Good morning ma'am, I started the medicines you prescribed yesterday. The sneezing is much better, but I feel a little drowsy in the morning lectures. Is that normal?" },
        { from: 'd', at: on(d19, '11:40'), body: 'Good morning Aarav. Mild drowsiness can happen with the Montelukast-Levocetirizine tablet. Keep taking it only at bedtime and it should settle in a few days.' },
        { from: 's', at: on(d19, '11:43'), body: "Okay ma'am, I'll take it at night. Should I continue the steam inhalation too?" },
        { from: 'd', at: on(d19, '11:47'), body: 'Yes, twice a day for the full 7 days. Also keep your room window closed on dusty evenings.' },
        { from: 's', at: on(d24, '18:05'), body: "Ma'am, the cold is almost gone. Could we do a quick video check before I finish the course?" },
        { from: 'd', at: on(d24, '18:39'), body: "Glad you're feeling better. Complete the remaining doses and come to the OPD if the symptoms return." },
        { from: 's', at: on(d24, '18:41'), body: "Thank you, ma'am!" },
      ],
      { caller: 'd', startedAt: on(d24, '18:31'), durationSec: 400, insertAfter: 4 },
    );

    const kabirConv = conversation('kabir', 'ritu', [
      { from: 's', at: this.dayIso(-3, '19:02'), body: "Good evening ma'am, is the OPD open on Sunday mornings?" },
      { from: 'd', at: this.dayIso(-3, '19:20'), body: 'Yes Kabir — on Sundays the OPD runs from 9 AM to 1 PM and 2 PM to 7 PM.' },
      { from: 's', at: this.minutesAgo(95), body: "Ma'am, I had fever yesterday and missed my quiz. Can I get a medical certificate if I come to the OPD today?", read: false },
    ]);
    this.notify(this.ritu.id, 'message', 'New message from Kabir Singh', 'Ma\'am, I had fever yesterday and missed my quiz. Can I get a medical certificate…', `/doctor/messages?c=${kabirConv}`, this.minutesAgo(95), false);

    conversation('meera', 'mahroosh', [
      { from: 's', at: this.dayIso(-8, '16:10'), body: 'Sir, the migraine came back after two weeks. Should I continue the same tablets?' },
      { from: 'd', at: this.dayIso(-8, '17:02'), body: 'Take paracetamol only when the headache starts, and keep a headache diary for a week. Book a follow-up if it happens more than twice a week.' },
      { from: 's', at: this.dayIso(-8, '17:05'), body: 'Okay sir, thank you.' },
    ]);

    conversation(
      'tanvi',
      'ishita',
      [
        { from: 's', at: this.dayIso(-5, '15:40'), body: "Hi ma'am, thank you for today's session. The breathing exercise really helped." },
        { from: 'd', at: this.dayIso(-5, '16:25'), body: "I'm glad to hear that, Tanvi. Practise it every night this week and note how you sleep — we'll go over it in our next session." },
      ],
    );
    // The Tanvi call happened before the first message: insert it explicitly.
    {
      const convId = this.convIdByPair.get('tanvi|ishita')!;
      const tanvi = this.stu.get('tanvi')!;
      const ishita = this.doc.get('ishita')!;
      const startedAt = this.dayIso(-5, '15:00');
      const ended = addMin(startedAt, 1445 / 60);
      const c = db
        .prepare(
          `INSERT INTO calls (conversation_id, appointment_id, caller_id, callee_id, status, started_at, answered_at, ended_at, duration_sec)
           VALUES (?, NULL, ?, ?, 'completed', ?, ?, ?, 1445)`,
        )
        .run(convId, ishita.id, tanvi.id, startedAt, addMin(startedAt, 0.15), ended);
      const callId = Number(c.lastInsertRowid);
      db.prepare(
        'INSERT INTO messages (conversation_id, sender_id, kind, body, meta, created_at, read_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        convId,
        ishita.id,
        'call',
        `Video call · ${fmtDuration(1445)}`,
        JSON.stringify({ callStatus: 'completed', durationSec: 1445, callId }),
        ended,
        ended,
      );
      this.activity(ishita.id, 'call.completed', 'call', `${ishita.name} completed a ${fmtDuration(1445)} video call with ${tanvi.name}`, 'call', callId, ended);
      db.prepare('UPDATE conversations SET created_at = ? WHERE id = ?').run(startedAt, convId);
    }

    conversation('rohan', 'ajay', [
      { from: 's', at: this.dayIso(-11, '10:15'), body: 'Sir, the ankle swelling has reduced. Can I start light jogging?' },
      { from: 'd', at: this.dayIso(-11, '12:30'), body: 'Good to hear. Start with brisk walking for 3–4 days, then light jogging if there is no pain. Keep the crepe bandage on while running.' },
      { from: 's', at: this.dayIso(-11, '12:34'), body: 'Sure sir, thanks!' },
    ]);
  }

  // -------------------------------------------------------------------------
  // Uploaded documents (generated PDFs)
  // -------------------------------------------------------------------------

  private writeUpload(fileName: string, bytes: Buffer): number {
    const full = path.join(UPLOADS_DIR, fileName);
    try {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      fs.writeFileSync(full, bytes);
    } catch {
      /* file locked by another process — keep the existing copy */
    }
    return bytes.length;
  }

  private insertUploads(): void {
    const a = this.aarav;
    const jeevan = this.doc.get('jeevan')!;
    const insert = db.prepare(
      `INSERT INTO medical_records (student_id, category, title, description, record_date, source, doctor_id,
         consultation_id, appointment_id, prescription_id, file_name, file_path, file_size, mime_type, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'upload', ?, NULL, NULL, NULL, ?, ?, ?, 'application/pdf', ?, ?)`,
    );

    // CBC report
    const cbcDate = addDaysStr(this.today, -25);
    const age = (() => {
      const dob = parseDateStr(a.dob);
      const on = parseDateStr(cbcDate);
      let y = on.getFullYear() - dob.getFullYear();
      if (on.getMonth() < dob.getMonth() || (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate())) y--;
      return y;
    })();
    const row = (test: string, result: string, unit: string, range: string, bold = false): PdfLine => ({
      cells: [
        [40, test],
        [250, result],
        [330, unit],
        [440, range],
      ],
      bold,
    });
    const cbc = buildPdf({
      title: 'Complete Blood Count (CBC) Report',
      subtitle: `Partner diagnostic laboratory  -  Report ID LAB-${this.rng.int(400000, 899999)}`,
      lines: [
        { cells: [[40, `Patient: ${a.name}`], [330, `Roll No.: ${a.rollNo}`]] },
        { cells: [[40, `Age / Sex: ${age} years / ${a.gender}`], [330, 'Sample: EDTA whole blood']] },
        { cells: [[40, `Collected: ${fmtDateFull(cbcDate)}, 08:40 AM`], [330, `Reported: ${fmtDateFull(cbcDate)}, 02:15 PM`]] },
        { text: `Referred by: ${jeevan.name} (${jeevan.title})` },
        { rule: true, gap: 4 },
        row('Test', 'Result', 'Unit', 'Reference range', true),
        { rule: true },
        row('Haemoglobin', '14.6', 'g/dL', '13.0 - 17.0'),
        row('Total leucocyte count', '7,800', 'cells/cumm', '4,000 - 11,000'),
        row('Neutrophils', '62', '%', '40 - 75'),
        row('Lymphocytes', '30', '%', '20 - 45'),
        row('Eosinophils', '3', '%', '1 - 6'),
        row('Platelet count', '2.4', 'lakh/cumm', '1.5 - 4.5'),
        row('RBC count', '5.1', 'million/cumm', '4.5 - 5.9'),
        row('Haematocrit (PCV)', '44', '%', '40 - 52'),
        row('MCV', '86', 'fL', '80 - 100'),
        row('ESR', '12', 'mm/hr', '0 - 15'),
        { rule: true, gap: 4 },
        { text: 'Impression: All parameters are within normal limits. No evidence of infection or anaemia.', bold: true },
        { text: 'Correlate clinically. Repeat only if symptoms recur.', muted: true },
      ],
      footer: 'This is a computer-generated report and does not require a signature.',
    });
    const cbcSize = this.writeUpload('seed-cbc-report.pdf', cbc);
    const cbcCreated = localIso(cbcDate, '19:30');
    const cbcInfo = insert.run(
      a.id,
      'lab_report',
      'Complete Blood Count (CBC) report',
      'Routine CBC after viral fever — all values within normal limits.',
      cbcDate,
      jeevan.id,
      'CBC_Report_Aarav_Mehta.pdf',
      'seed-cbc-report.pdf',
      cbcSize,
      a.id,
      cbcCreated,
    );
    this.activity(a.id, 'record.uploaded', 'record', `${a.name} uploaded a lab report: Complete Blood Count (CBC) report`, 'medical_record', Number(cbcInfo.lastInsertRowid), cbcCreated);

    // Vaccination record
    const vacc = buildPdf({
      title: 'Vaccination Record',
      subtitle: 'Immunisation summary uploaded by the student',
      lines: [
        { cells: [[40, `Name: ${a.name}`], [330, `Roll No.: ${a.rollNo}`]] },
        { cells: [[40, `Date of birth: ${fmtDateFull(a.dob)}`], [330, `Blood group: ${a.bloodGroup}`]] },
        { rule: true, gap: 4 },
        { cells: [[40, 'Vaccine'], [215, 'Dose'], [300, 'Date'], [400, 'Administered at']], bold: true },
        { rule: true },
        { cells: [[40, 'COVID-19 (Covishield)'], [215, 'Dose 1'], [300, '14 Jul 2021'], [400, 'Government centre']] },
        { cells: [[40, 'COVID-19 (Covishield)'], [215, 'Dose 2'], [300, '06 Oct 2021'], [400, 'Government centre']] },
        { cells: [[40, 'COVID-19 (Covishield)'], [215, 'Precaution'], [300, '18 Aug 2022'], [400, 'Government centre']] },
        { cells: [[40, 'Hepatitis B'], [215, 'Dose 1'], [300, '10 Jan 2023'], [400, 'Private clinic']] },
        { cells: [[40, 'Hepatitis B'], [215, 'Dose 2'], [300, '10 Feb 2023'], [400, 'Private clinic']] },
        { cells: [[40, 'Hepatitis B'], [215, 'Dose 3'], [300, '12 Jul 2023'], [400, 'Private clinic']] },
        { cells: [[40, 'Tetanus & diphtheria (Td)'], [215, 'Booster'], [300, '03 Sep 2024'], [400, 'Health centre']] },
        { rule: true, gap: 4 },
        { text: 'Primary immunisation schedule complete. Next Td booster due in 2034.', bold: true },
      ],
      footer: 'Summary prepared from original vaccination certificates for the health record.',
    });
    const vaccSize = this.writeUpload('seed-vaccination-record.pdf', vacc);
    insert.run(
      a.id,
      'vaccination',
      'COVID-19 & Hepatitis B vaccination record',
      'Vaccination certificate summary uploaded for the health record.',
      addDaysStr(this.today, -200),
      null,
      'Vaccination_Record.pdf',
      'seed-vaccination-record.pdf',
      vaccSize,
      a.id,
      this.dayIso(-35, '20:10'),
    );
  }

  // -------------------------------------------------------------------------
  // Notifications & activity not tied to a single workflow above
  // -------------------------------------------------------------------------

  private insertMiscNotifications(): void {
    const a = this.aarav;
    const id = (tag: string) => this.apptIdByTag.get(tag)!;
    const plan = (tag: string) => this.apptPlanById.get(id(tag))!;
    const rxOf = (tag: string) => this.prescriptions.find((r) => r.tag === tag);

    // Aarav — appointment & prescription history.
    const up = plan('aarav-upcoming');
    this.notify(
      a.id,
      'appointment',
      'Appointment confirmed',
      `Your video consultation with ${up.doctor.name} is confirmed for ${fmtDayLong(up.date)} at ${fmt12(up.start)}.`,
      `/student/appointments?open=${id('aarav-upcoming')}`,
      up.createdAt,
      false,
    );
    const acne = plan('aarav-acne');
    this.notify(a.id, 'consultation', 'Consultation completed', `${acne.doctor.name} completed your consultation (${acne.tpl.diagnosis}).`, `/student/appointments?open=${id('aarav-acne')}`, acne.completedAt!, true);
    const acneRx = rxOf('aarav-acne');
    if (acneRx) this.notify(a.id, 'prescription', 'New prescription issued', `${acne.doctor.name} issued prescription ${acneRx.code} with ${plural(acneRx.items.length, 'medicine')}.`, `/student/prescriptions?open=${acneRx.id}`, acneRx.createdAt, true);
    const canc = plan('aarav-cancelled');
    this.notify(a.id, 'appointment', 'Appointment cancelled', `You cancelled your appointment with ${canc.doctor.name} on ${fmtDay(canc.date)} at ${fmt12(canc.start)}.`, `/student/appointments?open=${id('aarav-cancelled')}`, canc.cancel!.at, true);
    const rhin = plan('aarav-rhinitis');
    const rhinRx = rxOf('aarav-rhinitis');
    if (rhinRx) this.notify(a.id, 'prescription', 'New prescription issued', `${rhin.doctor.name} issued prescription ${rhinRx.code} with ${plural(rhinRx.items.length, 'medicine')}.`, `/student/prescriptions?open=${rhinRx.id}`, rhinRx.createdAt, true);

    // Dr. Ritu Bassi — queue and booking updates.
    const rituPlans = [...this.apptPlanById.entries()].filter(([, p]) => p.doctor.id === this.ritu.id);
    const checkedIn = rituPlans.find(([, p]) => p.status === 'checked_in');
    if (checkedIn) {
      const [apptId, p] = checkedIn;
      this.notify(this.ritu.id, 'appointment', 'Patient checked in', `${p.student.name} checked in for ${fmt12(p.start)} — token #${p.tokenNo}.`, `/doctor/appointments?open=${apptId}`, p.checkedInAt!, false);
    }
    const upcomingBooked = rituPlans
      .filter(([, p]) => p.status === 'scheduled' && p.date >= this.today)
      .sort((x, y) => y[1].createdAt.localeCompare(x[1].createdAt));
    upcomingBooked.slice(0, 2).forEach(([apptId, p], i) => {
      this.notify(
        this.ritu.id,
        'appointment',
        'New appointment booked',
        `${p.student.name} booked ${p.date === this.today ? 'today' : fmtDayLong(p.date)} at ${fmt12(p.start)} (${p.tpl.reason}).`,
        `/doctor/appointments?open=${apptId}`,
        p.createdAt,
        i > 0,
      );
    });
    const rituCancelled = rituPlans
      .filter(([, p]) => p.cancel?.role === 'student')
      .sort((x, y) => y[1].cancel!.at.localeCompare(x[1].cancel!.at))[0];
    if (rituCancelled) {
      const [apptId, p] = rituCancelled;
      this.notify(this.ritu.id, 'appointment', 'Appointment cancelled', `${p.student.name} cancelled the appointment on ${fmtDay(p.date)} at ${fmt12(p.start)}.`, `/doctor/appointments?open=${apptId}`, p.cancel!.at, true);
    }

    // Other students — recent booking confirmations.
    let confirmations = 0;
    for (const [apptId, p] of this.apptPlanById) {
      if (confirmations >= 12) break;
      if (p.student.demo || p.status !== 'scheduled' || p.createdAt < this.dayIso(-3, '00:00')) continue;
      this.notify(
        p.student.id,
        'appointment',
        'Appointment confirmed',
        `Your ${p.mode === 'video' ? 'video consultation' : 'appointment'} with ${p.doctor.name} is confirmed for ${fmtDayLong(p.date)} at ${fmt12(p.start)}.`,
        `/student/appointments?open=${apptId}`,
        p.createdAt,
        this.rng.chance(0.5),
      );
      confirmations++;
    }

    // Inventory alerts for staff and admin.
    const ors = this.m('ORS (WHO formula) Sachet');
    const amox = this.m('Amoxicillin 500 mg');
    const cmc = this.m('Carboxymethylcellulose 0.5% Eye Drops');
    this.notify(this.abhishek.id, 'inventory', `Low stock: ${ors.name}`, `Only ${ors.target} sachets left (minimum ${ors.minStock}). Raise a purchase order.`, `/staff/inventory?open=${ors.id}`, this.dayIso(-1, '09:00'), false);
    this.notify(this.abhishek.id, 'inventory', `Expiring soon: ${amox.name}`, `Batch ${amox.batchNo} expires on ${fmtDateFull(amox.expiryDate)}. Dispense first or return to the supplier.`, `/staff/inventory?open=${amox.id}`, this.dayIso(-2, '09:05'), true);
    this.notify(this.abhishek.id, 'inventory', `Expired stock: ${cmc.name}`, `Batch ${cmc.batchNo} expired on ${fmtDateFull(cmc.expiryDate)}. Remove ${cmc.target} vials from the shelf.`, `/staff/inventory?open=${cmc.id}`, this.dayIso(-9, '09:00'), false);
    const lowCount = this.meds.filter((m) => m.target > 0 && m.target <= m.minStock).length;
    this.notify(this.vishal.id, 'inventory', 'Low stock alert', `${plural(lowCount, 'medicine')} are at or below their minimum stock level.`, '/admin/inventory', this.dayIso(-1, '09:05'), false);
    this.notify(this.vishal.id, 'inventory', 'Expired stock detected', `${cmc.name} (batch ${cmc.batchNo}) has expired and should be removed.`, `/admin/inventory?open=${cmc.id}`, this.dayIso(-9, '09:10'), true);

    // Admin — account and weekly summary.
    const gurleen = this.stu.get('gurleen')!;
    this.notify(this.vishal.id, 'system', 'New student account created', `Neha created an account for ${gurleen.name} (${gurleen.department}).`, '/admin/users', gurleen.createdAt, true);
    const weekStart = this.dayIso(-7, '00:00');
    const weekEnd = this.dayIso(0, '00:00');
    const consults = (
      db
        .prepare("SELECT COUNT(*) AS c FROM consultations WHERE status = 'completed' AND completed_at >= ? AND completed_at < ?")
        .get(weekStart, weekEnd) as { c: number }
    ).c;
    const fulfilled = (
      db
        .prepare("SELECT COUNT(*) AS c FROM medicine_requests WHERE status = 'fulfilled' AND fulfilled_at >= ? AND fulfilled_at < ?")
        .get(weekStart, weekEnd) as { c: number }
    ).c;
    this.notify(
      this.vishal.id,
      'system',
      'Weekly health centre summary',
      `${plural(consults, 'consultation')} completed and ${plural(fulfilled, 'medicine request')} fulfilled in the last 7 days.`,
      '/admin',
      this.dayIso(0, '00:05') < this.nowIsoStr ? this.dayIso(0, '00:05') : this.dayIso(-1, '23:55'),
      true,
    );
  }

  private insertMiscActivity(): void {
    const neha = this.staffByKey.get('neha')!;
    const gurleen = this.stu.get('gurleen')!;
    const rahul = this.stu.get('rahul')!;
    this.activity(neha.id, 'user.created', 'user', `Neha created a student account for ${gurleen.name}`, 'user', gurleen.id, gurleen.createdAt);
    this.activity(this.vishal.id, 'user.deactivated', 'user', `${this.vishal.name} deactivated the account of ${rahul.name}`, 'user', rahul.id, this.dayIso(-9, '11:00'));
    this.activity(this.ritu.id, 'availability.updated', 'appointment', `${this.ritu.name} updated the weekly OPD schedule`, 'user', this.ritu.id, this.dayIso(-20, '09:10'));
    this.activity(this.aarav.id, 'profile.updated', 'user', `${this.aarav.name} updated the medical profile (allergies and emergency contact)`, 'user', this.aarav.id, this.dayIso(-9, '21:30'));
  }
}
