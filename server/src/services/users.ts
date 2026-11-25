/**
 * Admin user management + self-service profile updates.
 */
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { APPOINTMENT_MODES, DEMO_PASSWORD, ROLE_LABELS, ROLES, type Role } from '@shared/constants';
import type { AuthUser, UserListItem } from '@shared/types';
import { db, tx } from '../db';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { toJson } from '../lib/json';
import { nowIso, toMinutes } from '../lib/time';
import { parse, zDate, zTime } from '../lib/validate';
import { destroyUserSessions, type SessionUser } from '../middleware/auth';
import { disconnectUser, emitInvalidate } from '../realtime/io';
import { logActivity } from './activity';
import { avatarColorFor } from './core-format';
import { getAuthUser, getUserRow } from './minis';

// ---------------------------------------------------------------------------
// Schemas (no defaults on optional fields → undefined means "leave unchanged")
// ---------------------------------------------------------------------------
const optText = (max: number) => z.string().trim().max(max).nullable().optional();
const strList = z.array(z.string().trim().min(1).max(80)).max(25);
const optNum = (min: number, max: number, label: string) =>
  z
    .number({ message: `${label} must be a number.` })
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} must be at most ${max}.`)
    .nullable()
    .optional();
const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+\d][\d\s-]{6,19}$/, 'Enter a valid phone number.')
  .or(z.literal(''))
  .nullable()
  .optional();

export const scheduleBlockSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: zTime,
    endTime: zTime,
  })
  .refine((b) => toMinutes(b.startTime) < toMinutes(b.endTime), {
    message: 'Each session must end after it starts.',
    path: ['endTime'],
  });

const studentShape = {
  rollNo: z.string().trim().min(3, 'Enter the roll number.').max(20),
  department: z.string().trim().min(2, 'Choose a department.').max(80),
  program: z.string().trim().min(2, 'Choose a programme.').max(20),
  year: z.number().int().min(1, 'Year must be between 1 and 6.').max(6, 'Year must be between 1 and 6.'),
  gender: optText(20),
  dateOfBirth: zDate.nullable().optional(),
  bloodGroup: optText(5),
  hostel: optText(40),
  room: optText(20),
  emergencyContactName: optText(80),
  emergencyContactPhone: phone,
  emergencyContactRelation: optText(30),
  allergies: strList.optional(),
  conditions: strList.optional(),
  medications: strList.optional(),
  heightCm: optNum(50, 250, 'Height'),
  weightKg: optNum(20, 250, 'Weight'),
};

const doctorShape = {
  specialty: z.string().trim().min(2, 'Enter a specialty.').max(80),
  qualifications: z.string().trim().min(2, 'Enter qualifications.').max(160),
  experienceYears: optNum(0, 60, 'Experience'),
  bio: optText(1000),
  languages: strList.optional(),
  room: optText(40),
  slotMinutes: z
    .number()
    .int()
    .refine((v) => [10, 15, 20, 30].includes(v), 'Slot length must be 10, 15, 20 or 30 minutes.')
    .optional(),
  isVisiting: z.boolean().optional(),
  isAccepting: z.boolean().optional(),
  consultationModes: z.array(z.enum(APPOINTMENT_MODES)).min(1, 'Offer at least one consultation mode.').optional(),
  schedule: z.array(scheduleBlockSchema).max(40).optional(),
};

const staffShape = {
  designation: z.string().trim().min(2, 'Enter a designation.').max(80),
  qualifications: optText(160),
  experienceYears: optNum(0, 60, 'Experience'),
  shift: optText(80),
};

const baseUserShape = {
  name: z.string().trim().min(2, 'Enter the full name.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(120),
  phone,
  title: optText(80),
};

export const createUserSchema = z
  .object({
    role: z.enum(ROLES),
    ...baseUserShape,
    password: z.string().min(6, 'Password must be at least 6 characters.').max(100).optional(),
    student: z.object(studentShape).optional(),
    doctor: z.object(doctorShape).optional(),
    staff: z.object(staffShape).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === 'student' && !v.student) ctx.addIssue({ code: 'custom', path: ['student'], message: 'Student details are required.' });
    if (v.role === 'doctor' && !v.doctor) ctx.addIssue({ code: 'custom', path: ['doctor'], message: 'Doctor details are required.' });
    if ((v.role === 'staff' || v.role === 'admin') && !v.staff) {
      ctx.addIssue({ code: 'custom', path: ['staff'], message: 'Designation is required.' });
    }
  });

export const updateUserSchema = z.object({
  name: baseUserShape.name.optional(),
  email: baseUserShape.email.optional(),
  phone,
  title: optText(80),
  student: z.object(studentShape).partial().optional(),
  doctor: z.object(doctorShape).partial().optional(),
  staff: z.object(staffShape).partial().optional(),
});

export const statusSchema = z.object({ isActive: z.boolean() });

export const listUsersSchema = z.object({
  role: z.enum(ROLES).optional(),
  search: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const clean = (v: string | null | undefined) => (v === undefined ? undefined : v ? v : null);

/** Builds "col = ?" fragments for the defined values only. */
function setClauses(map: Record<string, unknown>): { sql: string; values: unknown[] } {
  const entries = Object.entries(map).filter(([, v]) => v !== undefined);
  return { sql: entries.map(([col]) => `${col} = ?`).join(', '), values: entries.map(([, v]) => v) };
}

function runUpdate(table: string, keyCol: string, key: number, map: Record<string, unknown>) {
  const { sql, values } = setClauses(map);
  if (!sql) return;
  db.prepare(`UPDATE ${table} SET ${sql} WHERE ${keyCol} = ?`).run(...values, key);
}

function assertNoOverlaps(schedule: { weekday: number; startTime: string; endTime: string }[]) {
  const byDay = new Map<number, { s: number; e: number }[]>();
  for (const b of schedule) {
    const list = byDay.get(b.weekday) ?? [];
    list.push({ s: toMinutes(b.startTime), e: toMinutes(b.endTime) });
    byDay.set(b.weekday, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.s - b.s);
    for (let i = 1; i < list.length; i++) {
      if (list[i].s < list[i - 1].e) throw badRequest('OPD sessions on the same day cannot overlap.', { schedule: 'Overlapping sessions.' });
    }
  }
}

export function replaceSchedule(doctorId: number, schedule: { weekday: number; startTime: string; endTime: string }[]) {
  assertNoOverlaps(schedule);
  db.prepare('DELETE FROM doctor_schedules WHERE doctor_id = ?').run(doctorId);
  const insert = db.prepare('INSERT INTO doctor_schedules (doctor_id, weekday, start_time, end_time) VALUES (?, ?, ?, ?)');
  for (const b of [...schedule].sort((a, b) => a.weekday - b.weekday || toMinutes(a.startTime) - toMinutes(b.startTime))) {
    insert.run(doctorId, b.weekday, b.startTime, b.endTime);
  }
}

function studentTitle(program: string, year: number): string {
  return `${program} · Year ${year}`;
}

export function toUserListItem(id: number): UserListItem {
  const user = getAuthUser(id);
  if (!user) throw notFound('User');
  let summary: string = ROLE_LABELS[user.role];
  if (user.student) summary = `${user.student.rollNo} · ${user.student.department} · Year ${user.student.year}`;
  else if (user.doctor) summary = user.doctor.specialty;
  else if (user.staff) summary = user.staff.designation;
  return { ...user, summary };
}

const ROLE_ORDER = `CASE u.role WHEN 'student' THEN 1 WHEN 'doctor' THEN 2 WHEN 'staff' THEN 3 ELSE 4 END`;

export function listUsers(q: z.output<typeof listUsersSchema>): UserListItem[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.role) {
    where.push('u.role = ?');
    params.push(q.role);
  }
  if (q.status) where.push(q.status === 'active' ? 'u.is_active = 1' : 'u.is_active = 0');
  if (q.search) {
    const like = `%${q.search}%`;
    where.push(
      `(u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.title LIKE ? OR sp.roll_no LIKE ? OR sp.department LIKE ?
        OR dp.specialty LIKE ? OR tp.designation LIKE ?)`,
    );
    params.push(like, like, like, like, like, like, like, like);
  }
  const rows = db
    .prepare(
      `SELECT u.id FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.id
         LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
         LEFT JOIN staff_profiles tp ON tp.user_id = u.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY ${ROLE_ORDER}, u.name ASC`,
    )
    .all(...params) as { id: number }[];
  return rows.map((r) => toUserListItem(r.id));
}

function assertEmailFree(email: string, exceptId?: number) {
  const row = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email) as { id: number } | undefined;
  if (row && row.id !== exceptId) throw conflict('EMAIL_TAKEN', 'Another account already uses this email address.');
}

function assertRollFree(rollNo: string, exceptId?: number) {
  const row = db.prepare('SELECT user_id FROM student_profiles WHERE roll_no = ? COLLATE NOCASE').get(rollNo) as
    | { user_id: number }
    | undefined;
  if (row && row.user_id !== exceptId) throw conflict('ROLL_NO_TAKEN', 'Another student already has this roll number.');
}

// ---------------------------------------------------------------------------
// Admin mutations
// ---------------------------------------------------------------------------
export function createUser(actor: SessionUser, input: z.output<typeof createUserSchema>): UserListItem {
  assertEmailFree(input.email);
  if (input.student) assertRollFree(input.student.rollNo);
  if (input.doctor?.schedule) assertNoOverlaps(input.doctor.schedule);
  const passwordHash = bcrypt.hashSync(input.password ?? DEMO_PASSWORD, 10);

  const id = tx(() => {
    let title = clean(input.title) ?? null;
    if (!title && input.student) title = studentTitle(input.student.program, input.student.year);
    if (!title && input.doctor) title = 'Medical Officer';
    if (!title && input.staff) title = input.staff.designation;
    const info = db
      .prepare(
        `INSERT INTO users (role, name, email, password_hash, phone, title, avatar_color, is_active, is_demo, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
      )
      .run(input.role, input.name, input.email, passwordHash, clean(input.phone) ?? null, title, avatarColorFor(input.name), nowIso());
    const userId = Number(info.lastInsertRowid);
    if (input.role === 'student' && input.student) {
      const s = input.student;
      db.prepare(
        `INSERT INTO student_profiles (user_id, roll_no, department, program, year, gender, date_of_birth, blood_group, hostel, room,
           emergency_contact_name, emergency_contact_phone, emergency_contact_relation, allergies, conditions, medications, height_cm, weight_kg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        userId,
        s.rollNo,
        s.department,
        s.program,
        s.year,
        clean(s.gender) ?? null,
        s.dateOfBirth ?? null,
        clean(s.bloodGroup) ?? null,
        clean(s.hostel) ?? null,
        clean(s.room) ?? null,
        clean(s.emergencyContactName) ?? null,
        clean(s.emergencyContactPhone) ?? null,
        clean(s.emergencyContactRelation) ?? null,
        toJson(s.allergies ?? []),
        toJson(s.conditions ?? []),
        toJson(s.medications ?? []),
        s.heightCm ?? null,
        s.weightKg ?? null,
      );
    } else if (input.role === 'doctor' && input.doctor) {
      const d = input.doctor;
      db.prepare(
        `INSERT INTO doctor_profiles (user_id, specialty, qualifications, experience_years, bio, languages, room, slot_minutes,
           is_accepting, is_visiting, consultation_modes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        userId,
        d.specialty,
        d.qualifications,
        d.experienceYears ?? null,
        clean(d.bio) ?? null,
        toJson(d.languages ?? ['English', 'Hindi']),
        clean(d.room) ?? null,
        d.slotMinutes ?? 15,
        d.isAccepting === false ? 0 : 1,
        d.isVisiting ? 1 : 0,
        toJson(d.consultationModes ?? ['in_person', 'video']),
      );
      const schedule =
        d.schedule && d.schedule.length
          ? d.schedule
          : [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startTime: '09:00', endTime: '13:00' }));
      replaceSchedule(userId, schedule);
    } else if (input.staff) {
      const t = input.staff;
      db.prepare(
        'INSERT INTO staff_profiles (user_id, designation, qualifications, experience_years, shift) VALUES (?, ?, ?, ?, ?)',
      ).run(userId, t.designation, clean(t.qualifications) ?? null, t.experienceYears ?? null, clean(t.shift) ?? null);
    }
    return userId;
  });

  logActivity({
    actorId: actor.id,
    action: 'user.created',
    category: 'user',
    description: `${actor.name} added ${ROLE_LABELS[input.role].toLowerCase()} account for ${input.name}`,
    entityType: 'user',
    entityId: id,
  });
  emitInvalidate(['users', 'doctors', 'patients', 'dashboard']);
  return toUserListItem(id);
}

