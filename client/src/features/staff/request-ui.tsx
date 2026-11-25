import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  PackageOpen,
  Store,
  Truck,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { allowedRequestTransitions, FULFILMENT_LABELS, type RequestStatus } from '@shared/constants';
import type { MedicineRequest } from '@shared/types';
import { ConfirmDialog } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useUpdateRequestStatus } from './api';

export const ACTION_META: Partial<Record<RequestStatus, { label: string; short: string; icon: LucideIcon }>> = {
  approved: { label: 'Approve request', short: 'Approve', icon: CheckCircle2 },
  preparing: { label: 'Start preparing', short: 'Prepare', icon: PackageOpen },
  ready_for_pickup: { label: 'Mark ready for pickup', short: 'Ready for pickup', icon: Store },
  out_for_delivery: { label: 'Send out for delivery', short: 'Out for delivery', icon: Truck },
  fulfilled: { label: 'Mark fulfilled', short: 'Fulfil', icon: PackageCheck },
  rejected: { label: 'Reject', short: 'Reject', icon: XCircle },
};

const SUCCESS_COPY: Record<string, (r: MedicineRequest) => { title: string; description?: string }> = {
  approved: (r) => ({ title: `${r.code} approved`, description: `${r.student.name} has been notified.` }),
  preparing: (r) => ({ title: `Preparing ${r.code}`, description: 'Pick and pack the items listed.' }),
  ready_for_pickup: (r) => ({ title: `${r.code} is ready for pickup`, description: `${r.student.name} will collect it at the counter.` }),
  out_for_delivery: (r) => ({
    title: `${r.code} is out for delivery`,
    description: r.deliveryLocation ? `Delivering to ${r.deliveryLocation}.` : undefined,
  }),
  fulfilled: (r) => ({ title: 'Inventory updated', description: `${r.code} fulfilled — ${r.totalUnits} units dispensed.` }),
  rejected: (r) => ({ title: `${r.code} rejected`, description: `${r.student.name} has been notified with your reason.` }),
};

/** "Paracetamol 650 mg ×2, Cetirizine 10 mg ×1 +1 more" */
export function itemsSummary(r: Pick<MedicineRequest, 'items'>, max = 2): string {
  const parts = r.items.slice(0, max).map((i) => `${i.medicineName} ×${i.quantity}`);
  const extra = r.items.length - max;
  return extra > 0 ? `${parts.join(', ')} +${extra} more` : parts.join(', ');
}

export function hasShortfall(r: Pick<MedicineRequest, 'items' | 'status'>): boolean {
  if (['fulfilled', 'rejected', 'cancelled'].includes(r.status)) return false;
  return r.items.some((i) => i.stockAvailable < i.quantity);
}

export function FulfilmentLabel({ request, showLocation = false, className }: { request: MedicineRequest; showLocation?: boolean; className?: string }) {
  const Icon = request.fulfilment === 'pickup' ? Store : Truck;
  return (
    <span className={cn('inline-flex min-w-0 items-start gap-2 text-[13px] text-slate-700', className)}>
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <span className="min-w-0">
        <span className="block">{request.fulfilment === 'pickup' ? 'Pickup' : 'Delivery'}</span>
        {showLocation && request.fulfilment === 'delivery' && request.deliveryLocation && (
          <span className="block max-w-[180px] truncate text-xs text-muted-foreground">{request.deliveryLocation}</span>
        )}
      </span>
    </span>
  );
}

export const fulfilmentLong = (r: MedicineRequest) => FULFILMENT_LABELS[r.fulfilment];

const REJECT_REASONS = [
  'Out of stock — please request again in a few days',
  'Needs a doctor consultation first',
  'Duplicate of an open request',
  'Prescription has expired',
];

/**
 * Next-step buttons for a request (approve → prepare → ready/out for delivery → fulfil, and reject).
 * Fulfilment asks for confirmation and lists the exact stock deductions.
 */
