import { Router } from 'express';
import { z } from 'zod';
import { parse, zId } from '../lib/validate';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { idParam } from '../services/core-http';
import {
  createPrescriptionForAppointment,
  createPrescriptionSchema,
  getPrescriptionForUser,
  listPrescriptions,
} from '../services/prescriptions';

const router = Router();
router.use(requireAuth);

const listSchema = z.object({
  search: z.string().trim().max(100).optional(),
  studentId: zId.optional(),
});

router.get('/', (req, res) => {
  const q = parse(listSchema, req.query);
  res.json(listPrescriptions(currentUser(req), { search: q.search || undefined, studentId: q.studentId }));
});

router.get('/:id', (req, res) => {
  res.json(getPrescriptionForUser(currentUser(req), idParam(req, 'id', 'Prescription')));
});

router.post('/', requireRole('doctor'), (req, res) => {
  res.status(201).json(createPrescriptionForAppointment(currentUser(req), parse(createPrescriptionSchema, req.body)));
});

export default router;
