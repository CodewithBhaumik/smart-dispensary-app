/**
 * Row → DTO mappers for medicines, medicine requests and emergencies, used by the
 * dashboards (CORE). The OPS routes keep their own mappers; both follow shared/types.ts.
 */
import { EXPIRY_WARNING_DAYS, type EmergencySeverity, type EmergencyStatus, type ExpiryStatus, type FulfilmentMethod, type RequestStatus, type StockStatus } from '@shared/constants';
import type { Emergency, Medicine, MedicineRequest, MedicineRequestItem } from '@shared/types';
import { db } from '../db';
import { bool, parseJson } from '../lib/json';
import { daysBetween, todayStr } from '../lib/time';
import { getStudentMini, getStudentProfileRow, getUserMini } from './minis';
import { getTimeline } from './status-events';

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

export function stockStatusOf(qty: number, min: number): StockStatus {
  if (qty <= 0) return 'out_of_stock';
  if (qty <= min) return 'low_stock';
  return 'in_stock';
}

export function expiryOf(expiry: string | null): { status: ExpiryStatus; days: number | null } {
  if (!expiry) return { status: 'ok', days: null };
  const days = daysBetween(todayStr(), expiry);
  return { status: days < 0 ? 'expired' : days <= EXPIRY_WARNING_DAYS ? 'expiring' : 'ok', days };
}

export function toMedicineDto(r: MedicineRow): Medicine {
  const exp = expiryOf(r.expiry_date);
  return {
    id: r.id,
    name: r.name,
    genericName: r.generic_name,
    category: r.category,
    form: r.form,
    strength: r.strength,
    unit: r.unit,
    description: r.description,
    usageInstructions: r.usage_instructions,
    requiresPrescription: bool(r.requires_prescription),
    stockQuantity: r.stock_quantity,
    minStock: r.min_stock,
    batchNo: r.batch_no,
    expiryDate: r.expiry_date,
    manufacturer: r.manufacturer,
    unitPrice: r.unit_price,
    isActive: bool(r.is_active),
    stockStatus: stockStatusOf(r.stock_quantity, r.min_stock),
    expiryStatus: exp.status,
    daysToExpiry: exp.days,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export interface RequestRow {
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

export function toMedicineRequestDto(r: RequestRow): MedicineRequest {
  const items = (
    db
      .prepare(
        `SELECT i.id, i.medicine_id, i.medicine_name, i.quantity, m.form, m.strength, m.unit, m.stock_quantity, m.requires_prescription
           FROM medicine_request_items i JOIN medicines m ON m.id = i.medicine_id
          WHERE i.request_id = ? ORDER BY i.id`,
      )
      .all(r.id) as {
      id: number;
      medicine_id: number;
      medicine_name: string;
      quantity: number;
      form: string;
      strength: string | null;
      unit: string;
      stock_quantity: number;
      requires_prescription: number;
    }[]
  ).map(
    (i): MedicineRequestItem => ({
      id: i.id,
      medicineId: i.medicine_id,
      medicineName: i.medicine_name,
      form: i.form,
      strength: i.strength,
      unit: i.unit,
      quantity: i.quantity,
      stockAvailable: i.stock_quantity,
      requiresPrescription: bool(i.requires_prescription),
    }),
  );
  const rx = r.prescription_id
    ? (db
        .prepare(
          `SELECT p.id, p.code, u.name AS doctor_name FROM prescriptions p JOIN users u ON u.id = p.doctor_id WHERE p.id = ?`,
        )
        .get(r.prescription_id) as { id: number; code: string; doctor_name: string } | undefined)
    : undefined;
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    fulfilment: r.fulfilment,
    deliveryLocation: r.delivery_location,
    notes: r.notes,
    rejectionReason: r.rejection_reason,
    staffNotes: r.staff_notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    approvedAt: r.approved_at,
    preparingAt: r.preparing_at,
    readyAt: r.ready_at,
    dispatchedAt: r.dispatched_at,
    fulfilledAt: r.fulfilled_at,
    rejectedAt: r.rejected_at,
    cancelledAt: r.cancelled_at,
    student: getStudentMini(r.student_id),
    prescription: rx ? { id: rx.id, code: rx.code, doctorName: rx.doctor_name } : null,
    handledBy: getUserMini(r.handled_by),
    items,
    totalUnits: items.reduce((sum, i) => sum + i.quantity, 0),
    timeline: getTimeline('medicine_request', r.id),
  };
}

export interface EmergencyRow {
  id: number;
  code: string;
  student_id: number;
  category: string;
  severity: EmergencySeverity;
  description: string;
  location: string;
  contact_phone: string;
  emergency_contact: string | null;
  additional_info: string | null;
  status: EmergencyStatus;
  responder_name: string | null;
  responder_phone: string | null;
  resolution_notes: string | null;
  handled_by: number | null;
  acknowledged_at: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toEmergencyDto(r: EmergencyRow): Emergency {
  const profile = getStudentProfileRow(r.student_id);
  return {
    id: r.id,
    code: r.code,
    category: r.category,
    severity: r.severity,
    description: r.description,
    location: r.location,
    contactPhone: r.contact_phone,
    emergencyContact: r.emergency_contact,
    additionalInfo: r.additional_info,
    status: r.status,
    responderName: r.responder_name,
    responderPhone: r.responder_phone,
    resolutionNotes: r.resolution_notes,
    acknowledgedAt: r.acknowledged_at,
    assignedAt: r.assigned_at,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    student: {
      ...getStudentMini(r.student_id),
      bloodGroup: profile?.blood_group ?? null,
      allergies: parseJson<string[]>(profile?.allergies, []),
      conditions: parseJson<string[]>(profile?.conditions, []),
    },
    handledBy: getUserMini(r.handled_by),
    timeline: getTimeline('emergency', r.id),
  };
}

const SEVERITY_RANK = `CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END`;

/** Unresolved emergencies, most severe first then oldest first. */
export function activeEmergencies(studentId?: number): Emergency[] {
  const rows = (
    studentId
      ? db
          .prepare(
            `SELECT * FROM emergencies WHERE status <> 'resolved' AND student_id = ? ORDER BY ${SEVERITY_RANK}, created_at ASC`,
          )
          .all(studentId)
      : db.prepare(`SELECT * FROM emergencies WHERE status <> 'resolved' ORDER BY ${SEVERITY_RANK}, created_at ASC`).all()
  ) as EmergencyRow[];
  return rows.map(toEmergencyDto);
}
