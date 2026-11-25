import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, MapPin, MessageSquareText, Phone, ShieldAlert } from 'lucide-react';
import { REQUEST_STATUS_LABELS, requestProgressSteps } from '@shared/constants';
import {
  ErrorState,
  ProgressSteps,
  StatusBadge,
  Timeline,
  ToneBadge,
  UserAvatar,
} from '@/components/app';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, pluralize, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useRequestDetail } from './api';
import { fulfilmentLong, hasShortfall, RequestActions } from './request-ui';

/** Full request detail for staff/admin with the next workflow actions. */
export function RequestDetailSheet({ requestId, onOpenChange }: { requestId: number | null; onOpenChange: (open: boolean) => void }) {
  const query = useRequestDetail(requestId);
  const r = query.data;
  const [note, setNote] = useState('');

  useEffect(() => setNote(''), [requestId]);

  const terminal = r ? ['fulfilled', 'rejected', 'cancelled'].includes(r.status) : true;
  const failed =
    r?.status === 'rejected' ? { label: 'Rejected' } : r?.status === 'cancelled' ? { label: 'Cancelled' } : null;
  const steps = r
    ? requestProgressSteps(r.fulfilment).map((s) => ({ key: s, label: REQUEST_STATUS_LABELS[s] }))
    : [];
  // For rejected/cancelled requests mark the step that was never reached as failed.
  let current: string = r?.status ?? 'submitted';
  if (r && failed) {
    const reached = [...r.timeline].reverse().find((e) => steps.some((s) => s.key === e.status))?.status ?? 'submitted';
    const idx = steps.findIndex((s) => s.key === reached);
    current = steps[Math.min(idx + 1, steps.length - 1)]?.key ?? reached;
  }

  return (
    <Sheet open={requestId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 bg-card p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5 pr-12">
          {r ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="request" status={r.status} />
                <span className="text-xs text-muted-foreground">Requested {timeAgo(r.createdAt)}</span>
              </div>
              <SheetTitle className="font-mono text-xl tracking-wide">{r.code}</SheetTitle>
              <SheetDescription>
                {pluralize(r.items.length, 'item')} · {pluralize(r.totalUnits, 'unit')} · {fulfilmentLong(r)}
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="sr-only">Medicine request</SheetTitle>
              <SheetDescription className="sr-only">Loading request</SheetDescription>
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-4 w-56" />
            </>
          )}
        </SheetHeader>

        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
          {!r && query.isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {r && (
            <>
              <ProgressSteps steps={steps} current={current} failed={failed} />

              <section className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <UserAvatar user={r.student} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{r.student.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.student.rollNo} · {r.student.department} · Year {r.student.year}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
                      {r.student.phone && (
                        <a href={`tel:${r.student.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                          <Phone className="size-3.5 text-slate-400" /> {r.student.phone}
                        </a>
                      )}
                      {(r.student.hostel || r.student.room) && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5 text-slate-400" />
                          {[r.student.hostel, r.student.room && `Room ${r.student.room}`].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-medium text-muted-foreground">Fulfilment</p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{fulfilmentLong(r)}</p>
                  {r.fulfilment === 'delivery' && r.deliveryLocation && (
                    <p className="mt-0.5 text-[13px] text-slate-600">{r.deliveryLocation}</p>
                  )}
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-xs font-medium text-muted-foreground">Prescription</p>
                  {r.prescription ? (
                    <>
                      <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-sm font-medium text-slate-900">
                        <FileText className="size-3.5 text-slate-400" /> {r.prescription.code}
                      </p>
                      <p className="mt-0.5 text-[13px] text-slate-600">{r.prescription.doctorName}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-slate-600">Over-the-counter request</p>
                  )}
                </div>
              </section>

              {r.notes && (
                <section className="flex gap-3 rounded-xl bg-muted/50 px-4 py-3">
                  <MessageSquareText className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Note from student</p>
                    <p className="text-sm text-slate-700">{r.notes}</p>
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Items</h3>
                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                      <tr>
                        <th className="px-4 py-2">Medicine</th>
                        <th className="px-4 py-2 text-right">Qty</th>
                        <th className="px-4 py-2 text-right">In stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {r.items.map((item) => {
                        const short = !terminal && item.stockAvailable < item.quantity;
                        return (
                          <tr key={item.id} className={cn(short && 'bg-rose-50/60')}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-900">{item.medicineName}</span>
                                {item.requiresPrescription && (
                                  <ToneBadge tone="violet" className="h-5 px-1.5 text-[10px]">
                                    Rx
                                  </ToneBadge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {[item.form, item.strength].filter(Boolean).join(' · ')} · {item.unit}
                              </p>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{item.quantity}</td>
                            <td
                              className={cn(
                                'px-4 py-2.5 text-right tabular-nums',
                                short ? 'font-semibold text-rose-600' : 'text-slate-600',
                              )}
                            >
                              {item.stockAvailable}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {hasShortfall(r) && (
                  <p className="mt-2 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                    <AlertTriangle className="mt-px size-3.5 shrink-0" />
                    Not enough stock for every item. Restock from Inventory before approving or fulfilling.
                  </p>
                )}
              </section>

              {r.status === 'rejected' && r.rejectionReason && (
                <section className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-500" />
                  <div>
                    <p className="text-xs font-semibold text-rose-700">Rejection reason</p>
                    <p className="text-sm text-rose-900">{r.rejectionReason}</p>
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">History</h3>
                <Timeline events={r.timeline} labels={REQUEST_STATUS_LABELS} />
                {r.handledBy && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Last handled by {r.handledBy.name}
                    {r.fulfilledAt && <> · fulfilled {formatDateTime(r.fulfilledAt)}</>}
                  </p>
                )}
              </section>
            </>
          )}
        </div>

        {r && !terminal && (
          <div className="space-y-3 border-t bg-muted/30 px-6 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="staff-note" className="text-xs text-muted-foreground">
                Note for the timeline (optional)
              </Label>
              <Textarea
                id="staff-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Packed in a sealed pouch at counter 2"
                className="min-h-0"
              />
            </div>
            <RequestActions request={r} note={note} size="default" className="justify-end" onDone={() => setNote('')} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
