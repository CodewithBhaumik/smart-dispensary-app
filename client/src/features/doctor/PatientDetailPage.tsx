import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  CalendarDays,
  Droplets,
  ExternalLink,
  FileHeart,
  FileText,
  Home,
  Mail,
  MessageSquare,
  Phone,
  Pill,
  UserRound,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { RECORD_CATEGORY_LABELS } from '@shared/constants';
import type { Consultation, MedicalRecord, Prescription } from '@shared/types';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, Panel, StatusBadge, ToneBadge, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCall } from '@/features/calls/CallProvider';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage, openProtectedFile } from '@/lib/api';
import { formatDate, formatFileSize, formatTime } from '@/lib/format';
import { usePatientDetail, useStartConversation } from './api';
import { AllergyAlert, ChipList, DateBlock, ModeBadge, SectionLabel } from './components/clinic-bits';
import { PrescriptionDialog } from './components/PrescriptionDialog';

function RecordRow({ record }: { record: MedicalRecord }) {
  const [opening, setOpening] = useState(false);
  const open = async () => {
    setOpening(true);
    try {
      await openProtectedFile(`/records/${record.id}/file`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setOpening(false);
    }
  };
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
        <FileHeart className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{record.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {RECORD_CATEGORY_LABELS[record.category]} · {formatDate(record.recordDate)}
          {record.doctor ? ` · ${record.doctor.name}` : ''}
          {record.file ? ` · ${formatFileSize(record.file.size)}` : ''}
        </p>
      </div>
      <ToneBadge tone={record.source === 'consultation' ? 'teal' : 'slate'}>{record.source === 'consultation' ? 'Visit summary' : 'Uploaded'}</ToneBadge>
      {record.file && (
        <Button variant="outline" size="xs" onClick={() => void open()} disabled={opening} aria-label={`Open ${record.title}`}>
          <ExternalLink /> View
        </Button>
      )}
    </li>
  );
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const patientId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startCall } = useCall();
  const { data, isLoading, isError, error, refetch } = usePatientDetail(Number.isFinite(patientId) ? patientId : null);
  const startConversation = useStartConversation();
  const [rx, setRx] = useState<Prescription | null>(null);

  const consultationsByAppt = useMemo(() => {
    const map = new Map<number, Consultation>();
    for (const c of data?.consultations ?? []) map.set(c.appointmentId, c);
    return map;
  }, [data]);

  const visits = useMemo(
    () => [...(data?.appointments ?? [])].sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`)),
    [data],
  );

  if (isLoading) return <PageSkeleton stats={0} />;
  if (isError || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const p = data.patient;

  const message = async () => {
    try {
      const convo = await startConversation.mutateAsync(p.id);
      navigate(`/doctor/messages?c=${convo.id}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader back={{ to: '/doctor/patients', label: 'Patients' }} title="Patient record" />

      <div className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <UserAvatar user={p} size="xl" />
            <div className="min-w-0 space-y-1">
              <h2 className="truncate font-display text-2xl font-semibold text-slate-900">{p.name}</h2>
              <p className="text-sm text-muted-foreground">
                {p.rollNo} · {p.program} {p.department} · Year {p.year}
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[13px] text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="size-3.5 text-slate-400" />
                  {[p.age ? `${p.age} yrs` : null, p.gender].filter(Boolean).join(' · ') || '—'}
                </span>
                {p.bloodGroup && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-rose-700">
                    <Droplets className="size-3.5" /> {p.bloodGroup}
                  </span>
                )}
                {p.hostel && (
                  <span className="inline-flex items-center gap-1.5">
                    <Home className="size-3.5 text-slate-400" /> {p.hostel}
                    {p.room ? `, Room ${p.room}` : ''}
                  </span>
                )}
                {p.phone && (
                  <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                    <Phone className="size-3.5 text-slate-400" /> {p.phone}
                  </a>
                )}
                <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 hover:text-primary">
                  <Mail className="size-3.5 text-slate-400" /> {p.email}
                </a>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" onClick={() => void message()} disabled={startConversation.isPending}>
              <MessageSquare /> Message
            </Button>
            <Button onClick={() => startCall(p)}>
              <Video /> Video call
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <Tabs defaultValue="visits" className="gap-4">
            <TabsList className="scrollbar-none max-w-full justify-start overflow-x-auto bg-slate-200/60">
              <TabsTrigger value="visits" className="px-3">
                <CalendarDays /> Visits ({visits.length})
              </TabsTrigger>
              <TabsTrigger value="prescriptions" className="px-3">
                <FileText /> Prescriptions ({data.prescriptions.length})
              </TabsTrigger>
              <TabsTrigger value="records" className="px-3">
                <FileHeart /> Records ({data.records.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="visits">
              <Panel padded={false}>
                {visits.length === 0 ? (
                  <EmptyState icon={CalendarDays} title="No visits yet" description="Appointments with this student will appear here." />
                ) : (
                  <ul className="divide-y">
                    {visits.map((a) => {
                      const c = consultationsByAppt.get(a.id);
                      const mine = a.doctor.id === user.id;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            disabled={!mine}
                            onClick={() => navigate(`/doctor/appointments?open=${a.id}`)}
                            className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors enabled:hover:bg-muted/40 disabled:cursor-default"
                          >
                            <DateBlock date={a.date} />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-slate-900">{c?.diagnosis ?? a.reason}</p>
                                <StatusBadge kind="appointment" status={a.status} />
                                <ModeBadge mode={a.mode} />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {formatTime(a.startTime)} · {mine ? 'You' : a.doctor.name} · {a.doctor.specialty}
                                {c?.diagnosis ? ` · Reason: ${a.reason}` : ''}
                              </p>
                              {c && c.symptoms.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {c.symptoms.slice(0, 6).map((s) => (
                                    <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {c?.advice && <p className="line-clamp-2 text-[13px] text-slate-600">{c.advice}</p>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="prescriptions">
              <Panel padded={false}>
                {data.prescriptions.length === 0 ? (
                  <EmptyState icon={FileText} title="No prescriptions" description="Prescriptions issued to this student appear here." />
                ) : (
                  <ul className="divide-y">
                    {data.prescriptions.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setRx(item)}
                          className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                            <Pill className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {item.diagnosis ?? 'Prescription'} <span className="font-mono text-xs text-muted-foreground">· {item.code}</span>
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {formatDate(item.createdAt)} · {item.doctor.name} · {item.items.map((i) => i.medicineName).join(', ')}
                            </p>
                          </div>
                          {item.latestRequest && <StatusBadge kind="request" status={item.latestRequest.status} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </TabsContent>

            <TabsContent value="records">
              <Panel padded={false}>
                {data.records.length === 0 ? (
                  <EmptyState icon={FileHeart} title="No medical records" description="Visit summaries and documents uploaded by the student appear here." />
                ) : (
                  <ul className="divide-y">
                    {data.records.map((r) => (
                      <RecordRow key={r.id} record={r} />
                    ))}
                  </ul>
                )}
              </Panel>
            </TabsContent>
          </Tabs>
        </div>

        <div className="min-w-0 space-y-6">
          <Panel title="Medical summary">
            <div className="space-y-4">
              <AllergyAlert allergies={p.allergies} />
              <div className="space-y-1.5">
                <SectionLabel>Conditions</SectionLabel>
                <ChipList items={p.conditions} tone="amber" />
              </div>
              <div className="space-y-1.5">
                <SectionLabel>Current medication</SectionLabel>
                <ChipList items={p.medications} tone="blue" />
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3 text-[13px]">
                <div>
                  <p className="text-[11px] text-muted-foreground">Height</p>
                  <p className="font-medium text-slate-800">{p.heightCm ? `${p.heightCm} cm` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Weight</p>
                  <p className="font-medium text-slate-800">{p.weightKg ? `${p.weightKg} kg` : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Total visits</p>
                  <p className="font-medium text-slate-800 tabular-nums">{p.totalVisits}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Last visit</p>
                  <p className="font-medium text-slate-800">{p.lastVisit ? formatDate(p.lastVisit) : '—'}</p>
                </div>
              </div>
            </div>
          </Panel>
          <Panel title="Emergency contact">
            {p.emergencyContactName ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-slate-900">
                  {p.emergencyContactName}
                  {p.emergencyContactRelation ? <span className="font-normal text-muted-foreground"> · {p.emergencyContactRelation}</span> : null}
                </p>
                {p.emergencyContactPhone && (
                  <a href={`tel:${p.emergencyContactPhone}`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-primary">
                    <Phone className="size-3.5 text-slate-400" /> {p.emergencyContactPhone}
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not provided by the student.</p>
            )}
          </Panel>
        </div>
      </div>

      <PrescriptionDialog prescription={rx} open={rx !== null} onOpenChange={(o) => !o && setRx(null)} />
    </div>
  );
}
