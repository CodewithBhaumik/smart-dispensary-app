/**
 * Chat & call-log endpoints. Mounted at the API root, so paths are absolute:
 *   GET/POST  /conversations
 *   GET       /conversations/:id
 *   GET/POST  /conversations/:id/messages
 *   PATCH     /conversations/:id/read
 *   GET       /calls
 */
import { Router } from 'express';
import { z } from 'zod';
import { forbidden, notFound } from '../lib/errors';
import { parse, zId } from '../lib/validate';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { emitInvalidate } from '../realtime/io';
import { listCallLogs } from '../services/calls';
import {
  findOrCreateConversation,
  listConversations,
  listMessages,
  markConversationRead,
  requireConversation,
  sendMessage,
  studentDoctorPair,
  toConversation,
} from '../services/chat';
import { getUserRow } from '../services/minis';

const router = Router();
const participants = requireRole('student', 'doctor');

router.get('/conversations', participants, (req, res) => {
  res.json(listConversations(currentUser(req)));
});

router.post('/conversations', participants, (req, res) => {
  const me = currentUser(req);
  const { participantId } = parse(
    z.object({ participantId: zId.refine((v) => v !== me.id, 'You cannot start a conversation with yourself.') }),
    req.body ?? {},
  );
  const other = getUserRow(participantId);
  if (!other) throw notFound('User');
  const pair = studentDoctorPair(me, other);
  if (!pair) throw forbidden('Conversations are available between students and doctors only.');
  if (!other.is_active) throw forbidden('This account is not active.');
  const { row, created } = findOrCreateConversation(pair.studentId, pair.doctorId);
  if (created) emitInvalidate(['conversations'], [pair.studentId, pair.doctorId]);
  res.status(created ? 201 : 200).json(toConversation(row, me.id));
});

router.get('/conversations/:id', participants, (req, res) => {
  const me = currentUser(req);
  const conv = requireConversation(parse(zId, req.params.id), me.id);
  res.json(toConversation(conv, me.id));
});

router.get('/conversations/:id/messages', participants, (req, res) => {
  const me = currentUser(req);
  const conv = requireConversation(parse(zId, req.params.id), me.id);
  const query = parse(
    z.object({
      before: zId.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    req.query,
  );
  res.json(listMessages(conv.id, query));
});

router.post('/conversations/:id/messages', participants, (req, res) => {
  const me = currentUser(req);
  const conv = requireConversation(parse(zId, req.params.id), me.id);
  const { body } = parse(
    z.object({
      body: z
        .string({ error: 'Message cannot be empty.' })
        .trim()
        .min(1, 'Message cannot be empty.')
        .max(2000, 'Messages can be at most 2000 characters.'),
    }),
    req.body ?? {},
  );
  res.status(201).json(sendMessage(conv, me, body));
});

router.patch('/conversations/:id/read', participants, (req, res) => {
  const me = currentUser(req);
  const conv = requireConversation(parse(zId, req.params.id), me.id);
  markConversationRead(conv, me.id);
  res.json({ ok: true });
});

router.get('/calls', requireAuth, (req, res) => {
  const me = currentUser(req);
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }), req.query);
  res.json(listCallLogs(me.id, limit));
});

export default router;
