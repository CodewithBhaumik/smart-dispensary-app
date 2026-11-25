import type { NotificationType, Role } from '@shared/constants';
import type { Notification } from '@shared/types';
import { db } from '../db';
import { bool } from '../lib/json';
import { nowIso } from '../lib/time';
import { emitInvalidate, emitToUser } from '../realtime/io';
import { activeUserIds } from './minis';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}

export interface NotificationRow {
  id: number;
  user_id: number;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  is_read: number;
  created_at: string;
}

export function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    isRead: bool(row.is_read),
    createdAt: row.created_at,
  };
}

/** Persists a notification for each user and pushes it live over Socket.IO. */
export function notify(userIds: number | number[], input: NotificationInput): void {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
  if (ids.length === 0) return;
  const insert = db.prepare(
    'INSERT INTO notifications (user_id, type, title, body, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
  );
  const createdAt = nowIso();
  for (const userId of ids) {
    const info = insert.run(userId, input.type, input.title, input.body, input.link ?? null, createdAt);
    const dto: Notification = {
      id: Number(info.lastInsertRowid),
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      isRead: false,
      createdAt,
    };
    emitToUser(userId, 'notification:new', dto);
  }
  emitInvalidate(['notifications'], ids);
}

/** Notifies every active user with the given role(s), optionally excluding one user (the actor). */
export function notifyRole(roles: Role | Role[], input: NotificationInput, excludeUserId?: number): void {
  notify(activeUserIds(roles, excludeUserId), input);
}
