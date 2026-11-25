import { OPEN_REQUEST_STATUSES, type RequestStatus } from '@shared/constants';
import type { Prescription } from '@shared/types';
import { daysUntil } from '@/lib/format';

export function isPrescriptionExpired(prescription: Pick<Prescription, 'validUntil'>): boolean {
  return daysUntil(prescription.validUntil) < 0;
}

export type PrescriptionRequestState =
  | { kind: 'can_request' }
  | { kind: 'expired' }
  | { kind: 'open'; requestId: number; code: string; status: RequestStatus }
  | { kind: 'dispensed'; requestId: number; code: string };

/** What the student can do with a prescription's medicines right now. */
export function prescriptionRequestState(rx: Prescription): PrescriptionRequestState {
  const latest = rx.latestRequest;
  if (latest && OPEN_REQUEST_STATUSES.includes(latest.status)) {
    return { kind: 'open', requestId: latest.id, code: latest.code, status: latest.status };
  }
  if (latest && latest.status === 'fulfilled') return { kind: 'dispensed', requestId: latest.id, code: latest.code };
  if (isPrescriptionExpired(rx)) return { kind: 'expired' };
  return { kind: 'can_request' };
}
