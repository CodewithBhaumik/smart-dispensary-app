import { useState } from 'react';
import { CalendarX2, FileText, Stethoscope, Video } from 'lucide-react';
import { toast } from 'sonner';
import { APPOINTMENT_MODE_LABELS, APPOINTMENT_STATUS_LABELS, FREQUENCIES } from '@shared/constants';
import {
  ConfirmDialog,
  ErrorState,
  KeyValueGrid,
  StatusBadge,
  Timeline,
  ToneBadge,
  UserAvatar,
} from '@/components/app';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatDateLong, formatDateTime, formatTimeRange } from '@/lib/format';
import { useAppointmentDetail, useCancelAppointment } from './api';

const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.value, f.label]));

/** Read-only appointment record for administrators (with cancel for active bookings). */
export function AppointmentDetailSheet({ appointmentId, onOpenChange }: { appointmentId: number | null; onOpenChange: (open: boolean) => void }) {
  const query = useAppointmentDetail(appointmentId);
  const cancel = useCancelAppointment();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const a = query.data;
  const cancellable = a && (a.status === 'scheduled' || a.status === 'checked_in');

  return (
    <Sheet open={appointmentId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 bg-card p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5 pr-12">
          {a ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="appointment" status={a.status} />
                <ToneBadge tone={a.mode === 'video' ? 'violet' : 'slate'} icon={a.mode === 'video' ? <Video /> : undefined}>
                  {APPOINTMENT_MODE_LABELS[a.mode]}
                </ToneBadge>
                {a.tokenNo && <ToneBadge tone="amber">Token #{a.tokenNo}</ToneBadge>}
              </div>
              <SheetTitle className="font-display text-xl">{formatDateLong(a.date)}</SheetTitle>
              <SheetDescription>
                {formatTimeRange(a.startTime, a.endTime)} · <span className="font-mono">{a.code}</span>
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="sr-only">Appointment</SheetTitle>
              <SheetDescription className="sr-only">Loading appointment</SheetDescription>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-7 w-64" />
            </>
          )}
        </SheetHeader>

        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
          {!a && query.isLoading && <Skeleton className="h-72 w-full" />}
          {a && (
            <>
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Patient</p>
                  <div className="flex items-center gap-3">
                    <UserAvatar user={a.patient} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{a.patient.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.patient.rollNo} · Year {a.patient.year}
                      </p>
                    </div>
                  </div>
                  {a.patient.allergies.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {a.patient.allergies.map((x) => (
                        <ToneBadge key={x} tone="rose" className="h-5 text-[11px]">
                          Allergy: {x}
                        </ToneBadge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border p-4">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Doctor</p>
                  <div className="flex items-center gap-3">
                    <UserAvatar user={a.doctor} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{a.doctor.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.doctor.specialty}
                        {a.doctor.room && ` · ${a.doctor.room}`}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <KeyValueGrid
                items={[
                  { label: 'Reason', value: a.reason },
                  { label: 'Booked', value: formatDateTime(a.createdAt) },
                  ...(a.checkedInAt ? [{ label: 'Checked in', value: formatDateTime(a.checkedInAt) }] : []),
                  ...(a.completedAt ? [{ label: 'Completed', value: formatDateTime(a.completedAt) }] : []),
                  ...(a.rescheduledCount ? [{ label: 'Rescheduled', value: `${a.rescheduledCount} time${a.rescheduledCount > 1 ? 's' : ''}` }] : []),
                  ...(a.notes ? [{ label: "Student's notes", value: a.notes, full: true }] : []),
                  ...(a.status === 'cancelled'
                    ? [
                        {
                          label: 'Cancellation',
                          value: `${a.cancelReason ?? 'No reason given'}${a.cancelledByRole ? ` (by ${a.cancelledByRole})` : ''}`,
                          full: true,
                        },
                      ]
                    : []),
                ]}
              />

              {a.consultation && a.consultation.status === 'completed' && (
                <section className="rounded-xl border bg-muted/30 p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Stethoscope className="size-4 text-teal-600" /> Consultation summary
                  </p>
                  <KeyValueGrid
                    items={[
                      { label: 'Diagnosis', value: a.consultation.diagnosis ?? '—', full: true },
                      ...(a.consultation.symptoms.length ? [{ label: 'Symptoms', value: a.consultation.symptoms.join(', '), full: true }] : []),
                      ...(a.consultation.advice ? [{ label: 'Advice', value: a.consultation.advice, full: true }] : []),
                      ...(a.consultation.followUpDate ? [{ label: 'Follow-up', value: formatDate(a.consultation.followUpDate) }] : []),
                    ]}
                  />
                </section>
              )}

              {a.prescription && (
                <section className="rounded-xl border p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileText className="size-4 text-violet-600" /> Prescription <span className="font-mono text-xs font-normal text-muted-foreground">{a.prescription.code}</span>
                  </p>
                  <ul className="divide-y">
                    {a.prescription.items.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                        <span>
                          <span className="font-medium text-slate-900">{item.medicineName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {item.dosage} · {FREQ_LABEL[item.frequency] ?? item.frequency} · {item.durationDays} days
                            {item.instructions && ` · ${item.instructions}`}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-600">Qty {item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">History</h3>
                <Timeline events={a.timeline} labels={APPOINTMENT_STATUS_LABELS} />
              </section>
            </>
          )}
        </div>

        {a && cancellable && (
          <div className="flex justify-end border-t bg-muted/30 px-6 py-4">
            <Button
              variant="outline"
              className="border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              onClick={() => {
                setReason('');
                setCancelOpen(true);
              }}
            >
              <CalendarX2 /> Cancel appointment
            </Button>
          </div>
        )}

        {a && (
          <ConfirmDialog
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            tone="danger"
            title={`Cancel ${a.code}?`}
            description={`${a.patient.name} and ${a.doctor.name} will both be notified and the slot will be released.`}
            confirmLabel="Cancel appointment"
            cancelLabel="Keep"
            onConfirm={async () => {
              try {
                await cancel.mutateAsync({ id: a.id, reason: reason.trim() || null });
                toast.success('Appointment cancelled', { description: `${a.code} · slot released` });
              } catch (e) {
                toast.error(getErrorMessage(e));
                throw e;
              }
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="admin-cancel-reason" className="text-[13px]">
                Reason (shared with both)
              </Label>
              <Textarea
                id="admin-cancel-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Doctor unavailable due to an emergency duty"
              />
            </div>
          </ConfirmDialog>
        )}
      </SheetContent>
    </Sheet>
  );
}
