import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileText,
  HeartPulse,
  History,
  Loader2,
  Save,
  ShieldAlert,
  Stethoscope,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { COMMON_SYMPTOMS } from '@shared/constants';
import type { AppointmentDetail, Vitals } from '@shared/types';
import { ConfirmDialog, Field, Panel, TagInput } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCall } from '@/features/calls/CallProvider';
import { usePatientDetail } from '@/features/doctor/api';
import { PatientSnapshot } from '@/features/doctor/components/PatientSnapshot';
import { getErrorMessage } from '@/lib/api';
import { formatClock, formatDate, toDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCompleteConsultation, useFormulary, useSaveDraft, type ConsultationInput } from './api';
import { ConsultationHeader } from './ConsultationHeader';
import { PrescriptionBuilder, toItemInput, validateItems, type DraftItem, type ItemErrors } from './PrescriptionBuilder';
import { allergyConflicts, frequencyLabel } from './rx-utils';

interface FormState {
  symptoms: string[];
  vitals: Vitals;
  clinicalNotes: string;
  observations: string;
  diagnosis: string;
  advice: string;
  followUp: boolean;
  followUpDate: string;
  followUpNotes: string;
}

const AUTOSAVE_MS = 20_000;
const draftKey = (id: number) => `sd.rxdraft.${id}`;

function loadRxDraft(id: number): { items: DraftItem[]; notes: string } {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return { items: [], notes: '' };
    const parsed = JSON.parse(raw) as { items?: DraftItem[]; notes?: string };
    return { items: Array.isArray(parsed.items) ? parsed.items : [], notes: parsed.notes ?? '' };
  } catch {
    return { items: [], notes: '' };
  }
}

function saveRxDraft(id: number, items: DraftItem[], notes: string) {
  try {
    if (items.length === 0 && !notes) localStorage.removeItem(draftKey(id));
    else localStorage.setItem(draftKey(id), JSON.stringify({ items, notes }));
  } catch {
    /* storage unavailable */
  }
}

function clearRxDraft(id: number) {
  try {
    localStorage.removeItem(draftKey(id));
  } catch {
    /* storage unavailable */
  }
}

function initialForm(detail: AppointmentDetail): FormState {
  const c = detail.consultation;
  return {
    symptoms: c?.symptoms ?? [],
    vitals: c?.vitals ?? {},
    clinicalNotes: c?.clinicalNotes ?? '',
    observations: c?.observations ?? '',
    diagnosis: c?.diagnosis ?? '',
    advice: c?.advice ?? '',
    followUp: Boolean(c?.followUpDate),
    followUpDate: c?.followUpDate ?? '',
    followUpNotes: c?.followUpNotes ?? '',
  };
}

function toInput(f: FormState): ConsultationInput {
  const vitals: Vitals = {};
  for (const [k, v] of Object.entries(f.vitals) as [keyof Vitals, string | undefined][]) {
    if (v && v.trim()) vitals[k] = v.trim();
  }
  const text = (s: string) => (s.trim() ? s.trim() : null);
  return {
    symptoms: f.symptoms,
    vitals,
    clinicalNotes: text(f.clinicalNotes),
    observations: text(f.observations),
    diagnosis: text(f.diagnosis),
    advice: text(f.advice),
    followUpDate: f.followUp && f.followUpDate ? f.followUpDate : null,
    followUpNotes: f.followUp ? text(f.followUpNotes) : null,
  };
}

const VITALS: { key: keyof Vitals; label: string; unit: string; placeholder: string }[] = [
  { key: 'temperature', label: 'Temperature', unit: '°F', placeholder: '98.6' },
  { key: 'bloodPressure', label: 'Blood pressure', unit: 'mmHg', placeholder: '120/80' },
  { key: 'pulse', label: 'Pulse', unit: 'bpm', placeholder: '76' },
  { key: 'spo2', label: 'SpO₂', unit: '%', placeholder: '98' },
  { key: 'weight', label: 'Weight', unit: 'kg', placeholder: '64' },
];

