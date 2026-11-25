/**
 * Shared row → DTO mappers for people. Used by every domain service.
 */
import type { AppointmentMode, Role } from '@shared/constants';
import type {
  AuthUser,
  DoctorMini,
  DoctorProfile,
  PatientSummary,
  StaffProfile,
  StudentMini,
  StudentProfile,
  UserMini,
} from '@shared/types';
import { db } from '../db';
import { bool, parseJson } from '../lib/json';
import { ageFrom } from '../lib/time';

export interface UserRow {
  id: number;
  role: Role;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  avatar_color: string;
  is_active: number;
  is_demo: number;
  created_at: string;
  last_login_at: string | null;
}

export interface StudentProfileRow {
  user_id: number;
  roll_no: string;
  department: string;
  program: string;
  year: number;
  gender: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  hostel: string | null;
  room: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  allergies: string;
  conditions: string;
  medications: string;
  height_cm: number | null;
  weight_kg: number | null;
}

export interface DoctorProfileRow {
  user_id: number;
  specialty: string;
  qualifications: string;
  experience_years: number | null;
  bio: string | null;
  languages: string;
  room: string | null;
  slot_minutes: number;
  is_accepting: number;
  is_visiting: number;
  consultation_modes: string;
}

export interface StaffProfileRow {
  user_id: number;
  designation: string;
  qualifications: string | null;
  experience_years: number | null;
  shift: string | null;
}

export function userMiniFromRow(row: Pick<UserRow, 'id' | 'name' | 'role' | 'avatar_color' | 'title'>): UserMini {
  return { id: row.id, name: row.name, role: row.role, avatarColor: row.avatar_color, title: row.title };
}

const userStmt = () => db.prepare('SELECT * FROM users WHERE id = ?');

export function getUserRow(id: number): UserRow | null {
  return (userStmt().get(id) as UserRow | undefined) ?? null;
}

export function getUserMini(id: number | null | undefined): UserMini | null {
  if (!id) return null;
  const row = getUserRow(id);
  return row ? userMiniFromRow(row) : null;
}

export function studentProfileFromRow(p: StudentProfileRow): StudentProfile {
  return {
    rollNo: p.roll_no,
    department: p.department,
    program: p.program,
    year: p.year,
    gender: p.gender,
    dateOfBirth: p.date_of_birth,
    bloodGroup: p.blood_group,
    hostel: p.hostel,
    room: p.room,
    emergencyContactName: p.emergency_contact_name,
    emergencyContactPhone: p.emergency_contact_phone,
    emergencyContactRelation: p.emergency_contact_relation,
    allergies: parseJson<string[]>(p.allergies, []),
    conditions: parseJson<string[]>(p.conditions, []),
    medications: parseJson<string[]>(p.medications, []),
    heightCm: p.height_cm,
    weightKg: p.weight_kg,
  };
}

export function doctorProfileFromRow(p: DoctorProfileRow): DoctorProfile {
  return {
    specialty: p.specialty,
    qualifications: p.qualifications,
    experienceYears: p.experience_years,
    bio: p.bio,
    languages: parseJson<string[]>(p.languages, []),
    room: p.room,
    slotMinutes: p.slot_minutes,
    isAccepting: bool(p.is_accepting),
    isVisiting: bool(p.is_visiting),
    consultationModes: parseJson<AppointmentMode[]>(p.consultation_modes, ['in_person']),
  };
}

export function staffProfileFromRow(p: StaffProfileRow): StaffProfile {
  return {
    designation: p.designation,
    qualifications: p.qualifications,
    experienceYears: p.experience_years,
    shift: p.shift,
  };
}

export function getStudentProfileRow(userId: number): StudentProfileRow | null {
  return (
    (db.prepare('SELECT * FROM student_profiles WHERE user_id = ?').get(userId) as StudentProfileRow | undefined) ??
    null
  );
}

