/**
 * Medicine catalogue & inventory: computed stock/expiry status, filtering,
 * create/update, stock adjustments with an audit trail (stock_movements) and
 * low-stock alerts.
 */
import { z } from 'zod';
import {
  EXPIRY_WARNING_DAYS,
  STOCK_MOVEMENT_LABELS,
  type ExpiryStatus,
  type Role,
  type StockMovementType,
  type StockStatus,
} from '@shared/constants';
import type { Medicine, StockMovement } from '@shared/types';
import { db, tx } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';
import { bool } from '../lib/json';
import { addDaysStr, daysBetween, isValidDateStr, nowIso, todayStr } from '../lib/time';
import { zDate, zOptionalText } from '../lib/validate';
import { emitInvalidate } from '../realtime/io';
import { logActivity } from './activity';
import { activeUserIds, getUserRow, userMiniFromRow } from './minis';
import { notify } from './notify';

// ---------------------------------------------------------------------------
// Rows & mappers
// ---------------------------------------------------------------------------
export interface MedicineRow {
  id: number;
  name: string;
  generic_name: string | null;
  category: string;
  form: string;
  strength: string | null;
  unit: string;
  description: string | null;
  usage_instructions: string | null;
  requires_prescription: number;
  stock_quantity: number;
  min_stock: number;
  batch_no: string | null;
  expiry_date: string | null;
  manufacturer: string | null;
  unit_price: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export function stockStatusOf(quantity: number, minStock: number): StockStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= minStock) return 'low_stock';
  return 'in_stock';
}

export function expiryInfo(expiryDate: string | null): { expiryStatus: ExpiryStatus; daysToExpiry: number | null } {
  if (!expiryDate) return { expiryStatus: 'ok', daysToExpiry: null };
  const days = daysBetween(todayStr(), expiryDate);
  if (days < 0) return { expiryStatus: 'expired', daysToExpiry: days };
  if (days <= EXPIRY_WARNING_DAYS) return { expiryStatus: 'expiring', daysToExpiry: days };
  return { expiryStatus: 'ok', daysToExpiry: days };
}

export function toMedicine(row: MedicineRow): Medicine {
  const { expiryStatus, daysToExpiry } = expiryInfo(row.expiry_date);
  return {
    id: row.id,
    name: row.name,
    genericName: row.generic_name,
    category: row.category,
    form: row.form,
    strength: row.strength,
    unit: row.unit,
    description: row.description,
    usageInstructions: row.usage_instructions,
    requiresPrescription: bool(row.requires_prescription),
    stockQuantity: row.stock_quantity,
    minStock: row.min_stock,
    batchNo: row.batch_no,
    expiryDate: row.expiry_date,
    manufacturer: row.manufacturer,
    unitPrice: row.unit_price,
    isActive: bool(row.is_active),
    stockStatus: stockStatusOf(row.stock_quantity, row.min_stock),
    expiryStatus,
    daysToExpiry,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getMedicineRow(id: number): MedicineRow | null {
  return (db.prepare('SELECT * FROM medicines WHERE id = ?').get(id) as MedicineRow | undefined) ?? null;
}

export function getMedicine(id: number): Medicine | null {
  const row = getMedicineRow(id);
  return row ? toMedicine(row) : null;
}

const MOVEMENT_SELECT = `
  SELECT sm.*, m.name AS medicine_name,
         u.name AS performer_name, u.role AS performer_role, u.avatar_color AS performer_avatar_color, u.title AS performer_title
    FROM stock_movements sm
    JOIN medicines m ON m.id = sm.medicine_id
    LEFT JOIN users u ON u.id = sm.performed_by`;

interface MovementRow {
  id: number;
  medicine_id: number;
  type: StockMovementType;
  quantity_change: number;
  balance_after: number;
  reason: string | null;
  reference: string | null;
  request_id: number | null;
  performed_by: number | null;
  created_at: string;
  medicine_name: string;
  performer_name: string | null;
  performer_role: Role | null;
  performer_avatar_color: string | null;
  performer_title: string | null;
}

export function toStockMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    medicineId: row.medicine_id,
    medicineName: row.medicine_name,
    type: row.type,
    quantityChange: row.quantity_change,
    balanceAfter: row.balance_after,
    reason: row.reason,
    reference: row.reference,
    requestId: row.request_id,
    performedBy:
      row.performed_by && row.performer_name
        ? userMiniFromRow({
            id: row.performed_by,
            name: row.performer_name,
            role: row.performer_role ?? 'staff',
            avatar_color: row.performer_avatar_color ?? '#0d9488',
            title: row.performer_title,
          })
        : null,
    createdAt: row.created_at,
  };
}

