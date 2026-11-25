import type { StatusEvent } from '@shared/types';
import { db } from '../db';
import { nowIso } from '../lib/time';
import { userMiniFromRow } from './minis';

export type TimelineEntity = 'appointment' | 'medicine_request' | 'emergency';

export function addStatusEvent(
  entityType: TimelineEntity,
  entityId: number,
  status: string,
  note: string | null,
  actorId: number | null,
  createdAt: string = nowIso(),
): void {
  db.prepare(
    'INSERT INTO status_events (entity_type, entity_id, status, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(entityType, entityId, status, note, actorId, createdAt);
}

export function getTimeline(entityType: TimelineEntity, entityId: number): StatusEvent[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.status, e.note, e.created_at, e.actor_id,
              u.name AS actor_name, u.role AS actor_role, u.avatar_color AS actor_avatar_color, u.title AS actor_title
         FROM status_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.entity_type = ? AND e.entity_id = ?
        ORDER BY e.created_at ASC, e.id ASC`,
    )
    .all(entityType, entityId) as {
    id: number;
    status: string;
    note: string | null;
    created_at: string;
    actor_id: number | null;
    actor_name: string | null;
    actor_role: string | null;
    actor_avatar_color: string | null;
    actor_title: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    actor:
      r.actor_id && r.actor_name
        ? userMiniFromRow({
            id: r.actor_id,
            name: r.actor_name,
            role: r.actor_role as never,
            avatar_color: r.actor_avatar_color ?? '#0d9488',
            title: r.actor_title,
          })
        : null,
  }));
}
