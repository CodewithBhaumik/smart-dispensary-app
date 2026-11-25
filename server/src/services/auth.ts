import bcrypt from 'bcryptjs';
import type { Role } from '@shared/constants';
import type { DemoAccount, LoginResponse } from '@shared/types';
import { db } from '../db';
import { DEMO_MODE } from '../lib/config';
import { AppError, forbidden, notFound } from '../lib/errors';
import { createSession } from '../middleware/auth';
import { logActivity } from './activity';
import { getAuthUser, type UserRow } from './minis';

const ROLE_RANK: Record<Role, number> = { student: 1, doctor: 2, staff: 3, admin: 4 };

export function sessionFor(userId: number): LoginResponse {
  const token = createSession(userId);
  return { token, user: getAuthUser(userId)! };
}

export function login(email: string, password: string): LoginResponse {
  const row = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email.trim()) as
    | (UserRow & { password_hash: string })
    | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
  }
  if (!row.is_active) {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated. Please contact the health centre administrator.');
  }
  const res = sessionFor(row.id);
  logActivity({
    actorId: row.id,
    action: 'auth.login',
    category: 'auth',
    description: `${row.name} signed in`,
    entityType: 'user',
    entityId: row.id,
  });
  return res;
}

/** Identities offered on the login page and in the demo role switcher. */
export function listDemoAccounts(): DemoAccount[] {
  const toAccount = (r: UserRow): DemoAccount => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    title: r.title,
    avatarColor: r.avatar_color,
    isPrimary: !!r.is_demo,
  });
  const primaries = (db.prepare('SELECT * FROM users WHERE is_demo = 1 AND is_active = 1').all() as UserRow[]).sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.id - b.id,
  );
  const doctors = db
    .prepare(`SELECT * FROM users WHERE role = 'doctor' AND is_demo = 0 AND is_active = 1 ORDER BY id`)
    .all() as UserRow[];
  const students = db
    .prepare(`SELECT * FROM users WHERE role = 'student' AND is_demo = 0 AND is_active = 1 ORDER BY id LIMIT 2`)
    .all() as UserRow[];
  return [...primaries, ...doctors, ...students].map(toAccount);
}

export function demoLogin(userId: number): LoginResponse {
  if (!DEMO_MODE) throw forbidden('Demo sign-in is disabled.');
  const account = listDemoAccounts().find((a) => a.id === userId);
  if (!account) throw notFound('Demo account');
  return sessionFor(account.id);
}
