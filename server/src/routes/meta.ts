import { Router } from 'express';
import { APP_NAME } from '@shared/constants';
import type { AppMeta } from '@shared/types';
import { db, getMeta } from '../db';
import { resetDatabase } from '../db/seed';
import { DEMO_MODE } from '../lib/config';
import { AppError, forbidden } from '../lib/errors';
import { nowIso, todayStr } from '../lib/time';
import { currentUser, requireAuth } from '../middleware/auth';
import { emitInvalidate, emitToAll } from '../realtime/io';
import { logActivity } from '../services/activity';
import { sessionFor } from '../services/auth';
import { getUserRow } from '../services/minis';

/** Every React Query top-level key (BUILD_SPEC §8.4). */
const ALL_KEYS = [
  'me',
  'meta',
  'dashboard',
  'doctors',
  'doctor',
  'slots',
  'availability',
  'schedule',
  'appointments',
  'appointment',
  'prescriptions',
  'prescription',
  'patients',
  'patient',
  'records',
  'medicines',
  'medicine',
  'movements',
  'requests',
  'request',
  'emergencies',
  'emergency',
  'responders',
  'notifications',
  'activity',
  'users',
  'conversations',
  'messages',
  'calls',
];

// Mounted at the API root: use per-route middleware only (no router.use()).
const router = Router();

router.get('/meta', (_req, res) => {
  const meta: AppMeta = {
    appName: APP_NAME,
    demoMode: DEMO_MODE,
    serverTime: nowIso(),
    today: todayStr(),
    seededAt: getMeta('seeded_at'),
  };
  res.json(meta);
});

router.post('/demo/reset', requireAuth, (req, res) => {
  if (!DEMO_MODE) throw forbidden('Demo reset is disabled.');
  const me = currentUser(req);
  const before = getUserRow(me.id);
  resetDatabase();

  type Target = { id: number; name: string; is_active: number };
  let target = before
    ? (db.prepare('SELECT id, name, is_active FROM users WHERE email = ? COLLATE NOCASE').get(before.email) as Target | undefined)
    : undefined;
  if (!target || !target.is_active) {
    target =
      (db.prepare('SELECT id, name, is_active FROM users WHERE is_demo = 1 AND role = ?').get(me.role) as Target | undefined) ??
      (db.prepare('SELECT id, name, is_active FROM users WHERE is_demo = 1 ORDER BY id LIMIT 1').get() as Target | undefined);
  }
  if (!target) throw new AppError(500, 'RESET_FAILED', 'Demo data could not be restored.');

  const response = sessionFor(target.id);
  logActivity({
    actorId: target.id,
    action: 'system.demo_reset',
    category: 'system',
    description: `${target.name} reset the demo data`,
  });
  emitToAll('demo:reset', {});
  emitInvalidate(ALL_KEYS);
  res.json(response);
});

export default router;
