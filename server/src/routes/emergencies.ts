import { Router, type Request } from 'express';
import { notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import {
  createEmergency,
  createEmergencySchema,
  emergencyListQuery,
  getEmergencyRow,
  listEmergencies,
  listResponders,
  toEmergency,
  updateEmergencyStatus,
  updateEmergencyStatusSchema,
} from '../services/emergencies';

const router = Router();

function emergencyId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Emergency request');
  return id;
}

router.get('/', requireAuth, (req, res) => {
  const user = currentUser(req);
  const query = parse(emergencyListQuery, req.query);
  res.json(listEmergencies(user.role === 'student' ? { ...query, studentId: user.id } : query));
});

router.get('/responders', requireRole('doctor', 'staff', 'admin'), (_req, res) => {
  res.json(listResponders());
});

router.get('/:id', requireAuth, (req, res) => {
  const user = currentUser(req);
  const row = getEmergencyRow(emergencyId(req));
  if (!row || (user.role === 'student' && row.student_id !== user.id)) throw notFound('Emergency request');
  res.json(toEmergency(row));
});

router.post('/', requireRole('student'), (req, res) => {
  const user = currentUser(req);
  const input = parse(createEmergencySchema, req.body);
  res.status(201).json(createEmergency(user.id, input));
});

router.patch('/:id/status', requireRole('doctor', 'staff', 'admin'), (req, res) => {
  const user = currentUser(req);
  const input = parse(updateEmergencyStatusSchema, req.body);
  res.json(updateEmergencyStatus(emergencyId(req), user.id, input));
});

export default router;