export function updateUser(actor: SessionUser, id: number, input: z.output<typeof updateUserSchema>): UserListItem {
  const existing = getUserRow(id);
  if (!existing) throw notFound('User');
  if (input.email) assertEmailFree(input.email, id);
  if (input.student?.rollNo) assertRollFree(input.student.rollNo, id);

  tx(() => {
    runUpdate('users', 'id', id, {
      name: input.name,
      email: input.email,
      phone: clean(input.phone),
      title: clean(input.title),
    });
    applyRoleProfile(existing.role, id, input);
  });

  logActivity({
    actorId: actor.id,
    action: 'user.updated',
    category: 'user',
    description: `${actor.name} updated the account of ${input.name ?? existing.name}`,
    entityType: 'user',
    entityId: id,
  });
  emitInvalidate(['users', 'doctors', 'doctor', 'patients', 'patient', 'me', 'dashboard']);
  return toUserListItem(id);
}

/** Applies the role-specific part of a (partial) profile update. Call inside a transaction. */
function applyRoleProfile(
  role: Role,
  id: number,
  input: {
    student?: Partial<z.output<z.ZodObject<typeof studentShape>>>;
    doctor?: Partial<z.output<z.ZodObject<typeof doctorShape>>>;
    staff?: Partial<z.output<z.ZodObject<typeof staffShape>>>;
  },
) {
  if (role === 'student' && input.student) {
    const s = input.student;
    runUpdate('student_profiles', 'user_id', id, {
      roll_no: s.rollNo,
      department: s.department,
      program: s.program,
      year: s.year,
      gender: clean(s.gender),
      date_of_birth: s.dateOfBirth === undefined ? undefined : s.dateOfBirth,
      blood_group: clean(s.bloodGroup),
      hostel: clean(s.hostel),
      room: clean(s.room),
      emergency_contact_name: clean(s.emergencyContactName),
      emergency_contact_phone: clean(s.emergencyContactPhone),
      emergency_contact_relation: clean(s.emergencyContactRelation),
      allergies: s.allergies ? toJson(s.allergies) : undefined,
      conditions: s.conditions ? toJson(s.conditions) : undefined,
      medications: s.medications ? toJson(s.medications) : undefined,
      height_cm: s.heightCm,
      weight_kg: s.weightKg,
    });
    if (s.program !== undefined || s.year !== undefined) {
      const p = db.prepare('SELECT program, year FROM student_profiles WHERE user_id = ?').get(id) as
        | { program: string; year: number }
        | undefined;
      if (p) db.prepare('UPDATE users SET title = ? WHERE id = ?').run(studentTitle(p.program, p.year), id);
    }
  }
  if (role === 'doctor' && input.doctor) {
    const d = input.doctor;
    runUpdate('doctor_profiles', 'user_id', id, {
      specialty: d.specialty,
      qualifications: d.qualifications,
      experience_years: d.experienceYears,
      bio: clean(d.bio),
      languages: d.languages ? toJson(d.languages) : undefined,
      room: clean(d.room),
      slot_minutes: d.slotMinutes,
      is_visiting: d.isVisiting === undefined ? undefined : d.isVisiting ? 1 : 0,
      is_accepting: d.isAccepting === undefined ? undefined : d.isAccepting ? 1 : 0,
      consultation_modes: d.consultationModes ? toJson(d.consultationModes) : undefined,
    });
    if (d.schedule) replaceSchedule(id, d.schedule);
  }
  if ((role === 'staff' || role === 'admin') && input.staff) {
    const t = input.staff;
    const exists = db.prepare('SELECT 1 FROM staff_profiles WHERE user_id = ?').get(id);
    if (!exists) {
      db.prepare('INSERT INTO staff_profiles (user_id, designation) VALUES (?, ?)').run(id, t.designation ?? ROLE_LABELS[role]);
    }
    runUpdate('staff_profiles', 'user_id', id, {
      designation: t.designation,
      qualifications: clean(t.qualifications),
      experience_years: t.experienceYears,
      shift: clean(t.shift),
    });
    if (t.designation) db.prepare('UPDATE users SET title = ? WHERE id = ?').run(t.designation, id);
  }
}