function SectionCard({
  icon,
  title,
  description,
  children,
  aside,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 [&_svg]:size-4">{icon}</span>
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        {aside}
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function PastVisits({ studentId, currentId }: { studentId: number; currentId: number }) {
  const { data, isLoading } = usePatientDetail(studentId);
  const visits = useMemo(
    () =>
      (data?.consultations ?? [])
        .filter((c) => c.appointmentId !== currentId && c.status === 'completed')
        .sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt))
        .slice(0, 5),
    [data, currentId],
  );
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <History className="size-3.5" /> Previous visits
      </p>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : visits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No earlier consultations on record.</p>
      ) : (
        <ol className="space-y-2">
          {visits.map((v) => (
            <li key={v.id} className="rounded-lg border bg-white px-3 py-2">
              <p className="truncate text-[13px] font-medium text-slate-900">{v.diagnosis ?? 'Consultation'}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {formatDate(v.completedAt ?? v.createdAt)} · {v.doctor.name}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** In-progress consultation: notes, vitals, diagnosis and prescription in one workspace. */
export function ConsultationWorkspace({ detail }: { detail: AppointmentDetail }) {
  const navigate = useNavigate();
  const { startCall } = useCall();
  const formulary = useFormulary();
  const saveDraft = useSaveDraft(detail.id);
  const complete = useCompleteConsultation(detail.id);

  const [form, setForm] = useState<FormState>(() => initialForm(detail));
  const [items, setItems] = useState<DraftItem[]>(() => loadRxDraft(detail.id).items);
  const [rxNotes, setRxNotes] = useState(() => loadRxDraft(detail.id).notes);
  const [errors, setErrors] = useState<Partial<Record<'diagnosis' | 'assessment', string>>>({});
  const [itemErrors, setItemErrors] = useState<Record<string, ItemErrors>>({});
  const [savedAt, setSavedAt] = useState<string | null>(detail.consultation?.updatedAt ?? null);
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;

  const allergies = detail.patient.allergies;

  const patch = (p: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
  };

  // Persist the prescription draft locally so a refresh never loses it.
  useEffect(() => saveRxDraft(detail.id, items, rxNotes), [detail.id, items, rxNotes]);

  const persist = useCallback(
    async (silent: boolean) => {
      try {
        const c = await saveDraft.mutateAsync(toInput(formRef.current));
        setSavedAt(c.updatedAt ?? new Date().toISOString());
        setDirty(false);
        if (!silent) toast.success('Draft saved');
      } catch (e) {
        if (!silent) toast.error(getErrorMessage(e));
      }
    },
    [saveDraft],
  );

  // Autosave 20 s after the last change.
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => void persist(true), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [dirty, form, persist]);

  const conflicts = useMemo(
    () =>
      items
        .map((i) => ({ item: i, hits: allergyConflicts({ name: i.medicineName, genericName: i.genericName }, allergies) }))
        .filter((x) => x.hits.length > 0),
    [items, allergies],
  );

  const validate = (): boolean => {
    const next: typeof errors = {};
    if (!form.diagnosis.trim()) next.diagnosis = 'Enter the diagnosis or working impression.';
    if (form.symptoms.length === 0 && !form.clinicalNotes.trim()) next.assessment = 'Add at least one symptom or clinical notes.';
    const ie = validateItems(items);
    setErrors(next);
    setItemErrors(ie);
    if (Object.keys(next).length || Object.keys(ie).length) {
      toast.error('Please complete the highlighted fields before finishing.');
      return false;
    }
    return true;
  };

  const finish = async () => {
    try {
      const result = await complete.mutateAsync({
        consultation: toInput(form),
        prescription: items.length ? { notes: rxNotes.trim() || null, items: items.map(toItemInput) } : null,
      });
      clearRxDraft(detail.id);
      toast.success('Consultation completed', {
        description: result.prescription
          ? `Prescription ${result.prescription.code} issued to ${detail.student.name}.`
          : `${detail.student.name} has been notified.`,
      });
      navigate(`/doctor/appointments?open=${detail.id}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
      throw e;
    }
  };

  const isVideo = detail.mode === 'video';
  const actionButtons = (
    <>
      {isVideo && (
        <Button variant="soft" onClick={() => startCall(detail.student, { appointmentId: detail.id })}>
          <Video /> Video call
        </Button>
      )}
      <Button variant="outline" onClick={() => void persist(false)} disabled={saveDraft.isPending}>
        {saveDraft.isPending ? <Loader2 className="animate-spin" /> : <Save />}
        Save draft
      </Button>
      <Button onClick={() => validate() && setConfirmOpen(true)} disabled={complete.isPending}>
        <CheckCircle2 /> Complete consultation
      </Button>
    </>
  );

  return (
    <div className="space-y-6">
      <ConsultationHeader
        detail={detail}
        actions={actionButtons}
        meta={
          <span className="text-xs text-muted-foreground">
            {saveDraft.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved · ${formatClock(savedAt)}` : 'Not saved yet'}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border bg-card p-5 shadow-xs">
            <PatientSnapshot patient={detail.patient} dense />
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-xs">
            <PastVisits studentId={detail.student.id} currentId={detail.id} />
            <Link to={`/doctor/patients/${detail.student.id}`} className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
              Open full patient record →
            </Link>
          </div>
          {detail.notes && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
              <p className="text-[11px] font-semibold tracking-wider text-blue-700 uppercase">Student&apos;s note</p>
              <p className="mt-1">{detail.notes}</p>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          <SectionCard icon={<HeartPulse />} title="Vitals" description="Optional — record what you measured">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {VITALS.map((v) => (
                <div key={v.key} className="space-y-1.5">
                  <label htmlFor={`vital-${v.key}`} className="text-xs font-medium text-slate-600">
                    {v.label}
                  </label>
                  <div className="relative">
                    <Input
                      id={`vital-${v.key}`}
                      value={form.vitals[v.key] ?? ''}
                      onChange={(e) => patch({ vitals: { ...form.vitals, [v.key]: e.target.value } })}
                      placeholder={v.placeholder}
                      maxLength={20}
                      className={cn(v.unit.length > 3 ? 'pr-14' : 'pr-11', 'placeholder:text-slate-300')}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] text-muted-foreground">
                      {v.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard icon={<Stethoscope />} title="Assessment" description="Symptoms, findings and diagnosis">
            <Field label="Presenting symptoms" error={errors.assessment}>
              <TagInput
                value={form.symptoms}
                onChange={(symptoms) => patch({ symptoms })}
                suggestions={COMMON_SYMPTOMS}
                placeholder="Type a symptom and press Enter"
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Clinical notes" htmlFor="clinical-notes">
                <Textarea
                  id="clinical-notes"
                  value={form.clinicalNotes}
                  onChange={(e) => patch({ clinicalNotes: e.target.value })}
                  rows={4}
                  maxLength={4000}
                  placeholder="History of present illness, duration, relevant context…"
                />
              </Field>
              <Field label="Observations / examination" htmlFor="observations">
                <Textarea
                  id="observations"
                  value={form.observations}
                  onChange={(e) => patch({ observations: e.target.value })}
                  rows={4}
                  maxLength={4000}
                  placeholder="Examination findings…"
                />
              </Field>
            </div>
            <Field label="Diagnosis" htmlFor="diagnosis" required error={errors.diagnosis} hint="Doctor-entered diagnosis or working impression">
              <Input
                id="diagnosis"
                value={form.diagnosis}
                onChange={(e) => patch({ diagnosis: e.target.value })}
                maxLength={300}
                placeholder="e.g. Viral upper respiratory tract infection"
                aria-invalid={Boolean(errors.diagnosis)}
                className="h-10 text-[15px] font-medium"
              />
            </Field>
          </SectionCard>

          <SectionCard icon={<ClipboardList />} title="Plan & advice">
            <Field label="Advice for the student" htmlFor="advice">
              <Textarea
                id="advice"
                value={form.advice}
                onChange={(e) => patch({ advice: e.target.value })}
                rows={3}
                maxLength={4000}
                placeholder="Rest, fluids, warning signs to watch for…"
              />
            </Field>
            <div className="rounded-lg border bg-muted/30 p-4">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <CalendarClock className="size-4 text-slate-500" /> Recommend a follow-up visit
                </span>
                <Switch
                  checked={form.followUp}
                  onCheckedChange={(followUp) =>
                    patch({
                      followUp,
                      followUpDate:
                        followUp && !form.followUpDate
                          ? toDateStr(new Date(Date.now() + 7 * 86_400_000))
                          : form.followUpDate,
                    })
                  }
                  aria-label="Recommend follow-up"
                />
              </label>
              {form.followUp && (
                <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr]">
                  <Field label="Follow-up date" htmlFor="followup-date">
                    <Input
                      id="followup-date"
                      type="date"
                      min={toDateStr(new Date(Date.now() + 86_400_000))}
                      value={form.followUpDate}
                      onChange={(e) => patch({ followUpDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Follow-up notes" htmlFor="followup-notes">
                    <Input
                      id="followup-notes"
                      value={form.followUpNotes}
                      onChange={(e) => patch({ followUpNotes: e.target.value })}
                      maxLength={500}
                      placeholder="e.g. Review if fever persists beyond 3 days"
                    />
                  </Field>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard
            icon={<FileText />}
            title="Prescription"
            description="Medicines from the dispensary formulary"
            aside={
              items.length > 0 ? (
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                  {items.length} {items.length === 1 ? 'medicine' : 'medicines'}
                </span>
              ) : undefined
            }
          >
            {conflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
                <span>
                  <span className="font-semibold">Allergy check:</span> {conflicts.length} medicine
                  {conflicts.length === 1 ? '' : 's'} may conflict with the patient&apos;s allergies ({allergies.join(', ')}).
                </span>
              </div>
            )}
            <PrescriptionBuilder
              items={items}
              onChange={(next) => {
                setItems(next);
                setItemErrors({});
              }}
              medicines={formulary.data ?? []}
              loadingMedicines={formulary.isLoading}
              allergies={allergies}
              errors={itemErrors}
            />
            {items.length > 0 && (
              <Field label="Prescription notes" htmlFor="rx-notes" hint="Optional — printed on the prescription">
                <Textarea id="rx-notes" value={rxNotes} onChange={(e) => setRxNotes(e.target.value)} rows={2} maxLength={1000} />
              </Field>
            )}
          </SectionCard>

          <div className="flex flex-col-reverse gap-2 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Activity className="size-3.5" /> Drafts autosave every 20 seconds. The student is notified when you complete.
            </p>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">{actionButtons}</div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone={conflicts.length ? 'danger' : 'default'}
        title="Complete this consultation?"
        description={`${detail.student.name} will be notified and the visit summary added to their medical record.`}
        confirmLabel={conflicts.length ? 'Complete anyway' : 'Complete consultation'}
        onConfirm={finish}
      >
        <div className="space-y-3 rounded-lg border bg-muted/40 p-3 text-sm">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Diagnosis</p>
            <p className="font-medium text-slate-900">{form.diagnosis || '—'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Prescription</p>
            {items.length === 0 ? (
              <p className="text-slate-600">No medicines — consultation only.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {items.map((i) => (
                  <li key={i.key} className="text-slate-700">
                    <span className="font-medium text-slate-900">{i.medicineName}</span> · {i.dosage} · {frequencyLabel(i.frequency)} ·{' '}
                    {i.durationDays} days
                  </li>
                ))}
              </ul>
            )}
          </div>
          {conflicts.length > 0 && (
            <p className={cn('rounded-md bg-rose-50 px-2.5 py-1.5 text-[13px] font-medium text-rose-700')}>
              Allergy alert: {conflicts.map((c) => c.item.medicineName).join(', ')} may conflict with {allergies.join(', ')}.
            </p>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
