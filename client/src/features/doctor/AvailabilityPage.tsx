import { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarOff, CalendarPlus, Copy, Loader2, Plus, RotateCcw, Save, Timer, Trash2, Video, X } from 'lucide-react';
import { toast } from 'sonner';
import { WEEKDAY_LABELS, type AppointmentMode } from '@shared/constants';
import type { DoctorLeave, ScheduleBlock } from '@shared/types';
import { ConfirmDialog, EmptyState, ErrorState, Field, PageHeader, PageSkeleton, Panel } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/api';
import { formatDateLong, formatTime, toDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAddLeave, useDeleteLeave, useSaveSchedule, useSchedule, useSetAccepting, type ScheduleState } from './api';

/** Monday-first week for clinic planning. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const SLOT_OPTIONS = [10, 15, 20, 30];

interface EditableBlock {
  key: string;
  startTime: string;
  endTime: string;
}

type WeekState = Record<number, EditableBlock[]>;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
let blockSeq = 0;
const newKey = () => `b${++blockSeq}`;

function toWeek(schedule: ScheduleBlock[]): WeekState {
  const week: WeekState = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const b of [...schedule].sort((x, y) => x.startTime.localeCompare(y.startTime))) {
    week[b.weekday].push({ key: newKey(), startTime: b.startTime, endTime: b.endTime });
  }
  return week;
}

function fromWeek(week: WeekState): ScheduleBlock[] {
  return Object.entries(week).flatMap(([day, blocks]) =>
    blocks.map((b) => ({ weekday: Number(day), startTime: b.startTime, endTime: b.endTime })),
  );
}

function dayErrors(blocks: EditableBlock[]): string | null {
  for (const b of blocks) {
    if (!b.startTime || !b.endTime) return 'Every session needs a start and end time.';
    if (toMin(b.startTime) >= toMin(b.endTime)) return 'A session must end after it starts.';
  }
  const sorted = [...blocks].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  for (let i = 1; i < sorted.length; i++) {
    if (toMin(sorted[i].startTime) < toMin(sorted[i - 1].endTime)) return 'Sessions overlap — adjust the times.';
  }
  return null;
}

function slotsFor(blocks: EditableBlock[], slotMinutes: number): number {
  return blocks.reduce((sum, b) => {
    if (!b.startTime || !b.endTime) return sum;
    const span = toMin(b.endTime) - toMin(b.startTime);
    return sum + (span > 0 ? Math.floor(span / slotMinutes) : 0);
  }, 0);
}

const normalize = (s: { slotMinutes: number; modes: AppointmentMode[]; week: WeekState }) =>
  JSON.stringify({
    slotMinutes: s.slotMinutes,
    modes: [...s.modes].sort(),
    schedule: fromWeek(s.week)
      .map((b) => `${b.weekday}-${b.startTime}-${b.endTime}`)
      .sort(),
  });

function AcceptingCard({ value }: { value: boolean }) {
  const setAccepting = useSetAccepting();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? value;
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 rounded-xl border p-5 shadow-xs',
        checked ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white' : 'border-amber-200 bg-gradient-to-br from-amber-50/80 to-white',
      )}
    >
      <div className="space-y-1">
        <p className="font-display text-[15px] font-semibold text-slate-900">{checked ? 'Accepting new appointments' : 'Bookings paused'}</p>
        <p className="text-[13px] text-muted-foreground">
          {checked ? 'Students can book any open slot in your schedule.' : 'Your slots are hidden from students. Existing bookings stay.'}
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={setAccepting.isPending}
        aria-label="Accepting new appointments"
        onCheckedChange={async (next) => {
          setOptimistic(next);
          try {
            await setAccepting.mutateAsync(next);
            toast.success(next ? 'Bookings re-opened' : 'Bookings paused');
          } catch (e) {
            toast.error(getErrorMessage(e));
          } finally {
            setOptimistic(null);
          }
        }}
      />
    </div>
  );
}

function LeavesPanel({ leaves }: { leaves: DoctorLeave[] }) {
  const addLeave = useAddLeave();
  const deleteLeave = useDeleteLeave();
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DoctorLeave | null>(null);
  const today = toDateStr(new Date());
  const upcoming = leaves.filter((l) => l.date >= today).sort((a, b) => a.date.localeCompare(b.date));

  const submit = async () => {
    if (!date) return setError('Pick a date.');
    if (date < today) return setError('Leave must be today or later.');
    setError(null);
    try {
      await addLeave.mutateAsync({ date, reason: reason.trim() || undefined });
      toast.success('Leave added', { description: `${formatDateLong(date)} is now blocked for bookings.` });
      setDate('');
      setReason('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <Panel title="Leave & time off" description="Block whole days. Students can't book you on these dates." icon={CalendarOff}>
      <form
        className="grid gap-3 sm:grid-cols-[170px_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Date" htmlFor="leave-date">
          <Input id="leave-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={Boolean(error)} />
        </Field>
        <Field label={<>Reason <span className="font-normal text-muted-foreground">(optional)</span></>} htmlFor="leave-reason">
          <Input id="leave-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Medical conference" />
        </Field>
        <Button type="submit" disabled={addLeave.isPending}>
          {addLeave.isPending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
          Add leave
        </Button>
      </form>
      {error && <p className="mt-2 text-sm font-medium text-rose-600">{error}</p>}

      <div className="mt-5">
        {upcoming.length === 0 ? (
          <EmptyState compact icon={CalendarOff} title="No upcoming leave" description="You're available on every scheduled day." />
        ) : (
          <ul className="divide-y rounded-lg border">
            {upcoming.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <CalendarOff className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{formatDateLong(l.date)}</p>
                  <p className="truncate text-xs text-muted-foreground">{l.reason ?? 'No reason given'}</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove leave on ${l.date}`} onClick={() => setToDelete(l)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        tone="danger"
        title="Remove this leave?"
        description={toDelete ? `${formatDateLong(toDelete.date)} will open for bookings again.` : undefined}
        confirmLabel="Remove leave"
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await deleteLeave.mutateAsync(toDelete.id);
            toast.success('Leave removed');
          } catch (e) {
            toast.error(getErrorMessage(e));
            throw e;
          }
        }}
      />
    </Panel>
  );
}

function ScheduleEditor({ initial }: { initial: ScheduleState }) {
  const save = useSaveSchedule();
  const [slotMinutes, setSlotMinutes] = useState(initial.slotMinutes);
  const [modes, setModes] = useState<AppointmentMode[]>(initial.consultationModes);
  const [week, setWeek] = useState<WeekState>(() => toWeek(initial.schedule));
  const [baseline, setBaseline] = useState(() =>
    normalize({ slotMinutes: initial.slotMinutes, modes: initial.consultationModes, week: toWeek(initial.schedule) }),
  );

  // Re-sync when the server copy changes (e.g. after save from another tab).
  useEffect(() => {
    const incoming = normalize({ slotMinutes: initial.slotMinutes, modes: initial.consultationModes, week: toWeek(initial.schedule) });
    setBaseline(incoming);
    setSlotMinutes(initial.slotMinutes);
    setModes(initial.consultationModes);
    setWeek(toWeek(initial.schedule));
  }, [initial]);

  const dirty = normalize({ slotMinutes, modes, week }) !== baseline;
  const errors = useMemo(() => Object.fromEntries(WEEK_ORDER.map((d) => [d, dayErrors(week[d])])), [week]);
  const hasErrors = Object.values(errors).some(Boolean) || modes.length === 0;
  const weeklySlots = WEEK_ORDER.reduce((s, d) => s + slotsFor(week[d], slotMinutes), 0);

  const updateBlock = (day: number, key: string, patch: Partial<EditableBlock>) =>
    setWeek((w) => ({ ...w, [day]: w[day].map((b) => (b.key === key ? { ...b, ...patch } : b)) }));
  const addBlock = (day: number) =>
    setWeek((w) => {
      const last = [...w[day]].sort((a, b) => toMin(a.startTime) - toMin(b.startTime)).at(-1);
      // New session starts where the last one ended (or 9 AM) and lasts up to 3 hours.
      const startMin = Math.min(last ? toMin(last.endTime) : 9 * 60, 22 * 60);
      const endMin = Math.min(startMin + 180, 23 * 60 + 30);
      return { ...w, [day]: [...w[day], { key: newKey(), startTime: fromMin(startMin), endTime: fromMin(endMin) }] };
    });
  const removeBlock = (day: number, key: string) => setWeek((w) => ({ ...w, [day]: w[day].filter((b) => b.key !== key) }));
  const copyMonday = () => {
    setWeek((w) => {
      const next = { ...w };
      for (const d of [2, 3, 4, 5]) next[d] = w[1].map((b) => ({ ...b, key: newKey() }));
      return next;
    });
    toast.info("Monday's sessions copied to Tuesday – Friday", { description: 'Review and save to apply.' });
  };
  const discard = () => {
    setSlotMinutes(initial.slotMinutes);
    setModes(initial.consultationModes);
    setWeek(toWeek(initial.schedule));
  };

  const submit = async () => {
    if (hasErrors) {
      toast.error(modes.length === 0 ? 'Offer at least one consultation mode.' : 'Fix the highlighted sessions first.');
      return;
    }
    try {
      await save.mutateAsync({ slotMinutes, consultationModes: modes, schedule: fromWeek(week) });
      toast.success('Availability saved', { description: 'Students now see your updated slots.' });
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  const toggleMode = (mode: AppointmentMode, on: boolean) =>
    setModes((m) => (on ? [...new Set([...m, mode])] : m.filter((x) => x !== mode)));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Consultation modes" description="How students can see you">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                { mode: 'in_person', label: 'In-person', hint: 'At your OPD room', icon: Building2 },
                { mode: 'video', label: 'Video', hint: 'Secure in-app video call', icon: Video },
              ] as const
            ).map((m) => {
              const on = modes.includes(m.mode);
              return (
                <label
                  key={m.mode}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    on ? 'border-teal-300 bg-teal-50/60' : 'hover:border-slate-300',
                  )}
                >
                  <Checkbox checked={on} onCheckedChange={(v) => toggleMode(m.mode, v === true)} aria-label={m.label} className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
                      <m.icon className="size-4 text-slate-500" /> {m.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {modes.length === 0 && <p className="mt-2 text-xs font-medium text-rose-600">Select at least one mode.</p>}
        </Panel>
        <Panel title="Slot length" description="Duration of each bookable appointment">
          <div className="flex items-center gap-3">
            <Select value={String(slotMinutes)} onValueChange={(v) => setSlotMinutes(Number(v))}>
              <SelectTrigger className="w-40" aria-label="Slot length">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SLOT_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Timer className="size-4" />
              <span className="font-semibold text-slate-800 tabular-nums">{weeklySlots}</span> bookable slots / week
            </p>
          </div>
        </Panel>
      </div>

      <Panel
        title="Weekly OPD schedule"
        description="Add one or more sessions per day. Changes don't affect appointments already booked."
        actions={
          <Button variant="outline" size="sm" onClick={copyMonday} disabled={week[1].length === 0}>
            <Copy /> Copy Monday to weekdays
          </Button>
        }
        padded={false}
      >
        <ul className="divide-y">
          {WEEK_ORDER.map((day) => {
            const blocks = week[day];
            const err = errors[day];
            const slots = slotsFor(blocks, slotMinutes);
            return (
              <li key={day} className={cn('flex flex-col gap-3 px-5 py-4 md:flex-row md:items-start', err && 'bg-rose-50/40')}>
                <div className="flex w-full items-center justify-between md:w-36 md:flex-col md:items-start md:pt-1.5">
                  <p className="text-sm font-semibold text-slate-900">{WEEKDAY_LABELS[day]}</p>
                  <p className={cn('text-xs', blocks.length ? 'text-muted-foreground' : 'text-slate-400')}>
                    {blocks.length ? `${slots} slots` : 'Off'}
                  </p>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {blocks.map((b) => (
                    <div key={b.key} className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        value={b.startTime}
                        onChange={(e) => updateBlock(day, b.key, { startTime: e.target.value })}
                        className="w-[130px]"
                        aria-label={`${WEEKDAY_LABELS[day]} session start`}
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="time"
                        value={b.endTime}
                        onChange={(e) => updateBlock(day, b.key, { endTime: e.target.value })}
                        className="w-[130px]"
                        aria-label={`${WEEKDAY_LABELS[day]} session end`}
                      />
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {b.startTime && b.endTime && toMin(b.endTime) > toMin(b.startTime)
                          ? `${formatTime(b.startTime)} – ${formatTime(b.endTime)}`
                          : ''}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${WEEKDAY_LABELS[day]} session`}
                        onClick={() => removeBlock(day, b.key)}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  <Button variant="ghost" size="xs" onClick={() => addBlock(day)} className="text-primary hover:text-primary">
                    <Plus /> Add session
                  </Button>
                  {err && <p className="text-xs font-medium text-rose-600">{err}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      {dirty && (
      <div className="sticky bottom-4 z-10 flex animate-fade-up flex-col gap-3 rounded-xl border bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Unsaved changes</span> to your availability.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={discard} disabled={save.isPending}>
            <RotateCcw /> Discard
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending || hasErrors}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Save changes
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}

export default function AvailabilityPage() {
  const { data, isLoading, isError, error, refetch } = useSchedule();

  if (isLoading) return <PageSkeleton stats={0} />;
  if (isError || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="Control when and how students can book you. Slots are generated from this schedule."
       
      />
      <AcceptingCard value={data.isAccepting} />
      <ScheduleEditor initial={data} />
      <LeavesPanel leaves={data.leaves} />
    </div>
  );
}