export function getDoctorProfileRow(userId: number): DoctorProfileRow | null {
  return (
    (db.prepare('SELECT * FROM doctor_profiles WHERE user_id = ?').get(userId) as DoctorProfileRow | undefined) ?? null
  );
}

export function getStaffProfileRow(userId: number): StaffProfileRow | null {
  return (
    (db.prepare('SELECT * FROM staff_profiles WHERE user_id = ?').get(userId) as StaffProfileRow | undefined) ?? null
  );
}

/** Full signed-in user with role profile. */
export function getAuthUser(id: number): AuthUser | null {
  const row = getUserRow(id);
  if (!row) return null;
  const sp = row.role === 'student' ? getStudentProfileRow(id) : null;
  const dp = row.role === 'doctor' ? getDoctorProfileRow(id) : null;
  const tp = row.role === 'staff' || row.role === 'admin' ? getStaffProfileRow(id) : null;
  return {
    ...userMiniFromRow(row),
    email: row.email,
    phone: row.phone,
    isActive: bool(row.is_active),
    isDemo: bool(row.is_demo),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    student: sp ? studentProfileFromRow(sp) : null,
    doctor: dp ? doctorProfileFromRow(dp) : null,
    staff: tp ? staffProfileFromRow(tp) : null,
  };
}

export function getStudentMini(id: number): StudentMini {
  const row = getUserRow(id);
  const p = getStudentProfileRow(id);
  if (!row) throw new Error(`Student ${id} not found`);
  return {
    ...userMiniFromRow(row),
    email: row.email,
    phone: row.phone,
    rollNo: p?.roll_no ?? '',
    department: p?.department ?? '',
    program: p?.program ?? '',
    year: p?.year ?? 0,
    hostel: p?.hostel ?? null,
    room: p?.room ?? null,
  };
}

export function getDoctorMini(id: number): DoctorMini {
  const row = getUserRow(id);
  const p = getDoctorProfileRow(id);
  if (!row) throw new Error(`Doctor ${id} not found`);
  return {
    ...userMiniFromRow(row),
    specialty: p?.specialty ?? 'General Medicine',
    qualifications: p?.qualifications ?? '',
    room: p?.room ?? null,
  };
}

/** Student medical summary for doctors (allergies, conditions, visit stats). */
export function getPatientSummary(studentId: number): PatientSummary {
  const mini = getStudentMini(studentId);
  const p = getStudentProfileRow(studentId);
  const profile = p ? studentProfileFromRow(p) : null;
  const visits = db
    .prepare(
      `SELECT COUNT(*) AS total, MAX(date) AS last
         FROM appointments WHERE student_id = ? AND status = 'completed'`,
    )
    .get(studentId) as { total: number; last: string | null };
  return {
    ...mini,
    gender: profile?.gender ?? null,
    dateOfBirth: profile?.dateOfBirth ?? null,
    age: ageFrom(profile?.dateOfBirth ?? null),
    bloodGroup: profile?.bloodGroup ?? null,
    allergies: profile?.allergies ?? [],
    conditions: profile?.conditions ?? [],
    medications: profile?.medications ?? [],
    heightCm: profile?.heightCm ?? null,
    weightKg: profile?.weightKg ?? null,
    emergencyContactName: profile?.emergencyContactName ?? null,
    emergencyContactPhone: profile?.emergencyContactPhone ?? null,
    emergencyContactRelation: profile?.emergencyContactRelation ?? null,
    lastVisit: visits.last,
    totalVisits: visits.total,
  };
}

/** Ids of active users with the given role(s). */
export function activeUserIds(roles: Role | Role[], excludeId?: number): number[] {
  const list = Array.isArray(roles) ? roles : [roles];
  const placeholders = list.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id FROM users WHERE is_active = 1 AND role IN (${placeholders})`)
    .all(...list) as { id: number }[];
  return rows.map((r) => r.id).filter((id) => id !== excludeId);
}
