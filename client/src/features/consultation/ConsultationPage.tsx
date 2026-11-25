import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import {
  CalendarClock,
  CalendarX2,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageSquareText,
  Play,
  Printer,
  Stethoscope,
  UserCheck,
  Video,
} from 'lucide-react';
import type { AppointmentDetail } from '@shared/types';
import { EmptyState, ErrorState, KeyValueGrid, PageSkeleton, Panel } from '@/components/app';
import { Button } from '@/components/ui/button';
import { useCall } from '@/features/calls/CallProvider';
import { useAppointmentDetail } from '@/features/doctor/api';
import { useAppointmentActions } from '@/features/doctor/components/appointment-actions';
import { isToday } from '@/features/doctor/components/clinic-bits';
import { PatientSnapshot } from '@/features/doctor/components/PatientSnapshot';
import { PrescriptionView, printPrescription } from '@/features/prescriptions/PrescriptionView';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import { ConsultationHeader } from './ConsultationHeader';
import { ConsultationWorkspace } from './ConsultationWorkspace';
import { CreatePrescriptionDialog } from './CreatePrescriptionDialog';

function PreStart({ detail }: { detail: AppointmentDetail }) {
  const { doCheckIn, doStart, pendingId } = useAppointmentActions();
  const { startCall } = useCall();
  const busy = pendingId === detail.id;
  const today = isToday(detail.date);
  const isVideo = detail.mode === 'video';
  const needsCheckIn = detail.status === 'scheduled' && !isVideo;
  const canStart = today && (detail.status === 'checked_in' || (detail.status === 'scheduled' && isVideo));

  return (
    <div className="space-y-6">
      <ConsultationHeader detail={detail} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <Panel title="Ready to begin" description="Review the visit, then start the consultation." icon={Stethoscope}>
          <div className="space-y-5">
            <KeyValueGrid
              items={[
                { label: 'Scheduled', value: `${formatDate(detail.date)} · ${formatTime(detail.startTime)} – ${formatTime(detail.endTime)}` },
                { label: 'Reason', value: detail.reason },
                { label: 'Mode', value: isVideo ? 'Video consultation' : `In-person · ${detail.doctor.room ?? 'OPD'}` },
                { label: 'Checked in', value: detail.checkedInAt ? formatDateTime(detail.checkedInAt) : 'Not yet' },
              ]}
            />
            {detail.notes && (
              <div className="flex gap-2 rounded-lg bg-blue-50/70 px-3 py-2.5 text-sm text-blue-900">
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-blue-500" />
                <span>
                  <span className="font-semibold">Student&apos;s note: </span>
                  {detail.notes}
                </span>
              </div>
            )}
            {!today && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <CalendarClock className="size-4 shrink-0" />
                This appointment is on {formatDate(detail.date)}. Check-in and consultation open on that day.
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t pt-4">
              {isVideo && (
                <Button variant="soft" onClick={() => startCall(detail.student, { appointmentId: detail.id })}>
                  <Video /> Start video call
                </Button>
              )}
              {needsCheckIn && (
                <Button variant="outline" onClick={() => void doCheckIn(detail)} disabled={busy || !today}>
                  {busy ? <Loader2 className="animate-spin" /> : <UserCheck />}
                  Check in patient
                </Button>
              )}
              <Button onClick={() => void doStart(detail)} disabled={busy || !canStart}>
                {busy ? <Loader2 className="animate-spin" /> : <Play />}
                Start consultation
              </Button>
            </div>
            {needsCheckIn && today && (
              <p className="text-xs text-muted-foreground">In-person visits start after the patient is checked in at the desk.</p>
            )}
          </div>
        </Panel>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <PatientSnapshot patient={detail.patient} dense />
        </div>
      </div>
    </div>
  );
}

function CompletedView({ detail, autoPrescribe }: { detail: AppointmentDetail; autoPrescribe: boolean }) {
  const [createOpen, setCreateOpen] = useState(false);
  useEffect(() => {
    if (autoPrescribe && !detail.prescription) setCreateOpen(true);
  }, [autoPrescribe, detail.prescription]);
  const c = detail.consultation;
  const vitals = c
    ? Object.entries({
        Temperature: c.vitals.temperature,
        'Blood pressure': c.vitals.bloodPressure,
        Pulse: c.vitals.pulse,
        SpO2: c.vitals.spo2,
        Weight: c.vitals.weight,
      }).filter(([, v]) => v)
    : [];

  return (
    <div className="space-y-6">
      <ConsultationHeader
        detail={detail}
        actions={
          detail.prescription ? (
            <Button variant="outline" onClick={() => detail.prescription && printPrescription(detail.prescription.id)}>
              <Printer /> Print prescription
            </Button>
          ) : (
            <Button onClick={() => setCreateOpen(true)}>
              <FileText /> Create prescription
            </Button>
          )
        }
        meta={detail.completedAt ? <span className="text-xs text-muted-foreground">Completed {formatDateTime(detail.completedAt)}</span> : null}
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Panel title="Consultation summary" icon={ClipboardCheck}>
            {c ? (
              <div className="space-y-5">
                <div>
                  <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Diagnosis</p>
                  <p className="font-display text-lg font-semibold text-slate-900">{c.diagnosis ?? 'Not recorded'}</p>
                </div>
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
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {vitals.map(([k, v]) => (
                      <div key={k} className="rounded-lg bg-muted/70 px-3 py-2">
                        <p className="text-[11px] text-muted-foreground">{k}</p>
                        <p className="text-sm font-semibold text-slate-800">{v}</p>
                      </div>
                    ))}
                  </div>
                )}
                <KeyValueGrid
                  columns={1}
                  items={[
                    ...(c.clinicalNotes ? [{ label: 'Clinical notes', value: <span className="font-normal">{c.clinicalNotes}</span> }] : []),
                    ...(c.observations ? [{ label: 'Observations', value: <span className="font-normal">{c.observations}</span> }] : []),
                    ...(c.advice ? [{ label: 'Advice', value: <span className="font-normal">{c.advice}</span> }] : []),
                    ...(c.followUpDate
                      ? [
                          {
                            label: 'Follow-up',
                            value: `${formatDate(c.followUpDate)}${c.followUpNotes ? ` — ${c.followUpNotes}` : ''}`,
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No consultation notes were recorded for this visit.</p>
            )}
          </Panel>
          <div className="rounded-xl border bg-card p-5 shadow-xs">
            <PatientSnapshot patient={detail.patient} />
          </div>
        </div>
        <div className="min-w-0">
          {detail.prescription ? (
            <PrescriptionView prescription={detail.prescription} />
          ) : (
            <Panel>
              <EmptyState
                icon={FileText}
                title="No prescription issued"
                description="If the patient needs medicines, issue a prescription linked to this visit."
                action={
                  <Button onClick={() => setCreateOpen(true)}>
                    <FileText /> Create prescription
                  </Button>
                }
              />
            </Panel>
          )}
        </div>
      </div>
      <CreatePrescriptionDialog detail={detail} open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export default function ConsultationPage() {
  const { appointmentId } = useParams();
  const [params] = useSearchParams();
  const id = Number(appointmentId);
  const { data: detail, isLoading, isError, error, refetch } = useAppointmentDetail(Number.isFinite(id) ? id : null);

  if (isLoading) return <PageSkeleton stats={0} />;
  if (isError || !detail) return <ErrorState error={error ?? new Error('Appointment not found.')} retry={() => void refetch()} />;

  switch (detail.status) {
    case 'in_progress':
      return <ConsultationWorkspace key={detail.id} detail={detail} />;
    case 'completed':
      return <CompletedView detail={detail} autoPrescribe={params.get('prescribe') === '1'} />;
    case 'cancelled':
      return (
        <div className="space-y-6">
          <ConsultationHeader detail={detail} />
          <Panel>
            <EmptyState
              icon={CalendarX2}
              title="This appointment was cancelled"
              description={detail.cancelReason ?? 'There is nothing to record for a cancelled visit.'}
              action={
                <Button variant="outline" asChild>
                  <Link to="/doctor/appointments">Back to appointments</Link>
                </Button>
              }
            />
          </Panel>
        </div>
      );
    default:
      return <PreStart detail={detail} />;
  }
}
