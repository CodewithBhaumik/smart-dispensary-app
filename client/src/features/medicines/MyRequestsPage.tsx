import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, Ban, MapPin, PackageCheck, PackageOpen, Pill, QrCode, Store, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { FULFILMENT_LABELS, OPEN_REQUEST_STATUSES, STUDENT_CANCELLABLE_REQUEST_STATUSES } from '@shared/constants';
import type { MedicineRequest } from '@shared/types';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
  PageHeader,
  Panel,
  ProgressSteps,
  StatusBadge,
} from '@/components/app';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCancelRequest, useMyRequests } from './api';
import { PickupPassDialog } from './PickupPassDialog';
import { RequestDetailSheet } from './RequestDetailSheet';
import { itemsSummary, requestProgress } from './request-progress';

type Tab = 'active' | 'completed' | 'all';

const isOpen = (r: MedicineRequest) => OPEN_REQUEST_STATUSES.includes(r.status);

function Callout({ request, onShowPass }: { request: MedicineRequest; onShowPass: () => void }) {
  if (request.status === 'ready_for_pickup') {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50/70 px-4 py-3 sm:flex-row sm:items-center">
        <Store className="size-5 shrink-0 text-indigo-600" />
        <p className="flex-1 text-sm text-indigo-950">
          <span className="font-semibold">Ready at the dispensary counter.</span> Show your pickup pass to collect.
        </p>
        <Button size="sm" onClick={onShowPass}>
          <QrCode /> Pickup pass
        </Button>
      </div>
    );
  }
  if (request.status === 'out_for_delivery') {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/70 px-4 py-3">
        <Truck className="size-5 shrink-0 text-indigo-600" />
        <p className="text-sm text-indigo-950">
          <span className="font-semibold">On the way</span> to {request.deliveryLocation ?? 'your location'}.
        </p>
      </div>
    );
  }
  if (request.status === 'rejected') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/70 px-4 py-3">
        <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
        <p className="text-sm text-rose-900">
          <span className="font-semibold">Not approved.</span> {request.rejectionReason ?? 'Please contact the dispensary for details.'}
        </p>
      </div>
    );
  }
  return null;
}

function RequestCard({
  request,
  onOpen,
  onCancel,
  onShowPass,
}: {
  request: MedicineRequest;
  onOpen: () => void;
  onCancel: () => void;
  onShowPass: () => void;
}) {
  const progress = requestProgress(request);
  const cancellable = STUDENT_CANCELLABLE_REQUEST_STATUSES.includes(request.status);
  const FulfilIcon = request.fulfilment === 'pickup' ? Store : Truck;
  return (
    <article
      className={cn(
        'min-w-0 rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md',
        isOpen(request) && 'border-l-4 border-l-teal-500',
      )}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-600/10">
              <PackageCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-mono text-sm font-semibold tracking-wide text-slate-900">{request.code}</p>
                <StatusBadge kind="request" status={request.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-slate-700">{itemsSummary(request)}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span title={formatDateTime(request.createdAt)}>Requested {timeAgo(request.createdAt)}</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1">
                  <FulfilIcon className="size-3.5" /> {FULFILMENT_LABELS[request.fulfilment]}
                </span>
                {request.prescription && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="font-mono">{request.prescription.code}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-muted/40 px-3 py-4 sm:px-4">
          <ProgressSteps steps={progress.steps} current={progress.current} failed={progress.failed} />
        </div>

        <Callout request={request} onShowPass={onShowPass} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-3">
        {request.fulfilment === 'delivery' && request.deliveryLocation ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{request.deliveryLocation}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{request.totalUnits} units</span>
        )}
        <div className="flex items-center gap-2">
          {cancellable && (
            <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={onCancel}>
              <Ban /> Cancel
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onOpen}>
            Details <ArrowRight />
          </Button>
        </div>
      </div>
    </article>
  );
}

export default function MyRequestsPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('active');
  const { data, isLoading, error, refetch } = useMyRequests();
  const cancel = useCancelRequest();
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [passId, setPassId] = useState<number | null>(null);

  const openId = params.get('open') ? Number(params.get('open')) : null;
  const setOpen = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', String(id));
    else next.delete('open');
    setParams(next, { replace: true });
  };

  const requests = useMemo(
    () => [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data],
  );
  const counts = useMemo(
    () => ({
      active: requests.filter(isOpen).length,
      completed: requests.filter((r) => !isOpen(r)).length,
      all: requests.length,
    }),
    [requests],
  );
  const visible = requests.filter((r) => (tab === 'all' ? true : tab === 'active' ? isOpen(r) : !isOpen(r)));
  const passRequest = requests.find((r) => r.id === passId) ?? null;

  const confirmCancel = async () => {
    if (!cancelId) return;
    try {
      const updated = await cancel.mutateAsync({ id: cancelId, reason: cancelReason.trim() || undefined });
      toast.success('Request cancelled', { description: `${updated.code} has been cancelled.` });
      setCancelReason('');
    } catch (e) {
      toast.error(getErrorMessage(e));
      throw e;
    }
  };

  return (
    <>
      <PageHeader
        title="My Requests"
        description="Track your medicine requests from submission to pickup or delivery."
        actions={
          <Button asChild>
            <Link to="/student/medicines">
              <Pill /> Request medicines
            </Link>
          </Button>
        }
      />

      <FilterChips<Tab>
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'active', label: 'Active', count: counts.active },
          { value: 'completed', label: 'Completed', count: counts.completed },
          { value: 'all', label: 'All', count: counts.all },
        ]}
      />

      {error ? (
        <ErrorState error={error} retry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Panel key={i}>
              <ListSkeleton rows={2} />
            </Panel>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Panel>
          <EmptyState
            icon={PackageOpen}
            title={
              tab === 'active' ? 'No active requests' : tab === 'completed' ? 'No completed requests yet' : 'No requests yet'
            }
            description={
              tab === 'active'
                ? 'Requests you submit appear here so you can follow every step.'
                : 'Fulfilled, rejected and cancelled requests are kept here for your reference.'
            }
            action={
              <Button asChild>
                <Link to="/student/medicines">
                  <Pill /> Browse medicines
                </Link>
              </Button>
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onOpen={() => setOpen(r.id)}
              onCancel={() => setCancelId(r.id)}
              onShowPass={() => setPassId(r.id)}
            />
          ))}
        </div>
      )}

      <RequestDetailSheet
        id={openId}
        onClose={() => setOpen(null)}
        onCancel={(id) => setCancelId(id)}
        onShowPass={(id) => setPassId(id)}
      />
      <PickupPassDialog request={passRequest} onClose={() => setPassId(null)} />
      <ConfirmDialog
        open={cancelId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelId(null);
            setCancelReason('');
          }
        }}
        tone="danger"
        title="Cancel this medicine request?"
        description="The dispensary will stop processing it. You can submit a new request at any time."
        confirmLabel="Cancel request"
        cancelLabel="Keep request"
        onConfirm={confirmCancel}
      >
        <div className="space-y-1.5">
          <Label htmlFor="cancel-reason" className="text-[13px] text-slate-700">
            Reason (optional)
          </Label>
          <Textarea
            id="cancel-reason"
            rows={2}
            maxLength={200}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="e.g. Bought it elsewhere"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
