import { Router, type Request } from 'express';
import { forbidden, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import {
  cancelMedicineRequest,
  cancelRequestSchema,
  createMedicineRequest,
  createRequestSchema,
  getMedicineRequestRow,
  listMedicineRequests,
  requestListQuery,
  toMedicineRequest,
  updateMedicineRequestStatus,
  updateRequestStatusSchema,
} from '../services/medicine-requests';

const router = Router();

function requestId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Medicine request');
  return id;
}

router.get('/', requireAuth, (req, res) => {
  const user = currentUser(req);
  const query = parse(requestListQuery, req.query);
  if (user.role === 'student') {
    res.json(listMedicineRequests({ ...query, studentId: user.id }));
    return;
  }
  if (user.role === 'staff' || user.role === 'admin') {
    res.json(listMedicineRequests(query));
    return;
  }
  throw forbidden();
});

router.get('/:id', requireAuth, (req, res) => {
  const user = currentUser(req);
  const row = getMedicineRequestRow(requestId(req));
  if (!row) throw notFound('Medicine request');
  if (user.role === 'student') {
    if (row.student_id !== user.id) throw notFound('Medicine request');
  } else if (user.role !== 'staff' && user.role !== 'admin') {
    throw forbidden();
  }
  res.json(toMedicineRequest(row));
});

router.post('/', requireRole('student'), (req, res) => {
  const user = currentUser(req);
  const input = parse(createRequestSchema, req.body);
  res.status(201).json(createMedicineRequest(user.id, input));
});

router.patch('/:id/status', requireRole('staff', 'admin'), (req, res) => {
  const user = currentUser(req);
  const input = parse(updateRequestStatusSchema, req.body);
  res.json(updateMedicineRequestStatus(requestId(req), user.id, input));
});

router.patch('/:id/cancel', requireRole('student'), (req, res) => {
  const user = currentUser(req);
  const { reason } = parse(cancelRequestSchema, req.body ?? {});
  res.json(cancelMedicineRequest(requestId(req), user.id, reason));
});

export default router;
