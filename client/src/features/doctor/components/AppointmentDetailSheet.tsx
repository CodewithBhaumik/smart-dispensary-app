import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageSquareText,
  Pill,
  Play,
  Stethoscope,
  UserCheck,
  Video,
  XCircle,
} from 'lucide-react';
import { APPOINTMENT_STATUS_LABELS, FREQUENCIES } from '@shared/constants';
import type { AppointmentDetail } from '@shared/types';
import { ErrorState, KeyValueGrid, StatusBadge, Timeline } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useCall } from '@/features/calls/CallProvider';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAppointmentDetail } from '../api';
import { CancelAppointmentDialog, useAppointmentActions } from './appointment-actions';
import { isToday, ModeBadge, SectionLabel, TokenBadge, whenLabel } from './clinic-bits';
import { PatientSnapshot } from './PatientSnapshot';
import { PrescriptionDialog } from './PrescriptionDialog';

const freqLabel = (code: string) => FREQUENCIES.find((f) => f.value === code)?.label ?? code;

function ConsultationSummary({ detail }: { detail: AppointmentDetail }) {
  const c = detail.consultation;
  if (!c) return null;
  const vitals = Object.entries({
    Temp: c.vitals.temperature,
    BP: c.vitals.bloodPressure,
    Pulse: c.vitals.pulse,
    SpO2: c.vitals.spo2,
    Weight: c.vitals.weight,
  }).filter(([, v]) => v);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Consultation</SectionLabel>
        <StatusBadge kind="consultation" status={c.status} noDot />
      </div>
      <div className="space-y-3 rounded-xl border bg-white p-4">
        {c.diagnosis && (
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Diagnosis</p>
            <p className="font-display text-[15px] font-semibold text-slate-900">{c.diagnosis}</p>
          </div>
        )}
        {c.symptoms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {c.symptoms.map((s) => (
              <span key={s} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {s}
              </span>
            ))}
          </div>
        )}
        {vitals.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {vitals.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/70 px-2.5 py-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">{k}</p>
                <p className="text-sm font-semibold text-slate-800">{v}</p>
              </div>
            ))}
          </div>
        )}
        {c.clinicalNotes && <p className="text-sm text-slate-700">{c.clinicalNotes}</p>}
        {c.advice && (
          <div className="rounded-lg bg-teal-50/70 px-3 py-2 text-sm text-teal-900">
            <span className="font-semibold">Advice: </span>
            {c.advice}
          </div>
        )}
        {c.followUpDate && (
          <p className="flex items-center gap-1.5 text-[13px] text-slate-600">
            <CalendarClock className="size-3.5 text-slate-400" /> Follow-up on {formatDate(c.followUpDate)}
            {c.followUpNotes ? ` — ${c.followUpNotes}` : ''}
          </p>
        )}
      </div>
    </section>
  );
}

