import { Router, type Request } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { currentUser, requireAuth } from '../middleware/auth';
import { emitInvalidate } from '../realtime/io';
import { toNotification, type NotificationRow } from '../services/notify';

const router = Router();
router.use(requireAuth);

function notificationId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Notification');
  return id;
}

function assertOwned(id: number, userId: number) {
  const row = db.prepare('SELECT id FROM notifications WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw notFound('Notification');
}

const listQuery = z.object({
  filter: z.enum(['all', 'unread']).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

router.get('/', (req, res) => {
  const user = currentUser(req);
  const { filter, limit } = parse(listQuery, req.query);
  const rows = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ${filter === 'unread' ? 'AND is_read = 0' : ''}
        ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(user.id, limit ?? 50) as NotificationRow[];
  res.json(rows.map(toNotification));
});

router.get('/unread-count', (req, res) => {
  const user = currentUser(req);
  const row = db.prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0').get(user.id) as {
    count: number;
  };
  res.json({ count: row.count });
});

router.patch('/read-all', (req, res) => {
  const user = currentUser(req);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0').run(user.id);
  emitInvalidate(['notifications', 'dashboard'], [user.id]);
  res.json({ ok: true });
});

router.patch('/:id/read', (req, res) => {
  const user = currentUser(req);
  const id = notificationId(req);
  assertOwned(id, user.id);
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, user.id);
  emitInvalidate(['notifications', 'dashboard'], [user.id]);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const user = currentUser(req);
  const id = notificationId(req);
  assertOwned(id, user.id);
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, user.id);
  emitInvalidate(['notifications', 'dashboard'], [user.id]);
  res.json({ ok: true });
});

router.delete('/', (req, res) => {
  const user = currentUser(req);
  const { scope } = parse(z.object({ scope: z.enum(['read', 'all']).optional() }), req.query);
  const info =
    scope === 'all'
      ? db.prepare('DELETE FROM notifications WHERE user_id = ?').run(user.id)
      : db.prepare('DELETE FROM notifications WHERE user_id = ? AND is_read = 1').run(user.id);
  emitInvalidate(['notifications', 'dashboard'], [user.id]);
  res.json({ ok: true, deleted: info.changes });
});

export default router;
