import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Hourglass,
  Inbox,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Appointment, DoctorDashboard, Prescription, ScheduleBlock } from '@shared/types';
import { EmptyState, ErrorState, PageHeader, PageSkeleton, Panel, StatCard, StatusBadge, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/api';
import { formatDate, formatDateLong, formatDayLabel, formatTime, greeting, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDoctorDashboard, useSetAccepting } from './api';
import { AppointmentActionButton, CheckInByCodeDialog } from './components/appointment-actions';
import { doctorSurname, ModeBadge, TokenBadge } from './components/clinic-bits';
import { PrescriptionDialog } from './components/PrescriptionDialog';

function AcceptingToggle({ value }: { value: boolean }) {
  const setAccepting = useSetAccepting();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const checked = optimistic ?? value;
  const onChange = async (next: boolean) => {
    setOptimistic(next);
    try {
      await setAccepting.mutateAsync(next);
      toast.success(next ? 'You are accepting new appointments' : 'New bookings paused', {
        description: next ? 'Students can book your open slots again.' : 'Existing appointments are not affected.',
      });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setOptimistic(null);
    }
  };
  return (
    <label
      className={cn(
        'inline-flex h-9 cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 text-sm font-medium shadow-xs transition-colors',
        checked ? 'border-emerald-200 text-emerald-800' : 'border-amber-200 text-amber-800',
      )}
    >
      <span className={cn('size-2 rounded-full', checked ? 'bg-emerald-500' : 'bg-amber-500')} />
      {checked ? 'Accepting appointments' : 'Bookings paused'}
      <Switch checked={checked} onCheckedChange={(v) => void onChange(v)} disabled={setAccepting.isPending} aria-label="Accepting appointments" />
    </label>
  );
}

function NextPatientCard({ appointment }: { appointment: Appointment | null }) {
  const navigate = useNavigate();
  if (!appointment) {
    return (
      <div className="rounded-xl border bg-card shadow-xs">
        <EmptyState
          icon={CheckCircle2}
          title="No one is waiting"
          description="When a patient checks in or a video consultation is due, they'll appear here."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/doctor/appointments">Open appointments</Link>
            </Button>
          }
        />
      </div>
    );
  }
  const a = appointment;
  const statusCopy =
    a.status === 'in_progress'
      ? 'Consultation in progress'
      : a.status === 'checked_in'
        ? 'Checked in · waiting'
        : a.mode === 'video'
          ? 'Video consultation'
          : 'Not checked in yet';
  return (
    <div className="relative overflow-hidden rounded-xl border border-teal-200/70 bg-white shadow-sm">
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-teal-400 to-emerald-500" aria-hidden />
      <div className="flex flex-col gap-5 p-5 pl-6 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <UserAvatar user={a.student} size="xl" />
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wider text-teal-700 uppercase">
                <Sparkles className="size-3" /> Next patient
              </span>
              <StatusBadge kind="appointment" status={a.status} />
            </div>
            <button
              type="button"
              onClick={() => navigate(`/doctor/appointments?open=${a.id}`)}
              className="block max-w-full truncate text-left font-display text-xl font-semibold text-slate-900 hover:text-primary"
            >
              {a.student.name}
            </button>
            <p className="truncate text-sm text-muted-foreground">
              {a.student.rollNo} · {a.student.department} · Year {a.student.year}
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[13px] text-slate-600">
              <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                <Clock3 className="size-3.5 text-slate-400" /> {formatTime(a.startTime)}
              </span>
              <span className="text-slate-300">•</span>
              <span className="truncate">{a.reason}</span>
              <ModeBadge mode={a.mode} />
              {a.tokenNo ? <TokenBadge token={a.tokenNo} /> : null}
            </div>
            <p className="text-xs text-muted-foreground">{statusCopy}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 md:flex-col md:items-stretch">
          <AppointmentActionButton appointment={a} size="default" fullLabels />
          <Button variant="outline" onClick={() => navigate(`/doctor/appointments?open=${a.id}`)}>
            View details
          </Button>
        </div>
      </div>
    </div>
  );
}