export function getStockMovement(id: number): StockMovement | null {
  const row = db.prepare(`${MOVEMENT_SELECT} WHERE sm.id = ?`).get(id) as MovementRow | undefined;
  return row ? toStockMovement(row) : null;
}

/** Movements of one medicine, newest first. */
export function listMovements(medicineId: number, limit = 200): StockMovement[] {
  const rows = db
    .prepare(`${MOVEMENT_SELECT} WHERE sm.medicine_id = ? ORDER BY sm.created_at DESC, sm.id DESC LIMIT ?`)
    .all(medicineId, limit) as MovementRow[];
  return rows.map(toStockMovement);
}

/** Recent movements across the whole inventory, newest first. */
export function recentMovements(limit = 50): StockMovement[] {
  const rows = db
    .prepare(`${MOVEMENT_SELECT} ORDER BY sm.created_at DESC, sm.id DESC LIMIT ?`)
    .all(limit) as MovementRow[];
  return rows.map(toStockMovement);
}

/** Inserts a stock_movements row (caller must already have updated medicines.stock_quantity). */
export function insertMovement(input: {
  medicineId: number;
  type: StockMovementType;
  quantityChange: number;
  balanceAfter: number;
  reason?: string | null;
  reference?: string | null;
  requestId?: number | null;
  performedBy?: number | null;
  createdAt?: string;
}): number {
  const info = db
    .prepare(
      `INSERT INTO stock_movements
         (medicine_id, type, quantity_change, balance_after, reason, reference, request_id, performed_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.medicineId,
      input.type,
      input.quantityChange,
      input.balanceAfter,
      input.reason ?? null,
      input.reference ?? null,
      input.requestId ?? null,
      input.performedBy ?? null,
      input.createdAt ?? nowIso(),
    );
  return Number(info.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Low-stock alerts
// ---------------------------------------------------------------------------
/**
 * Notifies staff + admins when a medicine crosses into low stock
 * (was above its minimum, now at/below). Avoids repeated alerts while already low.
 */
export function notifyLowStockIfCrossed(before: { quantity: number; minStock: number }, after: MedicineRow): void {
  const wasLow = before.quantity <= before.minStock;
  const isLow = after.stock_quantity <= after.min_stock;
  if (wasLow || !isLow || !after.is_active) return;
  const title = after.stock_quantity === 0 ? `Out of stock: ${after.name}` : `Low stock: ${after.name}`;
  const body =
    after.stock_quantity === 0
      ? `${after.name} is now out of stock. Restock it to keep requests moving.`
      : `Only ${after.stock_quantity} × ${after.unit} left (minimum level ${after.min_stock}). Consider restocking soon.`;
  notify(activeUserIds('staff'), { type: 'inventory', title, body, link: `/staff/inventory?open=${after.id}` });
  notify(activeUserIds('admin'), { type: 'inventory', title, body, link: `/admin/inventory?open=${after.id}` });
}

const INVENTORY_KEYS = ['medicines', 'medicine', 'movements', 'dashboard', 'activity'];

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
export const medicineListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(80).optional(),
  stock: z.enum(['in_stock', 'low_stock', 'out_of_stock']).optional(),
  expiry: z.enum(['expiring', 'expired']).optional(),
  rx: z.enum(['otc', 'rx']).optional(),
  includeInactive: z.enum(['1', '0', 'true', 'false']).optional(),
  sort: z.enum(['name', 'stock', 'expiry']).optional(),
});
export type MedicineListQuery = z.output<typeof medicineListQuery>;

const canManage = (role: Role) => role === 'staff' || role === 'admin';

export function listMedicines(query: MedicineListQuery, role: Role): Medicine[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const includeInactive = canManage(role) && (query.includeInactive === '1' || query.includeInactive === 'true');
  if (!includeInactive) where.push('is_active = 1');
  if (query.search) {
    const like = `%${query.search}%`;
    where.push('(name LIKE ? OR generic_name LIKE ? OR category LIKE ? OR manufacturer LIKE ?)');
    params.push(like, like, like, like);
  }
  if (query.category) {
    where.push('category = ?');
    params.push(query.category);
  }
  if (query.stock === 'out_of_stock') where.push('stock_quantity = 0');
  if (query.stock === 'low_stock') where.push('stock_quantity > 0 AND stock_quantity <= min_stock');
  if (query.stock === 'in_stock') where.push('stock_quantity > min_stock');
  const today = todayStr();
  if (query.expiry === 'expired') {
    where.push('expiry_date IS NOT NULL AND expiry_date < ?');
    params.push(today);
  }
  if (query.expiry === 'expiring') {
    where.push('expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ?');
    params.push(today, addDaysStr(today, EXPIRY_WARNING_DAYS));
  }
  if (query.rx === 'otc') where.push('requires_prescription = 0');
  if (query.rx === 'rx') where.push('requires_prescription = 1');

  const order =
    query.sort === 'stock'
      ? 'stock_quantity ASC, name COLLATE NOCASE ASC'
      : query.sort === 'expiry'
        ? 'expiry_date IS NULL, expiry_date ASC, name COLLATE NOCASE ASC'
        : 'name COLLATE NOCASE ASC';
  const sql = `SELECT * FROM medicines ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${order}`;
  return (db.prepare(sql).all(...params) as MedicineRow[]).map(toMedicine);
}

export function listCategories(role: Role, includeInactive = false): { category: string; count: number }[] {
  const all = canManage(role) && includeInactive;
  return db
    .prepare(
      `SELECT category, COUNT(*) AS count FROM medicines ${all ? '' : 'WHERE is_active = 1'}
        GROUP BY category ORDER BY category COLLATE NOCASE`,
    )
    .all() as { category: string; count: number }[];
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------
const zOptionalDate = z
  .union([zDate, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidDateStr(v), 'Enter a valid date.');

const medicineFields = {
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(120),
  genericName: zOptionalText(120),
  category: z.string().trim().min(1, 'Choose a category.').max(80),
  form: z.string().trim().min(1, 'Choose a form.').max(40),
  strength: zOptionalText(60),
  unit: z.string().trim().min(1, 'Enter the dispensing unit (e.g. strip of 10).').max(60),
  description: zOptionalText(1000),
  usageInstructions: zOptionalText(1000),
  requiresPrescription: z.boolean().optional(),
  minStock: z.coerce.number().int('Minimum stock must be a whole number.').min(0).max(100000).optional(),
  batchNo: zOptionalText(60),
  expiryDate: zOptionalDate,
  manufacturer: zOptionalText(120),
  unitPrice: z.coerce.number().min(0, 'Price cannot be negative.').max(1_000_000).optional(),
  isActive: z.boolean().optional(),
};

export const createMedicineSchema = z.object({
  ...medicineFields,
  stockQuantity: z.coerce.number().int('Stock must be a whole number.').min(0, 'Stock cannot be negative.').max(1_000_000).optional(),
});
export type CreateMedicineInput = z.output<typeof createMedicineSchema>;

export const updateMedicineSchema = z.object({
  name: medicineFields.name.optional(),
  genericName: medicineFields.genericName,
  category: medicineFields.category.optional(),
  form: medicineFields.form.optional(),
  strength: medicineFields.strength,
  unit: medicineFields.unit.optional(),
  description: medicineFields.description,
  usageInstructions: medicineFields.usageInstructions,
  requiresPrescription: medicineFields.requiresPrescription,
  minStock: medicineFields.minStock,
  batchNo: medicineFields.batchNo,
  expiryDate: medicineFields.expiryDate,
  manufacturer: medicineFields.manufacturer,
  unitPrice: medicineFields.unitPrice,
  isActive: medicineFields.isActive,
});
export type UpdateMedicineInput = z.output<typeof updateMedicineSchema>;

function assertNameAvailable(name: string, exceptId?: number) {
  const existing = db.prepare('SELECT id FROM medicines WHERE name = ? COLLATE NOCASE').get(name) as
    | { id: number }
    | undefined;
  if (existing && existing.id !== exceptId) {
    throw conflict('NAME_TAKEN', `A medicine named "${name}" already exists in the inventory.`);
  }
}

const actorName = (actorId: number) => getUserRow(actorId)?.name ?? 'A staff member';

export function createMedicine(input: CreateMedicineInput, actorId: number): Medicine {
  assertNameAvailable(input.name);
  const now = nowIso();
  const stock = input.stockQuantity ?? 0;
  const id = tx(() => {
    const info = db
      .prepare(
        `INSERT INTO medicines
           (name, generic_name, category, form, strength, unit, description, usage_instructions,
            requires_prescription, stock_quantity, min_stock, batch_no, expiry_date, manufacturer,
            unit_price, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name,
        input.genericName,
        input.category,
        input.form,
        input.strength,
        input.unit,
        input.description,
        input.usageInstructions,
        input.requiresPrescription ? 1 : 0,
        stock,
        input.minStock ?? 10,
        input.batchNo,
        input.expiryDate,
        input.manufacturer,
        input.unitPrice ?? 0,
        input.isActive === false ? 0 : 1,
        now,
        now,
      );
    const newId = Number(info.lastInsertRowid);
    if (stock > 0) {
      insertMovement({
        medicineId: newId,
        type: 'initial',
        quantityChange: stock,
        balanceAfter: stock,
        reason: 'Opening stock',
        performedBy: actorId,
        createdAt: now,
      });
    }
    logActivity({
      actorId,
      action: 'inventory.medicine_added',
      category: 'inventory',
      description: `${actorName(actorId)} added ${input.name} to the inventory with ${stock} × ${input.unit} in stock`,
      entityType: 'medicine',
      entityId: newId,
      createdAt: now,
    });
    return newId;
  });
  emitInvalidate(INVENTORY_KEYS);
  return getMedicine(id)!;
}