export function RequestActions({
  request,
  note,
  size = 'sm',
  primaryOnly = false,
  onDone,
  className,
}: {
  request: MedicineRequest;
  note?: string;
  size?: 'xs' | 'sm' | 'default';
  primaryOnly?: boolean;
  onDone?: (updated: MedicineRequest) => void;
  className?: string;
}) {
  const update = useUpdateRequestStatus();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [fulfilOpen, setFulfilOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);

  const transitions = allowedRequestTransitions(request.status, request.fulfilment);
  const primary = transitions.find((t) => t !== 'rejected');
  const canReject = transitions.includes('rejected');
  if (!primary && !canReject) return null;

  const run = async (status: RequestStatus, extra: { rejectionReason?: string } = {}) => {
    try {
      const updated = await update.mutateAsync({
        id: request.id,
        status,
        note: note?.trim() ? note.trim() : null,
        ...extra,
      });
      const copy = SUCCESS_COPY[status]?.(updated);
      if (copy) toast.success(copy.title, { description: copy.description });
      onDone?.(updated);
    } catch (e) {
      toast.error(getErrorMessage(e));
      throw e;
    }
  };

  const busy = (status: RequestStatus) => update.isPending && update.variables?.status === status;
  const meta = primary ? ACTION_META[primary] : undefined;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} onClick={(e) => e.stopPropagation()}>
      {canReject && !primaryOnly && (
        <Button
          variant="outline"
          size={size}
          className="border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
          disabled={update.isPending}
          onClick={() => {
            setReason('');
            setReasonError(null);
            setRejectOpen(true);
          }}
        >
          <XCircle /> Reject
        </Button>
      )}
      {primary && meta && (
        <Button
          size={size}
          disabled={update.isPending}
          variant={primary === 'fulfilled' ? 'default' : primaryOnly ? 'soft' : 'default'}
          onClick={() => (primary === 'fulfilled' ? setFulfilOpen(true) : void run(primary).catch(() => undefined))}
        >
          {busy(primary) ? <Loader2 className="animate-spin" /> : <meta.icon />}
          {primaryOnly ? meta.short : meta.label}
        </Button>
      )}

      <ConfirmDialog
        open={fulfilOpen}
        onOpenChange={setFulfilOpen}
        title={`Fulfil ${request.code}?`}
        description={`This will deduct the following from inventory and close the request for ${request.student.name}.`}
        confirmLabel="Fulfil & deduct stock"
        onConfirm={() => run('fulfilled')}
      >
        <ul className="divide-y rounded-lg border">
          {request.items.map((item) => {
            const after = item.stockAvailable - item.quantity;
            const short = after < 0;
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{item.medicineName}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.quantity} × {item.unit}
                  </span>
                </span>
                <span className={cn('shrink-0 text-xs font-medium tabular-nums', short ? 'text-rose-600' : 'text-slate-600')}>
                  {item.stockAvailable} → {short ? 'insufficient' : after}
                </span>
              </li>
            );
          })}
        </ul>
        {hasShortfall(request) && (
          <p className="flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            Stock is lower than requested for at least one item. Restock first, or the dispensary will refuse this step.
          </p>
        )}
      </ConfirmDialog>

      <Dialog open={rejectOpen} onOpenChange={(o) => !update.isPending && setRejectOpen(o)}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Reject {request.code}?</DialogTitle>
            <DialogDescription>The student sees this reason in their request history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`reject-${request.id}`} className="text-[13px]">
              Reason <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id={`reject-${request.id}`}
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
              placeholder="Explain why this request cannot be fulfilled"
              aria-invalid={!!reasonError}
            />
            {reasonError && <p className="text-xs font-medium text-rose-600">{reasonError}</p>}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="rounded-full border px-2.5 py-0.5 text-xs text-slate-600 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={update.isPending}>
              Keep request
            </Button>
            <Button
              variant="destructive"
              disabled={update.isPending}
              onClick={async () => {
                if (reason.trim().length < 5) {
                  setReasonError('Add a short reason (at least 5 characters).');
                  return;
                }
                try {
                  await run('rejected', { rejectionReason: reason.trim() });
                  setRejectOpen(false);
                } catch {
                  /* toast shown */
                }
              }}
            >
              {busy('rejected') && <Loader2 className="animate-spin" />}
              Reject request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
