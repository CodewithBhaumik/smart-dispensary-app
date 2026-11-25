import { Router } from 'express';
import { z } from 'zod';
import { parse, zDate } from '../lib/validate';
import { currentUser, requireAuth } from '../middleware/auth';
import { idParam } from '../services/core-http';
import { getAvailability, getDoctorDetail, getSlots, listDoctors, listSpecialties, requireDoctor } from '../services/doctors';

const router = Router();
router.use(requireAuth);

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  specialty: z.string().trim().max(80).optional(),
  availableToday: z
    .enum(['1', 'true', '0', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

router.get('/', (req, res) => {
  const q = parse(listSchema, req.query);
  res.json(listDoctors({ search: q.search || undefined, specialty: q.specialty || undefined, availableToday: q.availableToday }));
});

router.get('/specialties', (_req, res) => {
  res.json(listSpecialties());
});

router.get('/:id', (req, res) => {
  res.json(getDoctorDetail(idParam(req, 'id', 'Doctor')));
});

router.get('/:id/availability', (req, res) => {
  const id = idParam(req, 'id', 'Doctor');
  requireDoctor(id);
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(31).optional().default(14) }), req.query);
  const user = currentUser(req);
  res.json(getAvailability(id, days, user.role === 'student' ? user.id : undefined));
});

router.get('/:id/slots', (req, res) => {
  const id = idParam(req, 'id', 'Doctor');
  requireDoctor(id);
  const { date } = parse(z.object({ date: zDate }), req.query);
  const user = currentUser(req);
  res.json(getSlots(id, date, { studentId: user.role === 'student' ? user.id : undefined }));
});

export default router;