/**
 * Updates catalogue fields (never stock — use adjustStock). `presentKeys` = keys present in the
 * raw request body, so optional fields that were not sent are left untouched.
 */
export function updateMedicine(
  id: number,
  input: UpdateMedicineInput,
  actorId: number,
  presentKeys?: Set<string>,
): Medicine {
  const before = getMedicineRow(id);
  if (!before) throw notFound('Medicine');
  if (input.name !== undefined) assertNameAvailable(input.name, id);

  const columns: Record<string, unknown> = {
    name: input.name,
    generic_name: input.genericName,
    category: input.category,
    form: input.form,
    strength: input.strength,
    unit: input.unit,
    description: input.description,
    usage_instructions: input.usageInstructions,
    requires_prescription: input.requiresPrescription === undefined ? undefined : input.requiresPrescription ? 1 : 0,
    min_stock: input.minStock,
    batch_no: input.batchNo,
    expiry_date: input.expiryDate,
    manufacturer: input.manufacturer,
    unit_price: input.unitPrice,
    is_active: input.isActive === undefined ? undefined : input.isActive ? 1 : 0,
  };
  // Optional-text transforms turn "absent" into null, so rely on the raw body's keys.
  const sent = input as Record<string, unknown>;
  const present = presentKeys ?? new Set(Object.keys(sent).filter((k) => sent[k] !== undefined));
  const keyMap: Record<string, string> = {
    name: 'name',
    generic_name: 'genericName',
    category: 'category',
    form: 'form',
    strength: 'strength',
    unit: 'unit',
    description: 'description',
    usage_instructions: 'usageInstructions',
    requires_prescription: 'requiresPrescription',
    min_stock: 'minStock',
    batch_no: 'batchNo',
    expiry_date: 'expiryDate',
    manufacturer: 'manufacturer',
    unit_price: 'unitPrice',
    is_active: 'isActive',
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [column, value] of Object.entries(columns)) {
    if (value === undefined) continue;
    if (!present.has(keyMap[column])) continue;
    sets.push(`${column} = ?`);
    params.push(value);
  }
  const now = nowIso();
  tx(() => {
    if (sets.length) {
      db.prepare(`UPDATE medicines SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`).run(...params, now, id);
    }
    const after = getMedicineRow(id)!;
    logActivity({
      actorId,
      action: 'inventory.medicine_updated',
      category: 'inventory',
      description: `${actorName(actorId)} updated the details of ${after.name}`,
      entityType: 'medicine',
      entityId: id,
      createdAt: now,
    });
  });
  const after = getMedicineRow(id)!;
  notifyLowStockIfCrossed({ quantity: before.stock_quantity, minStock: before.min_stock }, after);
  emitInvalidate(INVENTORY_KEYS);
  return toMedicine(after);
}