export function setUserStatus(actor: SessionUser, id: number, isActive: boolean): UserListItem {
  const existing = getUserRow(id);
  if (!existing) throw notFound('User');
  if (!isActive && (existing.is_demo || existing.id === actor.id)) {
    throw forbidden(
      existing.id === actor.id
        ? 'You cannot deactivate your own account.'
        : 'Primary demo accounts are protected and cannot be deactivated.',
      'PROTECTED_ACCOUNT',
    );
  }
  db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
  if (!isActive) {
    destroyUserSessions(id);
    disconnectUser(id);
  }
  logActivity({
    actorId: actor.id,
    action: isActive ? 'user.activated' : 'user.deactivated',
    category: 'user',
    description: `${actor.name} ${isActive ? 'reactivated' : 'deactivated'} the account of ${existing.name}`,
    entityType: 'user',
    entityId: id,
  });
  emitInvalidate(['users', 'doctors', 'patients', 'dashboard']);
  return toUserListItem(id);
}

// ---------------------------------------------------------------------------
// Self-service profile
// ---------------------------------------------------------------------------
export const studentProfileUpdateSchema = z.object({
  name: baseUserShape.name.optional(),
  phone,
  department: studentShape.department.optional(),
  program: studentShape.program.optional(),
  year: studentShape.year.optional(),
  gender: studentShape.gender,
  dateOfBirth: studentShape.dateOfBirth,
  bloodGroup: studentShape.bloodGroup,
  hostel: studentShape.hostel,
  room: studentShape.room,
  emergencyContactName: studentShape.emergencyContactName,
  emergencyContactPhone: studentShape.emergencyContactPhone,
  emergencyContactRelation: studentShape.emergencyContactRelation,
  allergies: studentShape.allergies,
  conditions: studentShape.conditions,
  medications: studentShape.medications,
  heightCm: studentShape.heightCm,
  weightKg: studentShape.weightKg,
});

