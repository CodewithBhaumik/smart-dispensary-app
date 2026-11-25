import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CalendarPlus,
  Check,
  CheckCircle2,
  Clock,
  ListChecks,
  Loader2,
  MapPin,
  Stethoscope,
  UserRoundSearch,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { APPOINTMENT_MODE_LABELS, APPOINTMENT_REASONS, type AppointmentMode } from '@shared/constants';
import type { Appointment, DoctorListItem } from '@shared/types';
import { EmptyState, ErrorState, FilterChips, PageHeader, SearchInput, ToneBadge, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, getErrorMessage } from '@/lib/api';
import { formatDateLong, formatDayLabel, formatTime, formatTimeRange } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDoctorAvailability, useDoctors, useDoctorSlots } from '../doctors/api';
import { availabilityLine } from '../doctors/components/DoctorCard';
import { useBookAppointment } from './api';
import { AppointmentPass } from './components/AppointmentPassDialog';
import { DateStrip } from './components/DateStrip';
import { SlotGrid } from './components/SlotGrid';
import { downloadAppointmentIcs } from './ics';

type Step = 1 | 2 | 3;
const STEPS: { step: Step; label: string; icon: typeof Stethoscope }[] = [
  { step: 1, label: 'Doctor', icon: Stethoscope },
  { step: 2, label: 'Date & time', icon: Clock },
  { step: 3, label: 'Details', icon: ListChecks },
];

