/**
 * Medicine request workflow:
 * submitted → approved → preparing → ready_for_pickup | out_for_delivery → fulfilled
 * (rejected / cancelled branches). Stock is deducted exactly once, at fulfilment.
 */
import { z } from 'zod';
import {
  FULFILMENT_METHODS,
  MAX_OTC_QUANTITY,
  OPEN_REQUEST_STATUSES,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  STUDENT_CANCELLABLE_REQUEST_STATUSES,
  allowedRequestTransitions,
  type FulfilmentMethod,
  type RequestStatus,
} from '@shared/constants';
import type { MedicineRequest, MedicineRequestItem } from '@shared/types';
import { db, tx } from '../db';
import { generateCode } from '../lib/codes';
import { badRequest, conflict, notFound } from '../lib/errors';
import { bool } from '../lib/json';
import { formatDisplayDate } from './ops-format';
import { nowIso, todayStr } from '../lib/time';
import { zId, zOptionalText } from '../lib/validate';
import { emitInvalidate } from '../realtime/io';
import { logActivity } from './activity';
import { getMedicineRow, insertMovement, notifyLowStockIfCrossed } from './medicines';
import { activeUserIds, getStudentMini, getUserMini, getUserRow } from './minis';
import { notify } from './notify';
import { addStatusEvent, getTimeline } from './status-events';

// ---------------------------------------------------------------------------
// Rows & mappers
// ---------------------------------------------------------------------------
export interface MedicineRequestRow {
  id: number;
  code: string;
  student_id: number;
  prescription_id: number | null;
  fulfilment: FulfilmentMethod;
  delivery_location: string | null;
  notes: string | null;
  status: RequestStatus;
  rejection_reason: string | null;
  staff_notes: string | null;
  handled_by: number | null;
  approved_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  fulfilled_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface RequestItemRow {
  id: number;
  request_id: number;
  medicine_id: number;
  medicine_name: string;
  quantity: number;
  form: string | null;
  strength: string | null;
  unit: string | null;
  stock_quantity: number | null;
  requires_prescription: number | null;
}

function getRequestItems(requestId: number): MedicineRequestItem[] {
  const rows = db
    .prepare(
      `SELECT i.*, m.form, m.strength, m.unit, m.stock_quantity, m.requires_prescription
         FROM medicine_request_items i LEFT JOIN medicines m ON m.id = i.medicine_id
        WHERE i.request_id = ? ORDER BY i.id`,
    )
    .all(requestId) as RequestItemRow[];
  return rows.map((r) => ({
    id: r.id,
    medicineId: r.medicine_id,
    medicineName: r.medicine_name,
    form: r.form ?? '',
    strength: r.strength,
    unit: r.unit ?? 'unit',
    quantity: r.quantity,
    stockAvailable: r.stock_quantity ?? 0,
    requiresPrescription: bool(r.requires_prescription),
  }));
}

function getPrescriptionRef(prescriptionId: number | null): MedicineRequest['prescription'] {
  if (!prescriptionId) return null;
  const row = db
    .prepare(
      `SELECT p.id, p.code, u.name AS doctor_name
         FROM prescriptions p JOIN users u ON u.id = p.doctor_id WHERE p.id = ?`,
    )
    .get(prescriptionId) as { id: number; code: string; doctor_name: string } | undefined;
  return row ? { id: row.id, code: row.code, doctorName: row.doctor_name } : null;
}

export function toMedicineRequest(row: MedicineRequestRow): MedicineRequest {
  const items = getRequestItems(row.id);
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    fulfilment: row.fulfilment,
    deliveryLocation: row.delivery_location,
    notes: row.notes,
    rejectionReason: row.rejection_reason,
    staffNotes: row.staff_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at,
    preparingAt: row.preparing_at,
    readyAt: row.ready_at,
    dispatchedAt: row.dispatched_at,
    fulfilledAt: row.fulfilled_at,
    rejectedAt: row.rejected_at,
    cancelledAt: row.cancelled_at,
    student: getStudentMini(row.student_id),
    prescription: getPrescriptionRef(row.prescription_id),
    handledBy: getUserMini(row.handled_by),
    items,
    totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
    timeline: getTimeline('medicine_request', row.id),
  };
}

