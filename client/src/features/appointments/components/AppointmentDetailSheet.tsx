import { Link } from 'react-router';
import {
  CalendarClock,
  CalendarX2,
  ClipboardList,
  FileText,
  HeartPulse,
  Hourglass,
  Stethoscope,
  Video,
  XCircle,
} from 'lucide-react';
import { APPOINTMENT_STATUS_LABELS } from '@shared/constants';
import type { Appointment, AppointmentDetail } from '@shared/types';
import { ErrorState, KeyValueGrid, Timeline, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatDateLong, formatDateTime, formatTimeRange } from '@/lib/format';
import { useAppointmentDetail } from '../api';
import { canCancel, canJoinVideo, canReschedule, isActiveAppointment, isMissed } from '../utils';
import { AppointmentPass } from './AppointmentPassDialog';
import { AppointmentStatusBadge, ModeBadge } from './badges';

function SectionTitle({ icon: Icon, children }: { icon: typeof FileText; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-slate-500 uppercase">
      <Icon className="size-4 text-slate-400" />
      {children}
    </h3>
  );
}

function ConsultationSummary({ detail }: { detail: AppointmentDetail }) {
  const c = detail.consultation;
  if (!c || c.status !== 'completed') return null;
  const vitals = Object.entries(c.vitals ?? {}).filter(([, v]) => Boolean(v));
  const vitalLabels: Record<string, string> = {
    temperature: 'Temperature',
    bloodPressure: 'Blood pressure',
    pulse: 'Pulse',
    spo2: 'SpO₂',
    weight: 'Weight',
  };
  return (
    <section className="space-y-3">
      <SectionTitle icon={Stethoscope}>Consultation summary</SectionTitle>
      <div className="space-y-4 rounded-xl border bg-card p-4">
        {c.diagnosis && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Diagnosis</p>
            <p className="mt-0.5 font-display text-[15px] font-semibold text-slate-900">{c.diagnosis}</p>
          </div>
        )}
        {c.symptoms.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Symptoms</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {c.symptoms.map((s) => (
                <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        {vitals.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {vitals.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/60 px-2.5 py-2">
                <p className="text-[11px] text-muted-foreground">{vitalLabels[k] ?? k}</p>
                <p className="text-sm font-semibold text-slate-800">{v}</p>
              </div>
            ))}
          </div>
        )}
        {c.advice && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Doctor&apos;s advice</p>
            <p className="mt-0.5 text-sm whitespace-pre-line text-slate-700">{c.advice}</p>
          </div>
        )}
        {c.followUpDate && (
          <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <CalendarClock className="mt-0.5 size-4 shrink-0" />
            <span>
              Follow-up suggested on <strong>{formatDate(c.followUpDate)}</strong>
              {c.followUpNotes ? ` — ${c.followUpNotes}` : ''}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

/** Right-side drawer with everything about one appointment (opened via `?open=<id>`). */
export function AppointmentDetailSheet({
  appointmentId,
  onClose,
  onReschedule,
  onCancel,
  onJoin,
}: {
  appointmentId: number | null;
  onClose: () => void;
  onReschedule: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
  onJoin: (a: Appointment) => void;
}) {
  const detail = useAppointmentDetail(appointmentId);
  const a = detail.data;
  const upcoming = a && isActiveAppointment(a) && !isMissed(a);

  return (
    <Sheet open={appointmentId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto bg-card p-0 sm:max-w-lg">
        {!a ? (
          <div className="space-y-4 p-6">
            <SheetTitle className="sr-only">Appointment details</SheetTitle>
            <SheetDescription className="sr-only">Loading appointment</SheetDescription>
            {detail.isError ? (
              <ErrorState error={detail.error} retry={() => detail.refetch()} />
            ) : (
              <>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-72 w-full rounded-2xl" />
              </>
            )}
          </div>
        ) : (
          <>
            <div className="border-b px-6 pt-6 pb-5">
              <div className="flex items-center gap-2 pr-8">
                <span className="font-mono text-xs font-semibold tracking-wider text-muted-foreground">{a.code}</span>
                <AppointmentStatusBadge appointment={a} />
                <ModeBadge mode={a.mode} />
              </div>
              <div className="mt-4 flex items-center gap-3">
                <UserAvatar user={a.doctor} size="lg" />
                <div className="min-w-0">
                  <SheetTitle className="truncate font-display text-lg">{a.doctor.name}</SheetTitle>
                  <SheetDescription className="truncate">
                    {a.doctor.specialty} · {a.doctor.qualifications}
                  </SheetDescription>
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-6 px-6 py-5">
              {a.status === 'checked_in' && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-white font-display text-amber-700 shadow-xs ring-1 ring-amber-600/15">
                    <span className="text-[9px] font-semibold tracking-wider uppercase">Token</span>
                    <span className="text-lg leading-none font-bold tabular-nums">{a.tokenNo ?? '—'}</span>
                  </span>
                  <div className="text-sm text-amber-900">
                    <p className="font-semibold">You&apos;re checked in</p>
                    <p className="text-amber-800/90">Please wait near the OPD — you&apos;ll be called by token number.</p>
                  </div>
                </div>
              )}
              {a.status === 'in_progress' && (
                <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  <HeartPulse className="size-5 shrink-0 text-violet-600" />
                  <p>
                    <span className="font-semibold">Consultation in progress.</span> Your doctor is recording notes for this
                    visit.
                  </p>
                </div>
              )}
              {isMissed(a) && (
                <div className="flex items-center gap-3 rounded-xl border bg-muted/50 px-4 py-3 text-sm text-slate-700">
                  <Hourglass className="size-5 shrink-0 text-slate-500" />
                  <p>This appointment was not attended. Book a new slot if you still need to see a doctor.</p>
                </div>
              )}

              {upcoming && a.status === 'scheduled' && <AppointmentPass appointment={a} />}

              <section className="space-y-3">
                <SectionTitle icon={ClipboardList}>Appointment</SectionTitle>
                <KeyValueGrid
                  items={[
                    { label: 'Date', value: formatDateLong(a.date), full: true },
                    { label: 'Time', value: formatTimeRange(a.startTime, a.endTime) },
                    {
                      label: a.mode === 'video' ? 'Mode' : 'Room',
                      value: a.mode === 'video' ? 'Video consultation' : (a.doctor.room ?? 'Health Centre'),
                    },
                    { label: 'Reason', value: a.reason },
                    { label: 'Token', value: a.tokenNo ? `#${a.tokenNo}` : 'Assigned at check-in' },
                    ...(a.notes ? [{ label: 'Your notes', value: a.notes, full: true }] : []),
                    { label: 'Booked on', value: formatDateTime(a.createdAt) },
                    ...(a.rescheduledCount > 0
                      ? [{ label: 'Rescheduled', value: `${a.rescheduledCount} time${a.rescheduledCount > 1 ? 's' : ''}` }]
                      : []),
                    ...(a.status === 'cancelled'
                      ? [
                          {
                            label: 'Cancelled',
                            value: `${a.cancelledAt ? formatDateTime(a.cancelledAt) : ''}${
                              a.cancelledByRole ? ` · by ${a.cancelledByRole === 'student' ? 'you' : a.cancelledByRole}` : ''
                            }`,
                          },
                          ...(a.cancelReason ? [{ label: 'Reason for cancelling', value: a.cancelReason, full: true }] : []),
                        ]
                      : []),
                  ]}
                />
              </section>

              <ConsultationSummary detail={a} />

              {a.prescription && (
                <Link
                  to={`/student/prescriptions?open=${a.prescription.id}`}
                  className="flex items-center gap-3 rounded-xl border bg-violet-50/50 px-4 py-3 transition-colors hover:border-violet-300 hover:bg-violet-50"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white text-violet-600 shadow-xs ring-1 ring-violet-600/10">
                    <FileText className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">Prescription {a.prescription.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.prescription.items.length} medicine{a.prescription.items.length === 1 ? '' : 's'} · valid until{' '}
                      {formatDate(a.prescription.validUntil)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-violet-700">View</span>
                </Link>
              )}

              <section className="space-y-3">
                <SectionTitle icon={CalendarClock}>History</SectionTitle>
                <Timeline events={a.timeline} labels={APPOINTMENT_STATUS_LABELS} />
              </section>
            </div>

            {(canJoinVideo(a) || canReschedule(a) || canCancel(a)) && (
              <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-card/95 px-6 py-4 backdrop-blur">
                {canJoinVideo(a) && (
                  <Button onClick={() => onJoin(a)} className="flex-1">
                    <Video /> Join video call
                  </Button>
                )}
                {canReschedule(a) && (
                  <Button variant="outline" onClick={() => onReschedule(a)} className="flex-1">
                    <CalendarClock /> Reschedule
                  </Button>
                )}
                {canCancel(a) && (
                  <Button
                    variant="outline"
                    onClick={() => onCancel(a)}
                    className="flex-1 border-rose-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <XCircle /> Cancel
                  </Button>
                )}
              </div>
            )}
            {a.status === 'cancelled' && (
              <div className="border-t px-6 py-4">
                <Button asChild variant="outline" className="w-full">
                  <Link to={`/student/book?doctorId=${a.doctor.id}`}>
                    <CalendarX2 /> Book a new slot with {a.doctor.name}
                  </Link>
                </Button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