function Stepper({ step, maxReached, onStep }: { step: Step; maxReached: Step; onStep: (s: Step) => void }) {
  return (
    <ol className="flex items-center gap-2 rounded-xl border bg-card p-2 shadow-xs">
      {STEPS.map((s, i) => {
        const done = s.step < step;
        const active = s.step === step;
        const reachable = s.step <= maxReached;
        return (
          <li key={s.step} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onStep(s.step)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                active ? 'bg-teal-50' : reachable ? 'hover:bg-muted' : 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  done ? 'bg-emerald-500 text-white' : active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : s.step}
              </span>
              <span className="hidden min-w-0 sm:block">
                <span className="block text-[11px] font-medium text-muted-foreground uppercase">Step {s.step}</span>
                <span className={cn('block truncate text-sm font-semibold', active || done ? 'text-slate-900' : 'text-slate-400')}>
                  {s.label}
                </span>
              </span>
              <span className={cn('text-sm font-semibold sm:hidden', active ? 'text-slate-900' : 'text-slate-400')}>{s.label}</span>
            </button>
            {i < STEPS.length - 1 && <span className="hidden h-px w-6 shrink-0 bg-border md:block" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

function DoctorPicker({
  doctors,
  loading,
  selectedId,
  onSelect,
}: {
  doctors: DoctorListItem[] | undefined;
  loading: boolean;
  selectedId: number | null;
  onSelect: (d: DoctorListItem) => void;
}) {
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState('all');
  const specialties = useMemo(
    () => [...new Set((doctors ?? []).map((d) => d.specialty))].sort((a, b) => a.localeCompare(b)),
    [doctors],
  );
  const filtered = (doctors ?? []).filter((d) => {
    const q = search.trim().toLowerCase();
    const matches =
      !q || d.name.toLowerCase().includes(q) || d.specialty.toLowerCase().includes(q) || d.qualifications.toLowerCase().includes(q);
    return matches && (specialty === 'all' || d.specialty === specialty);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by name or specialty" className="sm:w-full" />
        <FilterChips
          value={specialty}
          onChange={setSpecialty}
          options={[{ value: 'all', label: 'All' }, ...specialties.map((s) => ({ value: s, label: s }))]}
        />
      </div>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState compact icon={UserRoundSearch} title="No doctors match your search" description="Try another name or specialty." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Choose a doctor">
          {filtered.map((d) => {
            const selected = d.id === selectedId;
            const line = availabilityLine(d);
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!d.isAccepting}
                onClick={() => onSelect(d)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border bg-card p-3.5 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                  selected
                    ? 'border-primary bg-teal-50/40 ring-1 ring-primary'
                    : d.isAccepting
                      ? 'hover:border-teal-300 hover:shadow-sm'
                      : 'cursor-not-allowed opacity-60',
                )}
              >
                <UserAvatar user={d} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-slate-900">{d.name}</span>
                    {d.isVisiting && (
                      <span className="rounded bg-violet-50 px-1.5 py-px text-[10px] font-semibold text-violet-700 uppercase">
                        Visiting
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {d.specialty} · {d.qualifications}
                  </span>
                  <span className={cn('mt-1.5 flex items-center gap-1.5 text-xs font-medium', line.className)}>
                    <span className={cn('size-1.5 rounded-full', line.dot)} />
                    {line.text}
                  </span>
                </span>
                <span
                  className={cn(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                    selected ? 'border-primary bg-primary text-white' : 'border-slate-300',
                  )}
                >
                  {selected && <Check className="size-3" strokeWidth={3} />}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SuccessView({ appointment, onAnother }: { appointment: Appointment; onAnother: () => void }) {
  return (
    <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6 rounded-2xl border bg-card p-6 shadow-xs sm:p-8">
        <div className="flex items-center gap-4">
          <span className="relative flex size-14 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-200 opacity-40" />
            <span className="relative flex size-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_10px_24px_-10px_rgb(16_185_129/0.9)]">
              <CheckCircle2 className="size-7" />
            </span>
          </span>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Appointment confirmed</h2>
            <p className="text-sm text-muted-foreground">
              Reference <span className="font-mono font-semibold tracking-wider text-slate-700">{appointment.code}</span> ·
              confirmation sent to your notifications
            </p>
          </div>
        </div>
        <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-2">
          <div className="flex items-center gap-3 sm:col-span-2">
            <UserAvatar user={appointment.doctor} size="md" />
            <div>
              <p className="font-semibold text-slate-900">{appointment.doctor.name}</p>
              <p className="text-xs text-muted-foreground">{appointment.doctor.specialty}</p>
            </div>
          </div>
          <SummaryLine icon={CalendarCheck2} label="Date" value={formatDateLong(appointment.date)} />
          <SummaryLine icon={Clock} label="Time" value={formatTimeRange(appointment.startTime, appointment.endTime)} />
          <SummaryLine
            icon={appointment.mode === 'video' ? Video : MapPin}
            label={appointment.mode === 'video' ? 'Mode' : 'Where'}
            value={appointment.mode === 'video' ? 'Video consultation' : `Health Centre · ${appointment.doctor.room ?? 'OPD'}`}
          />
          <SummaryLine icon={ListChecks} label="Reason" value={appointment.reason} />
        </div>
        <ul className="space-y-2 text-sm text-slate-600">
          {appointment.mode === 'video' ? (
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Open My appointments at your slot time and tap
              “Join call”, or wait for the doctor to call you.
            </li>
          ) : (
            <li className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> Show your pass at the health-centre reception
              to check in and receive a queue token.
            </li>
          )}
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> You can reschedule or cancel anytime before the
            visit from My appointments.
          </li>
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/student/appointments?open=${appointment.id}`}>
              View my appointments <ArrowRight />
            </Link>
          </Button>
          <Button variant="outline" onClick={() => downloadAppointmentIcs(appointment)}>
            <CalendarPlus /> Add to calendar
          </Button>
          <Button variant="ghost" onClick={onAnother}>
            Book another
          </Button>
        </div>
      </div>
      <AppointmentPass appointment={appointment} />
    </div>
  );
}

function SummaryLine({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-white text-slate-500 ring-1 ring-border">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground uppercase">{label}</p>
        <p className="text-sm font-medium break-words text-slate-800">{value}</p>
      </div>
    </div>
  );
}

export default function BookAppointmentPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const doctors = useDoctors();
  const book = useBookAppointment();

  const initialDoctorId = params.get('doctorId') ? Number(params.get('doctorId')) : null;
  const [doctorId, setDoctorId] = useState<number | null>(initialDoctorId);
  const [step, setStep] = useState<Step>(initialDoctorId ? 2 : 1);
  const [date, setDate] = useState<string | null>(params.get('date'));
  const [time, setTime] = useState<string | null>(null);
  const [mode, setMode] = useState<AppointmentMode>('in_person');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [booked, setBooked] = useState<Appointment | null>(null);

  const doctor = doctors.data?.find((d) => d.id === doctorId) ?? null;
  const availability = useDoctorAvailability(doctorId);
  const slots = useDoctorSlots(doctorId, date);
  const maxReached: Step = !doctorId ? 1 : !date || !time ? 2 : 3;

  // Default the consultation mode to one the doctor offers.
  useEffect(() => {
    if (doctor && !doctor.consultationModes.includes(mode)) setMode(doctor.consultationModes[0] ?? 'in_person');
  }, [doctor, mode]);

  // Pick a sensible default date once availability loads.
  useEffect(() => {
    const days = availability.data;
    if (!days) return;
    const current = date ? days.find((d) => d.date === date) : null;
    if (current && current.freeSlots > 0 && !current.onLeave) return;
    const first = days.find((d) => d.freeSlots > 0 && !d.onLeave);
    setDate(first?.date ?? null);
    setTime(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availability.data]);

  // Drop a selected time that is no longer free.
  useEffect(() => {
    if (time && slots.data && !slots.data.some((s) => s.time === time && s.available)) setTime(null);
  }, [slots.data, time]);

  const chooseDoctor = (d: DoctorListItem) => {
    setDoctorId(d.id);
    setDate(null);
    setTime(null);
    setMode(d.consultationModes.includes('in_person') ? 'in_person' : (d.consultationModes[0] ?? 'in_person'));
    const next = new URLSearchParams(params);
    next.set('doctorId', String(d.id));
    next.delete('date');
    setParams(next, { replace: true });
    setStep(2);
  };

  const reset = () => {
    setBooked(null);
    setDoctorId(null);
    setDate(null);
    setTime(null);
    setReason('');
    setNotes('');
    setStep(1);
    setParams(new URLSearchParams(), { replace: true });
  };

  const submit = async () => {
    if (!doctorId || !date || !time || !reason) return;
    try {
      const appointment = await book.mutateAsync({
        doctorId,
        date,
        startTime: time,
        mode,
        reason,
        notes: notes.trim() || null,
      });
      setBooked(appointment);
      toast.success('Appointment confirmed', {
        description: `${formatDayLabel(appointment.date)}, ${formatTime(appointment.startTime)} with ${appointment.doctor.name}`,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast.error(getErrorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        setTime(null);
        setStep(2);
        void slots.refetch();
        void availability.refetch();
      }
    }
  };

  if (booked) {
    return (
      <>
        <PageHeader title="You're booked in" description="Here is your appointment pass — it's also saved under My appointments." />
        <SuccessView appointment={booked} onAnother={reset} />
      </>
    );
  }

  const canContinue = step === 1 ? Boolean(doctor) : step === 2 ? Boolean(date && time) : Boolean(reason);
  const continueLabel = step === 3 ? 'Confirm appointment' : 'Continue';

  return (
    <>
      <PageHeader
        title="Book an appointment"
        description="Choose a doctor, pick a time that suits you and confirm — you'll get a check-in pass instantly."
        back={{ to: '/student/appointments', label: 'My appointments' }}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <Stepper step={step} maxReached={maxReached} onStep={setStep} />

          <section className="rounded-xl border bg-card p-5 shadow-xs sm:p-6">
            {step === 1 && (
              <>
                <h2 className="mb-1 text-lg font-semibold text-slate-900">Who would you like to see?</h2>
                <p className="mb-5 text-sm text-muted-foreground">
                  Medical officers handle most concerns; visiting specialists consult on set days.
                </p>
                {doctors.isError ? (
                  <ErrorState error={doctors.error} retry={() => doctors.refetch()} />
                ) : (
                  <DoctorPicker doctors={doctors.data} loading={doctors.isLoading} selectedId={doctorId} onSelect={chooseDoctor} />
                )}
              </>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Pick a date & time</h2>
                    <p className="text-sm text-muted-foreground">
                      Showing the next 14 days of {doctor ? `${doctor.name}'s` : 'the'} OPD schedule.
                    </p>
                  </div>
                  {doctor && (
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pr-3 pl-1.5 text-left transition-colors hover:bg-muted"
                    >
                      <UserAvatar user={doctor} size="sm" />
                      <span className="text-xs">
                        <span className="block font-semibold text-slate-900">{doctor.name}</span>
                        <span className="text-primary">Change doctor</span>
                      </span>
                    </button>
                  )}
                </div>
                {doctor && !doctor.isAccepting && (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {doctor.name} is not accepting new appointments right now. Please choose another doctor.
                  </p>
                )}
                <div className="space-y-2.5">
                  <p className="text-[13px] font-semibold text-slate-700">Date</p>
                  {availability.isError ? (
                    <ErrorState error={availability.error} retry={() => availability.refetch()} />
                  ) : (
                    <DateStrip
                      days={availability.data}
                      loading={availability.isLoading}
                      value={date}
                      onChange={(d) => {
                        setDate(d);
                        setTime(null);
                      }}
                    />
                  )}
                </div>
                <div className="space-y-2.5">
                  <p className="text-[13px] font-semibold text-slate-700">
                    Time {date && <span className="font-normal text-muted-foreground">· {formatDateLong(date)}</span>}
                  </p>
                  {date ? (
                    slots.isError ? (
                      <ErrorState error={slots.error} retry={() => slots.refetch()} />
                    ) : (
                      <SlotGrid slots={slots.data} loading={slots.isLoading} value={time} onChange={setTime} />
                    )
                  ) : availability.data ? (
                    <p className="text-sm text-muted-foreground">No free slots in the next 14 days. Try another doctor.</p>
                  ) : null}
                </div>
              </div>
            )}

            {step === 3 && doctor && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">A few details</h2>
                  <p className="text-sm text-muted-foreground">This helps the doctor prepare for your visit.</p>
                </div>
                <div className="space-y-2.5">
                  <Label className="text-[13px] font-semibold text-slate-700">Consultation type</Label>
                  <RadioGroup
                    value={mode}
                    onValueChange={(v) => setMode(v as AppointmentMode)}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    {(['in_person', 'video'] as AppointmentMode[]).map((m) => {
                      const offered = doctor.consultationModes.includes(m);
                      const Icon = m === 'video' ? Video : Building2;
                      return (
                        <label
                          key={m}
                          htmlFor={`mode-${m}`}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all',
                            mode === m ? 'border-primary bg-teal-50/40 ring-1 ring-primary' : 'hover:border-slate-300',
                            !offered && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <RadioGroupItem id={`mode-${m}`} value={m} disabled={!offered} className="mt-0.5" />
                          <span className="flex-1">
                            <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              <Icon className="size-4 text-slate-500" />
                              {APPOINTMENT_MODE_LABELS[m]}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {!offered
                                ? 'Not offered by this doctor'
                                : m === 'video'
                                  ? 'Consult from your room over a secure in-app video call.'
                                  : `Visit the health centre · ${doctor.room ?? 'OPD'}`}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </RadioGroup>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reason" className="text-[13px] font-semibold text-slate-700">
                    Reason for visit <span className="text-rose-500">*</span>
                  </Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger id="reason" className="w-full sm:w-96">
                      <SelectValue placeholder="Select the main reason" />
                    </SelectTrigger>
                    <SelectContent>
                      {APPOINTMENT_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="notes" className="text-[13px] font-semibold text-slate-700">
                      Notes for the doctor <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <span className="text-xs text-muted-foreground tabular-nums">{notes.length}/500</span>
                  </div>
                  <Textarea
                    id="notes"
                    rows={4}
                    maxLength={500}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Symptoms, since when, anything you've already taken…"
                  />
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
              <Button variant="ghost" onClick={() => (step === 1 ? navigate(-1) : setStep((step - 1) as Step))}>
                <ArrowLeft /> {step === 1 ? 'Cancel' : 'Back'}
              </Button>
              <Button
                onClick={() => (step === 3 ? submit() : setStep((step + 1) as Step))}
                disabled={!canContinue || book.isPending || (step === 1 && doctor !== null && !doctor.isAccepting)}
              >
                {book.isPending && <Loader2 className="animate-spin" />}
                {continueLabel}
                {step < 3 && <ArrowRight />}
              </Button>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
            <div className="border-b bg-muted/40 px-5 py-3.5">
              <p className="font-display text-sm font-semibold text-slate-900">Appointment summary</p>
            </div>
            <div className="space-y-4 p-5">
              {doctor ? (
                <div className="flex items-center gap-3">
                  <UserAvatar user={doctor} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{doctor.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{doctor.specialty}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a doctor to begin.</p>
              )}
              <dl className="space-y-3 text-sm">
                <SummaryRow label="Date" value={date ? formatDateLong(date) : null} />
                <SummaryRow
                  label="Time"
                  value={
                    time && slots.data
                      ? formatTimeRange(time, slots.data.find((s) => s.time === time)?.endTime ?? time)
                      : null
                  }
                />
                <SummaryRow
                  label="Type"
                  value={
                    doctor ? (
                      <ToneBadge tone={mode === 'video' ? 'violet' : 'slate'} icon={mode === 'video' ? <Video /> : <Building2 />}>
                        {APPOINTMENT_MODE_LABELS[mode]}
                      </ToneBadge>
                    ) : null
                  }
                />
                <SummaryRow label="Reason" value={reason || null} />
              </dl>
              <Button
                className="w-full"
                size="lg"
                disabled={!doctorId || !date || !time || !reason || book.isPending}
                onClick={() => (reason ? submit() : setStep(3))}
              >
                {book.isPending ? <Loader2 className="animate-spin" /> : <CalendarCheck2 />}
                Confirm appointment
              </Button>
              {!reason && date && time && (
                <p className="text-center text-xs text-muted-foreground">Add a reason for the visit to confirm.</p>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-dashed bg-card/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Free for students. You can reschedule or cancel any time before the visit. For emergencies use the{' '}
            <Link to="/student/emergency" className="font-medium text-rose-600 hover:underline">
              Emergency
            </Link>{' '}
            page instead of booking.
          </div>
        </aside>
      </div>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right font-medium', value ? 'text-slate-900' : 'text-slate-300')}>{value ?? '—'}</dd>
    </div>
  );
}
