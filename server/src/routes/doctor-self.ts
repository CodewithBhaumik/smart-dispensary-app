import { Router } from 'express';
import { parse } from '../lib/validate';
import { currentUser, requireRole } from '../middleware/auth';
import { idParam } from '../services/core-http';
import {
  acceptingSchema,
  addLeave,
  getScheduleState,
  leaveSchema,
  removeLeave,
  scheduleUpdateSchema,
  setAccepting,
  updateSchedule,
} from '../services/doctor-self';

const router = Router();
router.use(requireRole('doctor'));

router.get('/schedule', (req, res) => {
  res.json(getScheduleState(currentUser(req).id));
});

router.put('/schedule', (req, res) => {
  res.json(updateSchedule(currentUser(req), parse(scheduleUpdateSchema, req.body)));
});

router.patch('/accepting', (req, res) => {
  const { isAccepting } = parse(acceptingSchema, req.body);
  res.json(setAccepting(currentUser(req), isAccepting));
});

router.post('/leaves', (req, res) => {
  res.status(201).json(addLeave(currentUser(req), parse(leaveSchema, req.body)));
});

router.delete('/leaves/:id', (req, res) => {
  removeLeave(currentUser(req), idParam(req, 'id', 'Leave'));
  res.json({ ok: true });
});

export default router;