// ---------------------------------------------------------------------------
// Stock adjustments
// ---------------------------------------------------------------------------
export const adjustStockSchema = z.object({
  type: z.enum(['restock', 'adjustment', 'expired_removal'], { message: 'Choose an adjustment type.' }),
  quantity: z.coerce.number().int('Quantity must be a whole number.'),
  reason: zOptionalText(300),
  batchNo: zOptionalText(60),
  expiryDate: zOptionalDate,
});
export type AdjustStockInput = z.output<typeof adjustStockSchema>;

export function adjustStock(
  id: number,
  input: AdjustStockInput,
  actorId: number,
): { medicine: Medicine; movement: StockMovement } {
  const before = getMedicineRow(id);
  if (!before) throw notFound('Medicine');

  let change: number;
  if (input.type === 'adjustment') {
    if (input.quantity === 0) throw badRequest('Adjustment cannot be zero.', { quantity: 'Enter a non-zero amount.' });
    change = input.quantity;
  } else {
    if (input.quantity <= 0) {
      throw badRequest('Quantity must be greater than zero.', { quantity: 'Enter a positive quantity.' });
    }
    change = input.type === 'restock' ? input.quantity : -input.quantity;
  }

  const now = nowIso();
  const movementId = tx(() => {
    const current = getMedicineRow(id)!;
    const balance = current.stock_quantity + change;
    if (balance < 0) {
      throw conflict(
        'INSUFFICIENT_STOCK',
        `Only ${current.stock_quantity} × ${current.unit} of ${current.name} in stock — cannot remove ${Math.abs(change)}.`,
      );
    }
    const extraSets: string[] = [];
    const extraParams: unknown[] = [];
    if (input.type === 'restock') {
      if (input.batchNo) {
        extraSets.push('batch_no = ?');
        extraParams.push(input.batchNo);
      }
      if (input.expiryDate) {
        extraSets.push('expiry_date = ?');
        extraParams.push(input.expiryDate);
      }
    }
    const result = db
      .prepare(
        `UPDATE medicines SET stock_quantity = stock_quantity + ?, ${extraSets.map((s) => `${s}, `).join('')}updated_at = ?
          WHERE id = ? AND stock_quantity + ? >= 0`,
      )
      .run(change, ...extraParams, now, id, change);
    if (result.changes === 0) {
      throw conflict('INSUFFICIENT_STOCK', `Not enough ${current.name} in stock for this change.`);
    }
    const reason =
      input.reason ??
      (input.type === 'restock'
        ? `Restocked${input.batchNo ? ` (batch ${input.batchNo})` : ''}`
        : STOCK_MOVEMENT_LABELS[input.type]);
    const mid = insertMovement({
      medicineId: id,
      type: input.type,
      quantityChange: change,
      balanceAfter: balance,
      reason,
      performedBy: actorId,
      createdAt: now,
    });
    const who = actorName(actorId);
    const description =
      input.type === 'restock'
        ? `${who} restocked ${current.name} with ${change} × ${current.unit} (new balance ${balance})`
        : input.type === 'expired_removal'
          ? `${who} removed ${-change} × ${current.unit} of expired ${current.name} (new balance ${balance})`
          : `${who} adjusted ${current.name} stock by ${change > 0 ? '+' : ''}${change} (new balance ${balance})${input.reason ? ` — ${input.reason}` : ''}`;
    logActivity({
      actorId,
      action:
        input.type === 'restock'
          ? 'inventory.restocked'
          : input.type === 'expired_removal'
            ? 'inventory.expired_removed'
            : 'inventory.adjusted',
      category: 'inventory',
      description,
      entityType: 'medicine',
      entityId: id,
      createdAt: now,
    });
    return mid;
  });

  const after = getMedicineRow(id)!;
  notifyLowStockIfCrossed({ quantity: before.stock_quantity, minStock: before.min_stock }, after);
  emitInvalidate(INVENTORY_KEYS);
  return { medicine: toMedicine(after), movement: getStockMovement(movementId)! };
}