/** Right-side drawer with the full appointment record and status-aware actions. */
export function AppointmentDetailSheet({
  appointmentId,
  onOpenChange,
}: {
  appointmentId: number | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = appointmentId !== null;
  const { data: detail, isLoading, isError, error, refetch } = useAppointmentDetail(appointmentId);
  const { doCheckIn, doStart, pendingId } = useAppointmentActions();
  const { startCall } = useCall();
  const navigate = useNavigate();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rxOpen, setRxOpen] = useState(false);

  const busy = detail ? pendingId === detail.id : false;
  const today = detail ? isToday(detail.date) : false;
  const isVideo = detail?.mode === 'video';
  const active = detail ? ['scheduled', 'checked_in', 'in_progress'].includes(detail.status) : false;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-xl">
          {isLoading || !detail ? (
            <div className="space-y-4 p-6">
              <SheetTitle className="sr-only">Appointment details</SheetTitle>
              <SheetDescription className="sr-only">Loading appointment</SheetDescription>
              {isError ? (
                <ErrorState error={error} retry={() => void refetch()} />
              ) : (
                <>
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-40 w-full rounded-xl" />
                  <Skeleton className="h-32 w-full rounded-xl" />
                </>
              )}
            </div>
          ) : (
            <>
              <SheetHeader className="gap-2 border-b px-6 pt-5 pb-4">
                <div className="flex flex-wrap items-center gap-2 pr-8">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-slate-700">
                    {detail.code}
                  </span>
                  <StatusBadge kind="appointment" status={detail.status} />
                  <ModeBadge mode={detail.mode} />
                  {detail.tokenNo ? <TokenBadge token={detail.tokenNo} /> : null}
                </div>
                <SheetTitle className="font-display text-xl">{detail.student.name}</SheetTitle>
                <SheetDescription>
                  {whenLabel(detail)} · {detail.reason}
                </SheetDescription>
              </SheetHeader>

              <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
                {detail.status === 'cancelled' && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">
                      Cancelled{detail.cancelledByRole ? ` by ${detail.cancelledByRole === 'doctor' ? 'doctor' : detail.cancelledByRole}` : ''}
                      {detail.cancelledAt ? ` · ${formatDateTime(detail.cancelledAt)}` : ''}
                    </p>
                    {detail.cancelReason && <p className="mt-0.5">{detail.cancelReason}</p>}
                  </div>
                )}

                <section className="space-y-3">
                  <SectionLabel>Patient</SectionLabel>
                  <PatientSnapshot patient={detail.patient} />
                </section>

                <section className="space-y-3">
                  <SectionLabel>Visit details</SectionLabel>
                  <KeyValueGrid
                    items={[
                      { label: 'Reason', value: detail.reason },
                      { label: 'Mode', value: detail.mode === 'video' ? 'Video consultation' : `In-person · ${detail.doctor.room ?? 'OPD'}` },
                      { label: 'Status', value: APPOINTMENT_STATUS_LABELS[detail.status] },
                      { label: 'Booked on', value: formatDateTime(detail.createdAt) },
                      ...(detail.checkedInAt ? [{ label: 'Checked in', value: formatDateTime(detail.checkedInAt) }] : []),
                      ...(detail.rescheduledCount ? [{ label: 'Rescheduled', value: `${detail.rescheduledCount} time(s)` }] : []),
                      ...(detail.notes
                        ? [
                            {
                              label: "Student's note",
                              value: (
                                <span className="flex gap-1.5 font-normal text-slate-700">
                                  <MessageSquareText className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                                  {detail.notes}
                                </span>
                              ),
                              full: true,
                            },
                          ]
                        : []),
                    ]}
                  />
                </section>

                <ConsultationSummary detail={detail} />

                {detail.prescription && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <SectionLabel>Prescription · {detail.prescription.code}</SectionLabel>
                      <Button variant="link" size="sm" onClick={() => setRxOpen(true)}>
                        Open prescription
                      </Button>
                    </div>
                    <ul className="divide-y rounded-xl border bg-white">
                      {detail.prescription.items.map((item) => (
                        <li key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-600">
                            <Pill className="size-3.5" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900">{item.medicineName}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.dosage} · {freqLabel(item.frequency)} · {item.durationDays} days · Qty {item.quantity}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className="space-y-3">
                  <SectionLabel>History</SectionLabel>
                  <Timeline events={detail.timeline} labels={APPOINTMENT_STATUS_LABELS} />
                </section>
              </div>

              {detail.status !== 'cancelled' && (
                <SheetFooter className="flex-row flex-wrap justify-end gap-2 border-t bg-muted/30 px-6 py-4">
                  {(detail.status === 'scheduled' || detail.status === 'checked_in') && (
                    <Button
                      variant="outline"
                      className="mr-auto text-rose-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => setCancelOpen(true)}
                    >
                      <XCircle /> Cancel
                    </Button>
                  )}
                  {isVideo && active && (
                    <Button variant="soft" onClick={() => startCall(detail.student, { appointmentId: detail.id })}>
                      <Video /> Start video call
                    </Button>
                  )}
                  {detail.status === 'scheduled' && !isVideo && (
                    <Button
                      onClick={() => void doCheckIn(detail)}
                      disabled={busy || !today}
                      title={today ? undefined : `Check-in opens on ${formatDate(detail.date)}`}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <UserCheck />}
                      {today ? 'Check in patient' : `Check-in opens ${formatDate(detail.date)}`}
                    </Button>
                  )}
                  {((detail.status === 'scheduled' && isVideo) || detail.status === 'checked_in') && (
                    <Button
                      onClick={() => void doStart(detail)}
                      disabled={busy || !today}
                      title={today ? undefined : `Consultation can start on ${formatDate(detail.date)}`}
                    >
                      {busy ? <Loader2 className="animate-spin" /> : <Play />}
                      Start consultation
                    </Button>
                  )}
                  {detail.status === 'in_progress' && (
                    <Button onClick={() => navigate(`/doctor/consultation/${detail.id}`)}>
                      <Stethoscope /> Continue consultation
                    </Button>
                  )}
                  {detail.status === 'completed' && (
                    <>
                      {detail.prescription ? (
                        <Button variant="outline" onClick={() => setRxOpen(true)}>
                          <FileText /> View prescription
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => navigate(`/doctor/consultation/${detail.id}?prescribe=1`)}>
                          <FileText /> Create prescription
                        </Button>
                      )}
                      <Button onClick={() => navigate(`/doctor/consultation/${detail.id}`)}>
                        <ClipboardCheck /> Consultation summary
                      </Button>
                    </>
                  )}
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
      <CancelAppointmentDialog appointment={detail ?? null} open={cancelOpen} onOpenChange={setCancelOpen} />
      <PrescriptionDialog prescription={detail?.prescription ?? null} open={rxOpen} onOpenChange={setRxOpen} />
    </>
  );
}
