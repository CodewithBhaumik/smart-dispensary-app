import { Router, type Request } from 'express';
import { z } from 'zod';
import { notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import {
  adjustStock,
  adjustStockSchema,
  createMedicine,
  createMedicineSchema,
  getMedicineRow,
  listCategories,
  listMedicines,
  listMovements,
  medicineListQuery,
  recentMovements,
  toMedicine,
  updateMedicine,
  updateMedicineSchema,
} from '../services/medicines';

/** Mounted at the API root: defines /medicines/* and /inventory/*. */
const router = Router();

function medicineId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw notFound('Medicine');
  return id;
}

router.get('/medicines', requireAuth, (req, res) => {
  const user = currentUser(req);
  const query = parse(medicineListQuery, req.query);
  res.json(listMedicines(query, user.role));
});

router.get('/medicines/categories', requireAuth, (req, res) => {
  const user = currentUser(req);
  const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';
  res.json(listCategories(user.role, includeInactive));
});

router.get('/medicines/:id', requireAuth, (req, res) => {
  const user = currentUser(req);
  const row = getMedicineRow(medicineId(req));
  const canManage = user.role === 'staff' || user.role === 'admin';
  if (!row || (!row.is_active && !canManage)) throw notFound('Medicine');
  res.json(toMedicine(row));
});

router.post('/medicines', requireRole('staff', 'admin'), (req, res) => {
  const user = currentUser(req);
  const input = parse(createMedicineSchema, req.body);
  res.status(201).json(createMedicine(input, user.id));
});

router.put('/medicines/:id', requireRole('staff', 'admin'), (req, res) => {
  const user = currentUser(req);
  const id = medicineId(req);
  const input = parse(updateMedicineSchema, req.body);
  const present = new Set(Object.keys((req.body ?? {}) as Record<string, unknown>));
  res.json(updateMedicine(id, input, user.id, present));
});

router.post('/medicines/:id/adjust', requireRole('staff', 'admin'), (req, res) => {
  const user = currentUser(req);
  const id = medicineId(req);
  const input = parse(adjustStockSchema, req.body);
  res.json(adjustStock(id, input, user.id));
});

router.get('/medicines/:id/movements', requireRole('staff', 'admin'), (req, res) => {
  const id = medicineId(req);
  if (!getMedicineRow(id)) throw notFound('Medicine');
  res.json(listMovements(id));
});

router.get('/inventory/movements', requireRole('staff', 'admin'), (req, res) => {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }), req.query);
  res.json(recentMovements(limit ?? 50));
});

export default router;