export const doctorProfileUpdateSchema = z.object({
  name: baseUserShape.name.optional(),
  phone,
  bio: optText(1000),
  languages: strList.optional(),
  room: optText(40),
  qualifications: doctorShape.qualifications.optional(),
});

export const staffProfileUpdateSchema = z.object({
  name: baseUserShape.name.optional(),
  phone,
  shift: optText(80),
});

export function updateOwnProfile(user: SessionUser, body: unknown): AuthUser {
  if (user.role === 'student') {
    const { name, phone: ph, ...student } = parse(studentProfileUpdateSchema, body);
    tx(() => {
      runUpdate('users', 'id', user.id, { name, phone: clean(ph) });
      applyRoleProfile('student', user.id, { student });
    });
  } else if (user.role === 'doctor') {
    const input = parse(doctorProfileUpdateSchema, body);
    tx(() => {
      runUpdate('users', 'id', user.id, { name: input.name, phone: clean(input.phone) });
      applyRoleProfile('doctor', user.id, {
        doctor: { bio: input.bio, languages: input.languages, room: input.room, qualifications: input.qualifications },
      });
    });
  } else {
    const input = parse(staffProfileUpdateSchema, body);
    tx(() => {
      runUpdate('users', 'id', user.id, { name: input.name, phone: clean(input.phone) });
      if (input.shift !== undefined) {
        const exists = db.prepare('SELECT 1 FROM staff_profiles WHERE user_id = ?').get(user.id);
        if (exists) db.prepare('UPDATE staff_profiles SET shift = ? WHERE user_id = ?').run(clean(input.shift), user.id);
      }
    });
  }
  const updated = getAuthUser(user.id)!;
  logActivity({
    actorId: user.id,
    action: 'profile.updated',
    category: 'user',
    description: `${updated.name} updated their profile`,
    entityType: 'user',
    entityId: user.id,
  });
  emitInvalidate(['me', 'users', 'patients', 'patient', 'doctors', 'doctor']);
  return updated;
}

export const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(100),
});

export function changePassword(user: SessionUser, input: z.output<typeof passwordSchema>): void {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string } | undefined;
  if (!row || !bcrypt.compareSync(input.currentPassword, row.password_hash)) {
    throw badRequest('Your current password is incorrect.', { currentPassword: 'Incorrect password.' }, 'WRONG_PASSWORD');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(input.newPassword, 10), user.id);
}