export function getMedicineRequestRow(id: number): MedicineRequestRow | null {
  return (
    (db.prepare('SELECT * FROM medicine_requests WHERE id = ?').get(id) as MedicineRequestRow | undefined) ?? null
  );
}

export function getMedicineRequest(id: number): MedicineRequest | null {
  const row = getMedicineRequestRow(id);
  return row ? toMedicineRequest(row) : null;
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
export const requestListQuery = z.object({
  status: z.string().trim().max(200).optional(),
  search: z.string().trim().max(100).optional(),
  scope: z.enum(['open', 'closed', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type RequestListQuery = z.output<typeof requestListQuery>;

export const CLOSED_REQUEST_STATUSES: RequestStatus[] = ['fulfilled', 'rejected', 'cancelled'];

/** Lists requests newest first. Pass `studentId` to restrict to one student. */
export function listMedicineRequests(query: RequestListQuery & { studentId?: number }): MedicineRequest[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.studentId) {
    where.push('r.student_id = ?');
    params.push(query.studentId);
  }
  if (query.status) {
    const statuses = query.status
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is RequestStatus => (REQUEST_STATUSES as readonly string[]).includes(s));
    if (statuses.length === 0) return [];
    where.push(`r.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (query.scope === 'open') {
    where.push(`r.status IN (${OPEN_REQUEST_STATUSES.map(() => '?').join(',')})`);
    params.push(...OPEN_REQUEST_STATUSES);
  } else if (query.scope === 'closed') {
    where.push(`r.status IN (${CLOSED_REQUEST_STATUSES.map(() => '?').join(',')})`);
    params.push(...CLOSED_REQUEST_STATUSES);
  }
  if (query.search) {
    const like = `%${query.search}%`;
    where.push(`(r.code LIKE ? OR u.name LIKE ? OR sp.roll_no LIKE ?
      OR EXISTS (SELECT 1 FROM medicine_request_items i WHERE i.request_id = r.id AND i.medicine_name LIKE ?))`);
    params.push(like, like, like, like);
  }
  const sql = `
    SELECT r.* FROM medicine_requests r
      JOIN users u ON u.id = r.student_id
      LEFT JOIN student_profiles sp ON sp.user_id = r.student_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.created_at DESC, r.id DESC
     ${query.limit ? 'LIMIT ?' : ''}`;
  if (query.limit) params.push(query.limit);
  return (db.prepare(sql).all(...params) as MedicineRequestRow[]).map(toMedicineRequest);
}

/** Open requests oldest first (staff action queue). */
export function listOpenRequestsOldestFirst(limit = 50): MedicineRequest[] {
  const rows = db
    .prepare(
      `SELECT * FROM medicine_requests WHERE status IN (${OPEN_REQUEST_STATUSES.map(() => '?').join(',')})
        ORDER BY created_at ASC, id ASC LIMIT ?`,
    )
    .all(...OPEN_REQUEST_STATUSES, limit) as MedicineRequestRow[];
  return rows.map(toMedicineRequest);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export const createRequestSchema = z.object({
  items: z
    .array(
      z.object({
        medicineId: zId,
        quantity: z.coerce
          .number()
          .int('Quantity must be a whole number.')
          .min(1, 'Quantity must be at least 1.')
          .max(100, 'Quantity is too large.'),
      }),
      { message: 'Add at least one medicine.' },
    )
    .min(1, 'Add at least one medicine.')
    .max(10, 'A request can contain at most 10 medicines.'),
  prescriptionId: zId.optional().nullable(),
  fulfilment: z.enum(FULFILMENT_METHODS, { message: 'Choose pickup or campus delivery.' }),
  deliveryLocation: zOptionalText(200),
  notes: zOptionalText(500),
});
export type CreateRequestInput = z.output<typeof createRequestSchema>;

interface PrescriptionRow {
  id: number;
  code: string;
  student_id: number;
  valid_until: string;
}

const REQUEST_KEYS = [
  'requests',
  'request',
  'medicines',
  'medicine',
  'movements',
  'dashboard',
  'notifications',
  'activity',
  'prescriptions',
  'prescription',
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function createMedicineRequest(studentId: number, input: CreateRequestInput): MedicineRequest {
  const ids = input.items.map((i) => i.medicineId);
  if (new Set(ids).size !== ids.length) {
    throw badRequest('Each medicine can be added only once per request.', { items: 'Remove duplicate medicines.' });
  }
  const fulfilment = input.fulfilment;
  const deliveryLocation = fulfilment === 'delivery' ? input.deliveryLocation : null;
  if (fulfilment === 'delivery' && !deliveryLocation) {
    throw badRequest('Enter a delivery location (hostel, block and room).', {
      deliveryLocation: 'Enter a delivery location (hostel, block and room).',
    });
  }

  // Prescription checks -------------------------------------------------------
  let prescription: PrescriptionRow | null = null;
  const prescribed = new Map<number, number>(); // medicineId → prescribed quantity
  if (input.prescriptionId) {
    prescription =
      (db
        .prepare('SELECT id, code, student_id, valid_until FROM prescriptions WHERE id = ?')
        .get(input.prescriptionId) as PrescriptionRow | undefined) ?? null;
    if (!prescription || prescription.student_id !== studentId) throw notFound('Prescription');
    if (prescription.valid_until < todayStr()) {
      throw conflict(
        'PRESCRIPTION_EXPIRED',
        `Prescription ${prescription.code} expired on ${formatDisplayDate(prescription.valid_until)}. Please consult a doctor for a new one.`,
      );
    }
    const open = db
      .prepare(
        `SELECT code FROM medicine_requests WHERE prescription_id = ?
            AND status IN (${OPEN_REQUEST_STATUSES.map(() => '?').join(',')}) LIMIT 1`,
      )
      .get(prescription.id, ...OPEN_REQUEST_STATUSES) as { code: string } | undefined;
    if (open) {
      throw conflict(
        'DUPLICATE_REQUEST',
        `You already have an open request (${open.code}) for prescription ${prescription.code}.`,
      );
    }
    const rows = db
      .prepare('SELECT medicine_id, SUM(quantity) AS qty FROM prescription_items WHERE prescription_id = ? GROUP BY medicine_id')
      .all(prescription.id) as { medicine_id: number; qty: number }[];
    for (const r of rows) prescribed.set(r.medicine_id, r.qty);
  }

  // Item checks ----------------------------------------------------------------
  const resolved = input.items.map((item, index) => {
    const med = getMedicineRow(item.medicineId);
    if (!med || !med.is_active) {
      throw badRequest('One of the selected medicines is not available.', {
        [`items.${index}.medicineId`]: 'This medicine is not available.',
      });
    }
    const inPrescription = prescribed.has(med.id);
    if (bool(med.requires_prescription) && !inPrescription) {
      throw conflict(
        'PRESCRIPTION_REQUIRED',
        `${med.name} needs a doctor's prescription. Request it from a prescription that includes it.`,
      );
    }
    if (inPrescription) {
      const limit = prescribed.get(med.id)!;
      if (item.quantity > limit) {
        throw badRequest(
          `Only ${limit} × ${med.unit} of ${med.name} were prescribed.`,
          { [`items.${index}.quantity`]: `Maximum ${limit} as prescribed.` },
          'QUANTITY_EXCEEDS_PRESCRIPTION',
        );
      }
    } else if (item.quantity > MAX_OTC_QUANTITY) {
      throw badRequest(
        `You can request at most ${MAX_OTC_QUANTITY} × ${med.unit} of ${med.name} without a prescription.`,
        { [`items.${index}.quantity`]: `Maximum ${MAX_OTC_QUANTITY} without a prescription.` },
        'QUANTITY_LIMIT',
      );
    }
    if (med.stock_quantity < item.quantity) {
      throw conflict(
        'OUT_OF_STOCK',
        med.stock_quantity === 0
          ? `${med.name} is currently out of stock.`
          : `Only ${med.stock_quantity} × ${med.unit} of ${med.name} available right now.`,
      );
    }
    return { med, quantity: item.quantity };
  });

  // Insert ---------------------------------------------------------------------
  const now = nowIso();
  const student = getUserRow(studentId)!;
  const id = tx(() => {
    const code = generateCode('MR', 'medicine_requests');
    const info = db
      .prepare(
        `INSERT INTO medicine_requests
           (code, student_id, prescription_id, fulfilment, delivery_location, notes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`,
      )
      .run(code, studentId, prescription?.id ?? null, fulfilment, deliveryLocation, input.notes, now, now);
    const requestId = Number(info.lastInsertRowid);
    const insertItem = db.prepare(
      'INSERT INTO medicine_request_items (request_id, medicine_id, medicine_name, quantity) VALUES (?, ?, ?, ?)',
    );
    for (const r of resolved) insertItem.run(requestId, r.med.id, r.med.name, r.quantity);
    addStatusEvent(
      'medicine_request',
      requestId,
      'submitted',
      prescription ? `Requested against prescription ${prescription.code}` : null,
      studentId,
      now,
    );
    const itemsText = plural(resolved.length, 'item');
    const how = fulfilment === 'pickup' ? 'pickup at the dispensary' : `campus delivery to ${deliveryLocation}`;
    logActivity({
      actorId: studentId,
      action: 'medicine_request.submitted',
      category: 'medicine_request',
      description: `${student.name} submitted medicine request ${code} (${itemsText}, ${how})`,
      entityType: 'medicine_request',
      entityId: requestId,
      createdAt: now,
    });
    notify(studentId, {
      type: 'medicine_request',
      title: 'Medicine request submitted',
      body: `Request ${code} for ${itemsText} was sent to the dispensary. You'll be notified as it progresses.`,
      link: `/student/requests?open=${requestId}`,
    });
    notify(activeUserIds('staff'), {
      type: 'medicine_request',
      title: `New medicine request ${code}`,
      body: `${student.name} requested ${itemsText} for ${fulfilment === 'pickup' ? 'pickup' : 'campus delivery'}.`,
      link: `/staff/requests?open=${requestId}`,
    });
    return requestId;
  });
  emitInvalidate(REQUEST_KEYS);
  return getMedicineRequest(id)!;
}

// ---------------------------------------------------------------------------
// Status changes (staff / admin)
// ---------------------------------------------------------------------------
export const updateRequestStatusSchema = z.object({
  status: z.enum(REQUEST_STATUSES, { message: 'Choose a valid status.' }),
  note: zOptionalText(500),
  rejectionReason: zOptionalText(500),
});
export type UpdateRequestStatusInput = z.output<typeof updateRequestStatusSchema>;

function assertStockCovers(requestId: number, action: string) {
  const short = db
    .prepare(
      `SELECT i.medicine_name, i.quantity, m.stock_quantity, m.unit
         FROM medicine_request_items i JOIN medicines m ON m.id = i.medicine_id
        WHERE i.request_id = ? AND m.stock_quantity < i.quantity`,
    )
    .all(requestId) as { medicine_name: string; quantity: number; stock_quantity: number; unit: string }[];
  if (short.length) {
    const s = short[0];
    throw conflict(
      'INSUFFICIENT_STOCK',
      `Cannot ${action}: only ${s.stock_quantity} × ${s.unit} of ${s.medicine_name} in stock (${s.quantity} requested).`,
    );
  }
}

const TIMESTAMP_COLUMN: Partial<Record<RequestStatus, keyof MedicineRequestRow>> = {
  approved: 'approved_at',
  preparing: 'preparing_at',
  ready_for_pickup: 'ready_at',
  out_for_delivery: 'dispatched_at',
  fulfilled: 'fulfilled_at',
  rejected: 'rejected_at',
  cancelled: 'cancelled_at',
};

const VERB: Partial<Record<RequestStatus, string>> = {
  approved: 'approved',
  preparing: 'started preparing',
  ready_for_pickup: 'marked ready for pickup',
  out_for_delivery: 'sent out for delivery',
  fulfilled: 'fulfilled',
  rejected: 'rejected',
};

function studentMessage(row: MedicineRequestRow, status: RequestStatus, reason: string | null) {
  const code = row.code;
  switch (status) {
    case 'approved':
      return {
        title: 'Medicine request approved',
        body: `Request ${code} has been approved and will be prepared shortly.`,
      };
    case 'preparing':
      return { title: 'Preparing your medicines', body: `The pharmacist is preparing request ${code}.` };
    case 'ready_for_pickup':
      return {
        title: 'Ready for pickup',
        body: `Your medicines are ready for pickup — show code ${code} at the dispensary counter.`,
      };
    case 'out_for_delivery':
      return {
        title: 'Out for delivery',
        body: `Request ${code} is out for delivery to ${row.delivery_location ?? 'your hostel'}.`,
      };
    case 'fulfilled':
      return {
        title: 'Medicine request fulfilled',
        body:
          row.fulfilment === 'delivery'
            ? `Your medicines for request ${code} have been delivered to ${row.delivery_location ?? 'your location'}.`
            : `You collected the medicines for request ${code}. Follow the dosage instructions carefully.`,
      };
    case 'rejected':
      return { title: 'Medicine request rejected', body: `Request ${code} was rejected: ${reason ?? 'No reason given'}.` };
    case 'cancelled':
      return { title: 'Medicine request cancelled', body: `Request ${code} has been cancelled.` };
    default:
      return { title: `Request ${REQUEST_STATUS_LABELS[status]}`, body: `Request ${code} is now ${REQUEST_STATUS_LABELS[status]}.` };
  }
}

export function updateMedicineRequestStatus(
  id: number,
  actorId: number,
  input: UpdateRequestStatusInput,
): MedicineRequest {
  const row = getMedicineRequestRow(id);
  if (!row) throw notFound('Medicine request');
  const to = input.status;
  const allowed = allowedRequestTransitions(row.status, row.fulfilment);
  if (!allowed.includes(to)) {
    throw conflict(
      'INVALID_TRANSITION',
      `Cannot change request ${row.code} from ${REQUEST_STATUS_LABELS[row.status]} to ${REQUEST_STATUS_LABELS[to]}.`,
    );
  }
  const rejectionReason = to === 'rejected' ? input.rejectionReason ?? input.note : null;
  if (to === 'rejected' && !rejectionReason) {
    throw badRequest('Please give a reason for rejecting this request.', {
      rejectionReason: 'Enter a reason for rejection.',
    });
  }
  if (to === 'approved') assertStockCovers(id, 'approve this request');

  const now = nowIso();
  const actor = getUserRow(actorId)!;
  const student = getUserRow(row.student_id)!;
  const lowStockChecks: { before: { quantity: number; minStock: number }; medicineId: number }[] = [];

  tx(() => {
    // Re-read inside the transaction so concurrent changes can't double-apply.
    const current = getMedicineRequestRow(id)!;
    if (current.status !== row.status) {
      throw conflict('INVALID_TRANSITION', `Request ${row.code} was updated by someone else. Refresh and try again.`);
    }

    if (to === 'fulfilled') {
      const items = db
        .prepare('SELECT medicine_id, medicine_name, quantity FROM medicine_request_items WHERE request_id = ?')
        .all(id) as { medicine_id: number; medicine_name: string; quantity: number }[];
      // Verify every item first so nothing changes when one is short.
      for (const item of items) {
        const med = getMedicineRow(item.medicine_id);
        if (!med || med.stock_quantity < item.quantity) {
          throw conflict(
            'INSUFFICIENT_STOCK',
            `Cannot fulfil ${row.code}: only ${med?.stock_quantity ?? 0} × ${med?.unit ?? 'unit'} of ${item.medicine_name} in stock (${item.quantity} needed).`,
          );
        }
      }
      const dispensed = db
        .prepare("SELECT COUNT(*) AS c FROM stock_movements WHERE request_id = ? AND type = 'dispense'")
        .get(id) as { c: number };
      if (dispensed.c > 0) {
        throw conflict('ALREADY_DISPENSED', `Stock for ${row.code} has already been dispensed.`);
      }
      for (const item of items) {
        const med = getMedicineRow(item.medicine_id)!;
        lowStockChecks.push({
          before: { quantity: med.stock_quantity, minStock: med.min_stock },
          medicineId: med.id,
        });
        const res = db
          .prepare(
            'UPDATE medicines SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ? AND stock_quantity >= ?',
          )
          .run(item.quantity, now, item.medicine_id, item.quantity);
        if (res.changes === 0) {
          throw conflict('INSUFFICIENT_STOCK', `Not enough ${item.medicine_name} in stock to fulfil ${row.code}.`);
        }
        insertMovement({
          medicineId: item.medicine_id,
          type: 'dispense',
          quantityChange: -item.quantity,
          balanceAfter: med.stock_quantity - item.quantity,
          reason: `Dispensed to ${student.name}`,
          reference: row.code,
          requestId: id,
          performedBy: actorId,
          createdAt: now,
        });
      }
    }

    const tsColumn = TIMESTAMP_COLUMN[to];
    const sets = ['status = ?', 'handled_by = ?', 'updated_at = ?'];
    const params: unknown[] = [to, actorId, now];
    if (tsColumn) {
      sets.push(`${tsColumn} = ?`);
      params.push(now);
    }
    if (to === 'rejected') {
      sets.push('rejection_reason = ?');
      params.push(rejectionReason);
    }
    if (input.note && to !== 'rejected') {
      sets.push('staff_notes = ?');
      params.push(input.note);
    }
    const res = db
      .prepare(`UPDATE medicine_requests SET ${sets.join(', ')} WHERE id = ? AND status = ?`)
      .run(...params, id, row.status);
    if (res.changes === 0) {
      throw conflict('INVALID_TRANSITION', `Request ${row.code} was updated by someone else. Refresh and try again.`);
    }

    addStatusEvent('medicine_request', id, to, to === 'rejected' ? rejectionReason : input.note, actorId, now);
    logActivity({
      actorId,
      action: `medicine_request.${to}`,
      category: 'medicine_request',
      description: `${actor.name} ${VERB[to] ?? `set to ${REQUEST_STATUS_LABELS[to]}`} medicine request ${row.code} for ${student.name}${
        to === 'rejected' && rejectionReason ? ` — ${rejectionReason}` : ''
      }`,
      entityType: 'medicine_request',
      entityId: id,
      createdAt: now,
    });
    const msg = studentMessage({ ...row, status: to }, to, rejectionReason);
    notify(row.student_id, {
      type: 'medicine_request',
      title: msg.title,
      body: msg.body,
      link: `/student/requests?open=${id}`,
    });
  });

  for (const check of lowStockChecks) {
    const after = getMedicineRow(check.medicineId);
    if (after) notifyLowStockIfCrossed(check.before, after);
  }
  emitInvalidate(REQUEST_KEYS);
  return getMedicineRequest(id)!;
}

// ---------------------------------------------------------------------------
// Student cancellation
// ---------------------------------------------------------------------------
export const cancelRequestSchema = z.object({ reason: zOptionalText(300) });

export function cancelMedicineRequest(id: number, studentId: number, reason: string | null): MedicineRequest {
  const row = getMedicineRequestRow(id);
  if (!row || row.student_id !== studentId) throw notFound('Medicine request');
  if (!STUDENT_CANCELLABLE_REQUEST_STATUSES.includes(row.status)) {
    throw conflict(
      'INVALID_TRANSITION',
      `Request ${row.code} is already ${REQUEST_STATUS_LABELS[row.status].toLowerCase()} and can no longer be cancelled.`,
    );
  }
  const now = nowIso();
  const student = getUserRow(studentId)!;
  tx(() => {
    const res = db
      .prepare(
        "UPDATE medicine_requests SET status = 'cancelled', cancelled_at = ?, updated_at = ? WHERE id = ? AND status = ?",
      )
      .run(now, now, id, row.status);
    if (res.changes === 0) throw conflict('INVALID_TRANSITION', 'This request was just updated. Refresh and try again.');
    addStatusEvent('medicine_request', id, 'cancelled', reason ?? 'Cancelled by student', studentId, now);
    logActivity({
      actorId: studentId,
      action: 'medicine_request.cancelled',
      category: 'medicine_request',
      description: `${student.name} cancelled medicine request ${row.code}${reason ? ` — ${reason}` : ''}`,
      entityType: 'medicine_request',
      entityId: id,
      createdAt: now,
    });
    notify(studentId, {
      type: 'medicine_request',
      title: 'Medicine request cancelled',
      body: `You cancelled request ${row.code}.`,
      link: `/student/requests?open=${id}`,
    });
    notify(activeUserIds('staff'), {
      type: 'medicine_request',
      title: `Request ${row.code} cancelled`,
      body: `${student.name} cancelled this request${reason ? `: ${reason}` : '.'}`,
      link: `/staff/requests?open=${id}`,
    });
  });
  emitInvalidate(REQUEST_KEYS);
  return getMedicineRequest(id)!;
}