function QueueRow({ a }: { a: Appointment }) {
  const navigate = useNavigate();
  const done = a.status === 'completed' || a.status === 'cancelled';
  return (
    <li
      onClick={() => navigate(`/doctor/appointments?open=${a.id}`)}
      className={cn(
        'group flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40',
        done && 'opacity-60 hover:opacity-100',
        a.status === 'in_progress' && 'bg-violet-50/40',
      )}
    >
      <div className="w-[68px] shrink-0">
        <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatTime(a.startTime)}</p>
        <p className="text-[11px] text-muted-foreground tabular-nums">{formatTime(a.endTime)}</p>
      </div>
      <TokenBadge token={a.tokenNo} className="hidden sm:inline-flex" />
      <UserAvatar user={a.student} size="sm" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium text-slate-900', a.status === 'cancelled' && 'line-through')}>
          {a.student.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{a.reason}</p>
      </div>
      <ModeBadge mode={a.mode} iconOnly className="hidden sm:inline-flex" />
      <StatusBadge kind="appointment" status={a.status} className="hidden md:inline-flex" />
      <div className="flex w-[104px] shrink-0 justify-end">
        <AppointmentActionButton appointment={a} />
      </div>
    </li>
  );
}

function WeeklyChart({ data }: { data: DoctorDashboard['weeklyConsultations'] }) {
  const rows = data.map((d) => {
    const [y, m, day] = d.date.split('-').map(Number);
    return { ...d, label: new Date(y, m - 1, day).toLocaleDateString('en-IN', { weekday: 'short' }) };
  });
  const total = data.reduce((s, d) => s + d.completed, 0);
  return (
    <Panel
      title="Consultations this week"
      description={`${total} completed in the last 7 days`}
      icon={CalendarCheck2}
      actions={
        <div className="hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-teal-600" /> Completed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-slate-300" /> Cancelled
          </span>
        </div>
      }
    >
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} barGap={4} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
            <CartesianGrid vertical={false} stroke="#eef2f6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <Tooltip
              cursor={{ fill: 'rgba(13,148,136,0.06)' }}
              contentStyle={{
                borderRadius: 10,
                border: '1px solid #e3e8ef',
                boxShadow: '0 8px 24px -8px rgba(15,23,42,.18)',
                fontSize: 12,
              }}
              labelStyle={{ fontWeight: 600, color: '#0f172a' }}
            />
            <Bar dataKey="completed" name="Completed" fill="#0d9488" radius={[5, 5, 0, 0]} maxBarSize={26} />
            <Bar dataKey="cancelled" name="Cancelled" fill="#cbd5e1" radius={[5, 5, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

function sessionStatus(blocks: ScheduleBlock[]): { label: string; tone: 'live' | 'next' | 'off' } {
  if (blocks.length === 0) return { label: 'No OPD sessions today', tone: 'off' };
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const sorted = [...blocks].sort((a, b) => toMin(a.startTime) - toMin(b.startTime));
  const live = sorted.find((b) => minutes >= toMin(b.startTime) && minutes < toMin(b.endTime));
  if (live) return { label: `In session until ${formatTime(live.endTime)}`, tone: 'live' };
  const next = sorted.find((b) => toMin(b.startTime) > minutes);
  if (next) return { label: `Next session at ${formatTime(next.startTime)}`, tone: 'next' };
  return { label: 'Done for today', tone: 'off' };
}

function TodayScheduleCard({ blocks, accepting }: { blocks: ScheduleBlock[]; accepting: boolean }) {
  const status = sessionStatus(blocks);
  return (
    <Panel
      title="Today's OPD"
      icon={Clock3}
      actions={
        <Button variant="ghost" size="xs" asChild>
          <Link to="/doctor/availability">Manage</Link>
        </Button>
      }
    >
      <div className="space-y-3">
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium',
            status.tone === 'live' ? 'bg-emerald-50 text-emerald-800' : status.tone === 'next' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-600',
          )}
        >
          <span
            className={cn(
              'size-2 rounded-full',
              status.tone === 'live' ? 'animate-pulse bg-emerald-500' : status.tone === 'next' ? 'bg-blue-500' : 'bg-slate-400',
            )}
          />
          {status.label}
        </div>
        {blocks.length > 0 && (
          <ul className="space-y-2">
            {[...blocks]
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
              .map((b) => (
                <li key={`${b.startTime}-${b.endTime}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium text-slate-800 tabular-nums">
                    {formatTime(b.startTime)} – {formatTime(b.endTime)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {Number(b.startTime.slice(0, 2)) < 12 ? 'Morning' : Number(b.startTime.slice(0, 2)) < 17 ? 'Afternoon' : 'Evening'}
                  </span>
                </li>
              ))}
          </ul>
        )}
        {!accepting && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            New bookings are paused. Existing appointments still appear in your queue.
          </p>
        )}
      </div>
    </Panel>
  );
}

function UpcomingCard({ items }: { items: Appointment[] }) {
  const navigate = useNavigate();
  return (
    <Panel
      title="Coming up"
      description="Next 7 days"
      icon={CalendarClock}
      padded={false}
      actions={
        <Button variant="ghost" size="xs" asChild>
          <Link to="/doctor/appointments">
            View all <ArrowRight />
          </Link>
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState compact icon={Inbox} title="Nothing booked yet" description="New bookings will show up here." />
      ) : (
        <ul className="divide-y">
          {items.slice(0, 6).map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => navigate(`/doctor/appointments?open=${a.id}`)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <UserAvatar user={a.student} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{a.student.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatDayLabel(a.date)} · {formatTime(a.startTime)}
                  </p>
                </div>
                <ModeBadge mode={a.mode} iconOnly />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function RecentPrescriptionsCard({ items }: { items: Prescription[] }) {
  const [selected, setSelected] = useState<Prescription | null>(null);
  return (
    <Panel
      title="Recent prescriptions"
      icon={FileText}
      padded={false}
      actions={
        <Button variant="ghost" size="xs" asChild>
          <Link to="/doctor/prescriptions">
            All <ArrowRight />
          </Link>
        </Button>
      }
    >
      {items.length === 0 ? (
        <EmptyState compact icon={FileText} title="No prescriptions yet" description="Prescriptions you issue appear here." />
      ) : (
        <ul className="divide-y">
          {items.slice(0, 5).map((rx) => (
            <li key={rx.id}>
              <button
                type="button"
                onClick={() => setSelected(rx)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{rx.student.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {rx.code} · {rx.items.length} {rx.items.length === 1 ? 'medicine' : 'medicines'}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(rx.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PrescriptionDialog prescription={selected} open={selected !== null} onOpenChange={(o) => !o && setSelected(null)} />
    </Panel>
  );
}

export default function DoctorDashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useDoctorDashboard();

  const queue = useMemo(() => data?.todayQueue ?? [], [data]);
  const remaining = queue.filter((a) => a.status !== 'completed' && a.status !== 'cancelled').length;

  if (isLoading) return <PageSkeleton />;
  if (isError || !data) return <ErrorState error={error} retry={() => void refetch()} />;

  const s = data.stats;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatDateLong(new Date())}
        title={`${greeting()}, Dr. ${doctorSurname(user.name)}`}
        description={
          s.todayTotal > 0
            ? `You have ${s.todayTotal} ${s.todayTotal === 1 ? 'appointment' : 'appointments'} today — ${remaining} still to see.`
            : 'No appointments on your list today.'
        }
        actions={
          <>
            <AcceptingToggle value={data.isAccepting} />
            <CheckInByCodeDialog />
          </>
        }
       
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Today's appointments" value={s.todayTotal} icon={CalendarDays} tone="blue" hint={`${s.inProgress} in progress`} to="/doctor/appointments" />
        <StatCard label="Waiting room" value={s.waiting} icon={Hourglass} tone="amber" hint="Checked in, not yet seen" />
        <StatCard label="Completed today" value={s.completedToday} icon={CheckCircle2} tone="emerald" hint={`${s.patientsThisMonth} patients this month`} />
        <StatCard label="Upcoming · 7 days" value={s.upcomingWeek} icon={CalendarClock} tone="violet" hint="Booked by students" to="/doctor/appointments" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <NextPatientCard appointment={data.nextPatient} />

          <Panel
            title="Today's queue"
            description={queue.length ? `${queue.length} booked · ${remaining} remaining` : formatDate(new Date())}
            icon={Clock3}
            padded={false}
            actions={
              <Button variant="ghost" size="xs" asChild>
                <Link to="/doctor/appointments">
                  Manage <ArrowRight />
                </Link>
              </Button>
            }
          >
            {queue.length === 0 ? (
              <EmptyState
                compact
                icon={CalendarDays}
                title="No appointments today"
                description="Students can book your open OPD slots from the doctor directory."
              />
            ) : (
              <ul className="divide-y">
                {queue.map((a) => (
                  <QueueRow key={a.id} a={a} />
                ))}
              </ul>
            )}
          </Panel>

          <WeeklyChart data={data.weeklyConsultations} />
        </div>

        <div className="min-w-0 space-y-6">
          <TodayScheduleCard blocks={data.todaySchedule} accepting={data.isAccepting} />
          <UpcomingCard items={data.upcoming} />
          <RecentPrescriptionsCard items={data.recentPrescriptions} />
        </div>
      </div>
    </div>
  );
}
