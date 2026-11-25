import type { ActivityCategory } from '@shared/constants';
import type { ActivityLog } from '@shared/types';
import { db } from '../db';
import { nowIso } from '../lib/time';
import { emitInvalidate } from '../realtime/io';
import { userMiniFromRow } from './minis';

export interface ActivityInput {
  actorId: number | null;
  action: string; // "<entity>.<verb>"
  category: ActivityCategory;
  description: string; // full human sentence
  entityType?: string | null;
  entityId?: number | null;
  createdAt?: string;
}

export function logActivity(input: ActivityInput): void {
  db.prepare(
    `INSERT INTO activity_logs (actor_id, action, category, description, entity_type, entity_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.actorId,
    input.action,
    input.category,
    input.description,
    input.entityType ?? null,
    input.entityId ?? null,
    input.createdAt ?? nowIso(),
  );
  emitInvalidate(['activity']);
}

/** SELECT list for activity rows joined with their actor (alias `a` = activity_logs, `u` = users). */
export const ACTIVITY_SELECT = `
  SELECT a.*, u.name AS actor_name, u.role AS actor_role, u.avatar_color AS actor_avatar_color, u.title AS actor_title
    FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_id`;

export interface ActivityRow {
  id: number;
  actor_id: number | null;
  action: string;
  category: ActivityCategory;
  description: string;
  entity_type: string | null;
  entity_id: number | null;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
  actor_avatar_color: string | null;
  actor_title: string | null;
}

export function toActivityLog(row: ActivityRow): ActivityLog {
  return {
    id: row.id,
    action: row.action,
    category: row.category,
    description: row.description,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actor:
      row.actor_id && row.actor_name
        ? userMiniFromRow({
            id: row.actor_id,
            name: row.actor_name,
            role: row.actor_role as never,
            avatar_color: row.actor_avatar_color ?? '#0d9488',
            title: row.actor_title,
          })
        : null,
    createdAt: row.created_at,
  };
}

/** Most recent activity, optionally restricted to some categories. */
export function recentActivity(limit = 10, categories?: ActivityCategory[]): ActivityLog[] {
  const where = categories?.length ? `WHERE a.category IN (${categories.map(() => '?').join(',')})` : '';
  const rows = db
    .prepare(`${ACTIVITY_SELECT} ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT ?`)
    .all(...(categories ?? []), limit) as ActivityRow[];
  return rows.map(toActivityLog);
}
