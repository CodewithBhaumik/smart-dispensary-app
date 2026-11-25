import { MAX_OTC_QUANTITY } from '@shared/constants';
import type { Medicine, Prescription } from '@shared/types';

export interface CartItem {
  medicine: Medicine;
  quantity: number;
  /** Highest quantity allowed for this line (prescription / OTC limit / stock). */
  max: number;
  /** Line preloaded from the active prescription. */
  fromPrescription: boolean;
  /** Quantity originally prescribed (prescription lines only). */
  prescribed?: number;
}

/** Max quantity for a free (non-prescription) OTC line. */
export function otcMax(medicine: Medicine): number {
  return Math.max(0, Math.min(MAX_OTC_QUANTITY, medicine.stockQuantity));
}

/** Max quantity for a line coming from a prescription. */
export function prescriptionMax(medicine: Medicine, prescribed: number): number {
  const limit = medicine.requiresPrescription ? prescribed : Math.min(prescribed, MAX_OTC_QUANTITY);
  return Math.max(0, Math.min(limit, medicine.stockQuantity));
}

/** Builds request lines from a prescription; returns lines plus names that can't be supplied now. */
export function linesFromPrescription(
  rx: Prescription,
  catalog: Medicine[],
): { lines: CartItem[]; unavailable: string[] } {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const lines: CartItem[] = [];
  const unavailable: string[] = [];
  for (const item of rx.items) {
    const medicine = byId.get(item.medicineId);
    if (!medicine) {
      unavailable.push(item.medicineName);
      continue;
    }
    const max = prescriptionMax(medicine, item.quantity);
    if (max <= 0) {
      unavailable.push(item.medicineName);
      continue;
    }
    if (lines.some((l) => l.medicine.id === medicine.id)) continue;
    lines.push({ medicine, quantity: max, max, fromPrescription: true, prescribed: item.quantity });
  }
  return { lines, unavailable };
}

export function defaultDeliveryLocation(student: { hostel: string | null; room: string | null } | null | undefined): string {
  if (!student?.hostel || student.hostel === 'Day Scholar') return '';
  return student.room ? `${student.hostel}, Room ${student.room}` : student.hostel;
}
