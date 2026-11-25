import { Router } from 'express';
import { z } from 'zod';
import { parse } from '../lib/validate';
import { currentUser, requireRole } from '../middleware/auth';
import { idParam } from '../services/core-http';
import { getPatientDetail, listPatients } from '../services/patients';

const router = Router();
router.use(requireRole('doctor', 'admin'));

router.get('/', (req, res) => {
  const { search } = parse(z.object({ search: z.string().trim().max(100).optional() }), req.query);
  res.json(listPatients(currentUser(req), search || undefined));
});

router.get('/:id', (req, res) => {
  res.json(getPatientDetail(currentUser(req), idParam(req, 'id', 'Patient')));
});

export default router;
