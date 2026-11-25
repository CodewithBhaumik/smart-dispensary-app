import { Router } from 'express';
import { z } from 'zod';
import { ACTIVITY_CATEGORIES, ROLES, type ActivityCategory } from '@shared/constants';
import type { Paginated, ActivityLog } from '@shared/types';
import { db } from '../db';
import { localIso, addDaysStr } from '../lib/time';
import { parse, zDate } from '../lib/validate';
import { currentUser, requireRole } from '../middleware/auth';
import { ACTIVITY_SELECT, toActivityLog, type ActivityRow } from '../services/activity';

const router = Router();

/** Categories dispensary staff may see (admins see everything). */
export const STAFF_ACTIVITY_CATEGORIES: ActivityCategory[] = ['inventory', 'medicine_request', 'emergency'];

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.enum(ACTIVITY_CATEGORIES).optional(),
  role: z.enum(ROLES).optional(),
  from: zDate.optional(),
  to: zDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

router.get('/', requireRole('admin', 'staff'), (req, res) => {
  const user = currentUser(req);
  const q = parse(listQuery, req.query);
  const where: string[] = [];
  const params: unknown[] = [];

  let categories: ActivityCategory[] | null = q.category ? [q.category] : null;
  if (user.role === 'staff') {
    categories = (categories ?? STAFF_ACTIVITY_CATEGORIES).filter((c) => STAFF_ACTIVITY_CATEGORIES.includes(c));
    if (categories.length === 0) {
      const empty: Paginated<ActivityLog> = { items: [], total: 0 };
      res.json(empty);
      return;
    }
  }
  if (categories) {
    where.push(`a.category IN (${categories.map(() => '?').join(',')})`);
    params.push(...categories);
  }
  if (q.search) {
    const like = `%${q.search}%`;
    where.push('(a.description LIKE ? OR a.action LIKE ?)');
    params.push(like, like);
  }
  if (q.role) {
    where.push('u.role = ?');
    params.push(q.role);
  }
  if (q.from) {
    where.push('a.created_at >= ?');
    params.push(localIso(q.from));
  }
  if (q.to) {
    where.push('a.created_at < ?');
    params.push(localIso(addDaysStr(q.to, 1)));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_id ${whereSql}`)
      .get(...params) as { c: number }
  ).c;
  const rows = db
    .prepare(`${ACTIVITY_SELECT} ${whereSql} ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`)
    .all(...params, q.limit ?? 25, q.offset ?? 0) as ActivityRow[];
  const body: Paginated<ActivityLog> = { items: rows.map(toActivityLog), total };
  res.json(body);
});

export default router;
