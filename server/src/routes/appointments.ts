import { Router } from 'express';
import { parse } from '../lib/validate';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import {
  bookSchema,
  cancelAppointment,
  cancelSchema,
  checkIn,
  checkInByCode,
  checkInByCodeSchema,
  completeConsultation,
  completeSchema,
  createAppointment,
  getAppointmentDetailForUser,
  listAppointments,
  listQuerySchema,
  rescheduleAppointment,
  rescheduleSchema,
  saveConsultationDraft,
  startConsultation,
} from '../services/appointments';
import { consultationInputSchema } from '../services/consultations';
import { idParam } from '../services/core-http';

const router = Router();
router.use(requireAuth);

const apptId = (req: Parameters<typeof idParam>[0]) => idParam(req, 'id', 'Appointment');

router.get('/', (req, res) => {
  res.json(listAppointments(currentUser(req), parse(listQuerySchema, req.query)));
});

router.post('/', requireRole('student'), (req, res) => {
  res.status(201).json(createAppointment(currentUser(req), parse(bookSchema, req.body)));
});

router.post('/check-in-by-code', requireRole('doctor', 'staff', 'admin'), (req, res) => {
  const { code } = parse(checkInByCodeSchema, req.body);
  res.json(checkInByCode(currentUser(req), code));
});

router.get('/:id', (req, res) => {
  res.json(getAppointmentDetailForUser(currentUser(req), apptId(req)));
});

router.patch('/:id/reschedule', (req, res) => {
  res.json(rescheduleAppointment(currentUser(req), apptId(req), parse(rescheduleSchema, req.body)));
});

router.patch('/:id/cancel', (req, res) => {
  const { reason } = parse(cancelSchema, req.body ?? {});
  res.json(cancelAppointment(currentUser(req), apptId(req), reason));
});

router.patch('/:id/check-in', requireRole('doctor', 'staff', 'admin'), (req, res) => {
  res.json(checkIn(currentUser(req), apptId(req)));
});

router.patch('/:id/start', requireRole('doctor'), (req, res) => {
  res.json(startConsultation(currentUser(req), apptId(req)));
});

router.put('/:id/consultation', requireRole('doctor'), (req, res) => {
  res.json(saveConsultationDraft(currentUser(req), apptId(req), parse(consultationInputSchema, req.body)));
});

router.post('/:id/complete', requireRole('doctor'), (req, res) => {
  res.json(completeConsultation(currentUser(req), apptId(req), parse(completeSchema, req.body)));
});

export default router;
