import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Role } from '@shared/constants';
import { db } from '../db';
import { SESSION_DAYS } from '../lib/config';
import { forbidden, unauthorized } from '../lib/errors';
import { nowIso } from '../lib/time';

export interface SessionUser {
  id: number;
  role: Role;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

/** Creates a session and returns the raw bearer token (only its hash is stored). */
export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    nowIso(),
    expires,
  );
  db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(nowIso(), userId);
  return token;
}

export function destroySession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function destroyUserSessions(userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function getUserFromToken(token: string | null | undefined): SessionUser | null {
  if (!token || typeof token !== 'string') return null;
  const row = db
    .prepare(
      `SELECT u.id, u.role, u.name, u.is_active, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as
    | { id: number; role: Role; name: string; is_active: number; expires_at: string }
    | undefined;
  if (!row || !row.is_active || row.expires_at < nowIso()) return null;
  return { id: row.id, role: row.role, name: row.name };
}

export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Attaches `req.user` when a valid bearer token is present (never rejects). */
export const authenticate: RequestHandler = (req, _res, next) => {
  req.user = getUserFromToken(extractToken(req)) ?? undefined;
  next();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw unauthorized();
  next();
};

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}

/** Returns the signed-in user or throws 401 (use inside handlers behind requireAuth). */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
