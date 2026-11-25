import { Link } from 'react-router';
import { Ban, FileText, MapPin, QrCode, Store, Truck } from 'lucide-react';
import {
  FULFILMENT_LABELS,
  REQUEST_STATUS_LABELS,
  STUDENT_CANCELLABLE_REQUEST_STATUSES,
} from '@shared/constants';
import { ErrorState, ProgressSteps, StatusBadge, Timeline } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/format';
import { useMedicineRequest } from './api';
import { requestProgress } from './request-progress';

export function RequestDetailSheet({
  id,
  onClose,
  onCancel,
  onShowPass,
}: {
  id: number | null;
  onClose: () => void;
  onCancel: (id: number) => void;
  onShowPass: (id: number) => void;
}) {
  const { data: request, isLoading, error, refetch } = useMedicineRequest(id);
  const progress = request ? requestProgress(request) : null;
  const cancellable = request ? STUDENT_CANCELLABLE_REQUEST_STATUSES.includes(request.status) : false;

  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-background p-0 sm:max-w-lg">
        <SheetHeader className="border-b bg-card px-5 py-4">
          <SheetTitle className="font-display text-lg">
            {request ? <span className="font-mono tracking-wide">{request.code}</span> : 'Medicine request'}
          </SheetTitle>
          <SheetDescription>
            {request ? `Requested ${formatDateTime(request.createdAt)}` : 'Loading request details'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 p-5">
          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          )}
          {error && <ErrorState error={error} retry={() => void refetch()} />}
          {request && progress && (
            <>
              <section className="space-y-4 rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge kind="request" status={request.status} />
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    {request.fulfilment === 'pickup' ? <Store className="size-3.5" /> : <Truck className="size-3.5" />}
                    {FULFILMENT_LABELS[request.fulfilment]}
                  </span>
                </div>
                <ProgressSteps steps={progress.steps} current={progress.current} failed={progress.failed} />
                {request.status === 'ready_for_pickup' && (
                  <Button className="w-full" onClick={() => onShowPass(request.id)}>
                    <QrCode /> Show pickup pass
                  </Button>
                )}
                {request.status === 'rejected' && request.rejectionReason && (
                  <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    <span className="font-semibold">Reason:</span> {request.rejectionReason}
                  </p>
                )}
              </section>

              <section className="rounded-xl border bg-card">
                <h3 className="border-b px-4 py-3 text-sm font-semibold text-slate-900">
                  Medicines ({request.items.length})
                </h3>
                <ul className="divide-y">
                  {request.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{item.medicineName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[item.strength, item.form, item.unit].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-slate-900 tabular-nums">× {item.quantity}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between border-t bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
                  <span>Total units</span>
                  <span className="font-semibold text-slate-800 tabular-nums">{request.totalUnits}</span>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border bg-card p-4 text-sm">
                {request.fulfilment === 'delivery' && request.deliveryLocation && (
                  <p className="flex items-start gap-2 text-slate-700">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <span>
                      <span className="font-medium text-slate-900">Deliver to:</span> {request.deliveryLocation}
                    </span>
                  </p>
                )}
                {request.prescription && (
                  <p className="flex items-start gap-2 text-slate-700">
                    <FileText className="mt-0.5 size-4 shrink-0 text-slate-400" />
                    <span>
                      From prescription{' '}
                      <Link
                        to={`/student/prescriptions?open=${request.prescription.id}`}
                        className="font-mono font-semibold text-primary hover:underline"
                        onClick={onClose}
                      >
                        {request.prescription.code}
                      </Link>{' '}
                      · {request.prescription.doctorName}
                    </span>
                  </p>
                )}
                {request.notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Your note</p>
                    <p className="mt-0.5 text-slate-700">{request.notes}</p>
                  </div>
                )}
                {request.staffNotes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Pharmacist note</p>
                    <p className="mt-0.5 text-slate-700">{request.staffNotes}</p>
                  </div>
                )}
                {request.handledBy && (
                  <p className="text-xs text-muted-foreground">Handled by {request.handledBy.name}</p>
                )}
              </section>

              <section className="rounded-xl border bg-card p-4">
                <h3 className="mb-4 text-sm font-semibold text-slate-900">Status history</h3>
                <Timeline events={request.timeline} labels={REQUEST_STATUS_LABELS} />
              </section>
            </>
          )}
        </div>

        {request && cancellable && (
          <SheetFooter className="border-t bg-card px-5 py-3">
            <Button
              variant="outline"
              className="border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => onCancel(request.id)}
            >
              <Ban /> Cancel request
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
