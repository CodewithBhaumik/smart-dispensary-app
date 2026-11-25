import { REQUEST_STATUS_LABELS, requestProgressSteps } from '@shared/constants';
import type { MedicineRequest } from '@shared/types';

/** Inputs for <ProgressSteps> describing where a request is in its workflow. */
export function requestProgress(request: MedicineRequest): {
  steps: { key: string; label: string }[];
  current: string;
  failed: { label: string } | null;
} {
  const keys = requestProgressSteps(request.fulfilment);
  const steps = keys.map((key) => ({
    key,
    label: key === 'ready_for_pickup' ? 'Ready' : key === 'out_for_delivery' ? 'On the way' : REQUEST_STATUS_LABELS[key],
  }));

  if (request.status === 'rejected' || request.status === 'cancelled') {
    // Furthest step actually reached before the request stopped.
    let reached = 0;
    if (request.approvedAt) reached = 1;
    if (request.preparingAt) reached = 2;
    if (request.readyAt || request.dispatchedAt) reached = 3;
    const failedIndex = Math.min(reached + 1, keys.length - 1);
    return {
      steps,
      current: keys[failedIndex],
      failed: { label: request.status === 'rejected' ? 'Rejected' : 'Cancelled' },
    };
  }
  return { steps, current: request.status, failed: null };
}

/** "Paracetamol 650 mg × 2, ORS × 3" */
export function itemsSummary(request: MedicineRequest, max = 3): string {
  const parts = request.items.slice(0, max).map((i) => `${i.medicineName} × ${i.quantity}`);
  const extra = request.items.length - max;
  return extra > 0 ? `${parts.join(', ')} +${extra} more` : parts.join(', ');
}
