import { Router } from 'express';
import { z } from 'zod';
import { DEMO_MODE } from '../lib/config';
import { notFound } from '../lib/errors';
import { parse, zId } from '../lib/validate';
import { currentUser, destroySession, extractToken, requireAuth } from '../middleware/auth';
import { demoLogin, listDemoAccounts, login } from '../services/auth';
import { getAuthUser } from '../services/minis';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').max(120),
  password: z.string().min(1, 'Enter your password.').max(200),
});

router.post('/login', (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  res.json(login(email, password));
});

router.post('/logout', (req, res) => {
  const token = extractToken(req);
  if (token) destroySession(token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = getAuthUser(currentUser(req).id);
  if (!user) throw notFound('User');
  res.json(user);
});

router.get('/demo-accounts', (_req, res) => {
  if (!DEMO_MODE) throw notFound('Endpoint');
  res.json(listDemoAccounts());
});

router.post('/demo-login', (req, res) => {
  if (!DEMO_MODE) throw notFound('Endpoint');
  const { userId } = parse(z.object({ userId: zId }), req.body);
  res.json(demoLogin(userId));
});

export default router;
