import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { format } from 'date-fns';
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarClock,
  CalendarPlus,
  Clock,
  Droplet,
  FileText,
  HeartPulse,
  MapPin,
  PackageCheck,
  Phone,
  Pill,
  QrCode,
  ShieldAlert,
  Siren,
  Truck,
  Video,
  type LucideIcon,
} from 'lucide-react';
import {
  EMERGENCY_STATUS_LABELS,
  FULFILMENT_LABELS,
  NATIONAL_AMBULANCE_NUMBER,
  REQUEST_STATUS_LABELS,
  requestProgressSteps,
} from '@shared/constants';
import type { Appointment, AuthUser, Emergency, MedicineRequest, Notification, Prescription } from '@shared/types';
import { EmptyState, Panel, ProgressSteps, StatusBadge, ToneBadge, UserAvatar } from '@/components/app';
import { TONE_TILE, type Tone } from '@/components/app/tone';
import { NotificationItem, useNotificationActions } from '@/components/layout/NotificationBell';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useCall } from '@/features/calls/CallProvider';
import { daysUntil, formatDate, formatDayLabel, formatTime, formatTimeRange, parseDate, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AppointmentPassDialog } from '../../appointments/components/AppointmentPassDialog';
import { AppointmentStatusBadge, ModeBadge } from '../../appointments/components/badges';
import { canJoinVideo } from '../../appointments/utils';

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------
const QUICK_ACTIONS: { title: string; description: string; to: string; icon: LucideIcon; tone: Tone }[] = [
  { title: 'Book appointment', description: 'Find a slot with a doctor', to: '/student/book', icon: CalendarPlus, tone: 'teal' },
  { title: 'Request medicines', description: 'Pickup or campus delivery', to: '/student/medicines', icon: Pill, tone: 'indigo' },
  { title: 'Upload a record', description: 'Lab reports & certificates', to: '/student/records', icon: FileText, tone: 'violet' },
  { title: 'Message a doctor', description: 'Chat or start a video call', to: '/student/messages', icon: Video, tone: 'sky' },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {QUICK_ACTIONS.map((a) => (
        <Link
          key={a.to}
          to={a.to}
          className="group flex flex-col items-start gap-2.5 rounded-xl border bg-card p-3.5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md sm:flex-row sm:items-center sm:gap-3 sm:p-4"
        >
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl ring-1', TONE_TILE[a.tone])}>
            <a.icon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-tight font-semibold text-slate-900 sm:truncate">{a.title}</span>
            <span className="hidden truncate text-xs text-muted-foreground sm:block">{a.description}</span>
          </span>
          <ArrowUpRight className="hidden size-4 shrink-0 text-slate-300 transition-colors group-hover:text-primary sm:block" />
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Next appointment hero
// ---------------------------------------------------------------------------
export function NextAppointmentCard({
  appointment: a,
  more,
}: {
  appointment: Appointment | null;
  more: Appointment[];
}) {
  const [passOpen, setPassOpen] = useState(false);
  const { startCall } = useCall();

  if (!a) {
    return (
      <Panel title="Next appointment" icon={CalendarClock}>
        <EmptyState
          compact
          icon={CalendarPlus}
          title="No upcoming appointments"
          description="Book a visit with a doctor at the health centre in under a minute."
          action={
            <Button asChild>
              <Link to="/student/book">
                <CalendarPlus /> Book appointment
              </Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const date = parseDate(a.date);
  const dayLabel = formatDayLabel(a.date);

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex flex-col sm:flex-row">
        <div className="relative flex shrink-0 items-center justify-between gap-4 overflow-hidden bg-[#0b1b33] px-6 py-5 text-white sm:w-44 sm:flex-col sm:justify-center sm:text-center">
          <div className="bg-grid absolute inset-0 opacity-70" aria-hidden />
          <div className="absolute -right-10 -bottom-10 size-32 rounded-full bg-teal-400/10 blur-2xl" aria-hidden />
          <div className="relative">
            <p className="text-xs font-semibold tracking-[0.14em] text-teal-300 uppercase">
              {dayLabel === 'Today' || dayLabel === 'Tomorrow' ? dayLabel : format(date, 'EEEE')}
            </p>
            <p className="font-display text-5xl leading-none font-semibold tabular-nums sm:mt-1">{format(date, 'd')}</p>
            <p className="text-sm text-slate-300">{format(date, 'MMMM yyyy')}</p>
          </div>
          <div className="relative rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold tabular-nums ring-1 ring-white/15 sm:mt-3">
            {formatTime(a.startTime)}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold tracking-wide text-primary uppercase">Next appointment</p>
            <div className="flex items-center gap-1.5">
              <ModeBadge mode={a.mode} />
              <AppointmentStatusBadge appointment={a} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <UserAvatar user={a.doctor} size="lg" />
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-semibold text-slate-900">{a.doctor.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {a.doctor.specialty} · {a.doctor.qualifications}
              </p>
            </div>
          </div>
          <div className="grid gap-2.5 text-[13px] text-slate-600 sm:grid-cols-3">
            <span className="flex items-center gap-2">
              <Clock className="size-4 text-slate-400" /> {formatTimeRange(a.startTime, a.endTime)}
            </span>
            <span className="flex items-center gap-2">
              {a.mode === 'video' ? <Video className="size-4 text-slate-400" /> : <MapPin className="size-4 text-slate-400" />}
              {a.mode === 'video' ? 'Video consultation' : `Health Centre · ${a.doctor.room ?? 'OPD'}`}
            </span>
            <span className="flex items-center gap-2 truncate">
              <HeartPulse className="size-4 shrink-0 text-slate-400" /> <span className="truncate">{a.reason}</span>
            </span>
          </div>
          {a.status === 'checked_in' && a.tokenNo && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
              Checked in · Token #{a.tokenNo} — please wait to be called.
            </p>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-4">
            {canJoinVideo(a) && (
              <Button onClick={() => startCall(a.doctor, { appointmentId: a.id })}>
                <Video /> Join video call
              </Button>
            )}
            <Button variant={canJoinVideo(a) ? 'outline' : 'default'} onClick={() => setPassOpen(true)}>
              <QrCode /> View pass
            </Button>
            <Button asChild variant="outline">
              <Link to={`/student/appointments?open=${a.id}`}>
                <CalendarClock /> Reschedule
              </Link>
            </Button>
            <span className="ml-auto font-mono text-xs font-semibold tracking-wider text-slate-400">{a.code}</span>
          </div>
        </div>
      </div>
      {more.length > 0 && (
        <div className="border-t bg-muted/30 px-5 py-3 sm:px-6">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Also coming up</p>
          <ul className="space-y-1.5">
            {more.slice(0, 3).map((m) => (
              <li key={m.id}>
                <Link
                  to={`/student/appointments?open=${m.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-white"
                >
                  <span className="w-24 shrink-0 font-medium text-slate-800">{formatDayLabel(m.date)}</span>
                  <span className="w-20 shrink-0 text-slate-500 tabular-nums">{formatTime(m.startTime)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {m.doctor.name} · {m.doctor.specialty}
                  </span>
                  {m.mode === 'video' ? (
                    <Video className="size-3.5 text-violet-500" />
                  ) : (
                    <Building2 className="size-3.5 text-slate-400" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AppointmentPassDialog appointment={a} open={passOpen} onOpenChange={setPassOpen} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Medicine requests tracker
// ---------------------------------------------------------------------------
export function RequestTracker({ requests }: { requests: MedicineRequest[] }) {
  return (
    <Panel
      title="Medicine requests"
      description="Live status of your pharmacy requests"
      icon={PackageCheck}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/student/requests">
            View all <ArrowRight />
          </Link>
        </Button>
      }
    >
      {requests.length === 0 ? (
        <EmptyState
          compact
          icon={Pill}
          title="No active requests"
          description="Request OTC medicines or medicines from your prescription."
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/student/medicines">Browse medicines</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {requests.slice(0, 3).map((r) => {
            const steps = requestProgressSteps(r.fulfilment).map((key) => ({ key, label: REQUEST_STATUS_LABELS[key] }));
            const failed =
              r.status === 'rejected' || r.status === 'cancelled' ? { label: REQUEST_STATUS_LABELS[r.status] } : null;
            const current = failed ? (r.approvedAt ? 'approved' : 'submitted') : r.status;
            return (
              <Link
                key={r.id}
                to={`/student/requests?open=${r.id}`}
                className="block rounded-xl border p-4 transition-colors hover:border-slate-300 hover:bg-muted/20"
              >
                <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className="font-mono tracking-wider">{r.code}</span>
                      <span className="text-xs font-normal text-muted-foreground">· {timeAgo(r.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] text-slate-600">
                      {r.items.map((i) => `${i.medicineName} × ${i.quantity}`).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ToneBadge tone="slate" icon={r.fulfilment === 'delivery' ? <Truck /> : <Building2 />}>
                      {r.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}
                    </ToneBadge>
                    <StatusBadge kind="request" status={r.status} />
                  </div>
                </div>
                <ProgressSteps steps={steps} current={current} failed={failed} />
                {r.status === 'ready_for_pickup' && (
                  <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-[13px] font-medium text-indigo-800">
                    Ready at the dispensary counter — show code {r.code}.
                  </p>
                )}
                {r.status === 'out_for_delivery' && r.deliveryLocation && (
                  <p className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-[13px] font-medium text-indigo-800">
                    On the way to {r.deliveryLocation}.
                  </p>
                )}
                <p className="sr-only">{FULFILMENT_LABELS[r.fulfilment]}</p>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Prescriptions
// ---------------------------------------------------------------------------
export function RecentPrescriptions({ prescriptions }: { prescriptions: Prescription[] }) {
  return (
    <Panel
      title="Recent prescriptions"
      icon={FileText}
      padded={false}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/student/prescriptions">
            View all <ArrowRight />
          </Link>
        </Button>
      }
    >
      {prescriptions.length === 0 ? (
        <EmptyState compact icon={FileText} title="No prescriptions yet" description="Prescriptions from your consultations appear here." />
      ) : (
        <ul className="divide-y">
          {prescriptions.slice(0, 4).map((p) => {
            const active = daysUntil(p.validUntil) >= 0;
            return (
              <li key={p.id}>
                <Link
                  to={`/student/prescriptions?open=${p.id}`}
                  className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-muted/40"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 ring-1 ring-violet-600/10">
                    <FileText className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{p.diagnosis ?? 'Prescription'}</span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.doctor.name} · {formatDate(p.createdAt)} · {p.items.length} medicine{p.items.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="hidden shrink-0 sm:block">
                    {active ? (
                      <ToneBadge tone="emerald">Valid till {format(parseDate(p.validUntil), 'd MMM')}</ToneBadge>
                    ) : (
                      <ToneBadge tone="slate">Expired</ToneBadge>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Health profile
// ---------------------------------------------------------------------------
export function HealthProfileCard({ user, completion }: { user: AuthUser; completion: number }) {
  const s = user.student;
  return (
    <Panel
      title="Health profile"
      icon={HeartPulse}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/student/profile">Edit</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-rose-50/70 px-3 py-2.5 ring-1 ring-rose-600/10">
            <p className="flex items-center gap-1 text-[11px] font-medium text-rose-700">
              <Droplet className="size-3" /> Blood
            </p>
            <p className="font-display text-lg font-semibold text-slate-900">{s?.bloodGroup ?? '—'}</p>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Height</p>
            <p className="font-display text-lg font-semibold text-slate-900">
              {s?.heightCm ? `${Math.round(s.heightCm)}` : '—'}
              {s?.heightCm ? <span className="text-xs font-medium text-slate-500"> cm</span> : null}
            </p>
          </div>
          <div className="rounded-lg bg-muted/60 px-3 py-2.5">
            <p className="text-[11px] font-medium text-muted-foreground">Weight</p>
            <p className="font-display text-lg font-semibold text-slate-900">
              {s?.weightKg ? `${Math.round(s.weightKg)}` : '—'}
              {s?.weightKg ? <span className="text-xs font-medium text-slate-500"> kg</span> : null}
            </p>
          </div>
        </div>
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldAlert className="size-3.5 text-rose-500" /> Allergies
          </p>
          <div className="flex flex-wrap gap-1.5">
            {s && s.allergies.length > 0 ? (
              s.allergies.map((a) => (
                <span key={a} className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/15 ring-inset">
                  {a}
                </span>
              ))
            ) : (
              <span className="text-[13px] text-slate-500">No known allergies</span>
            )}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Conditions</p>
          <div className="flex flex-wrap gap-1.5">
            {s && s.conditions.length > 0 ? (
              s.conditions.map((c) => (
                <span key={c} className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-600/15 ring-inset">
                  {c}
                </span>
              ))
            ) : (
              <span className="text-[13px] text-slate-500">None recorded</span>
            )}
          </div>
        </div>
        {s?.emergencyContactName && (
          <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-sky-50 text-sky-600">
              <Phone className="size-4" />
            </span>
            <div className="min-w-0 text-[13px]">
              <p className="truncate font-semibold text-slate-900">
                {s.emergencyContactName}
                {s.emergencyContactRelation && <span className="font-normal text-muted-foreground"> · {s.emergencyContactRelation}</span>}
              </p>
              <p className="text-muted-foreground tabular-nums">{s.emergencyContactPhone}</p>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600">Profile completeness</span>
            <span className="font-semibold text-slate-900 tabular-nums">{completion}%</span>
          </div>
          <Progress value={completion} className="h-1.5 bg-slate-100" />
          {completion < 100 && (
            <Link to="/student/profile" className="inline-block text-xs font-medium text-primary hover:underline">
              Complete your profile so doctors have the full picture
            </Link>
          )}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export function LatestNotifications({ notifications }: { notifications: Notification[] }) {
  const navigate = useNavigate();
  const { markRead } = useNotificationActions();
  return (
    <Panel
      title="Latest updates"
      icon={Bell}
      padded={false}
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link to="/student/notifications">
            All <ArrowRight />
          </Link>
        </Button>
      }
    >
      {notifications.length === 0 ? (
        <EmptyState compact icon={Bell} title="You're all caught up" description="Updates about your care will appear here." />
      ) : (
        <div className="divide-y">
          {notifications.slice(0, 5).map((n) => (
            <NotificationItem
              key={n.id}
              n={n}
              compact
              onOpen={(item) => {
                if (!item.isRead) markRead.mutate(item.id);
                if (item.link) navigate(item.link);
              }}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Emergency
// ---------------------------------------------------------------------------
export function EmergencyHelpCard() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-white p-5 shadow-xs">
      <div className="absolute -top-8 -right-8 size-28 rounded-full bg-rose-200/40 blur-2xl" aria-hidden />
      <div className="relative space-y-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-rose-500 text-white shadow-[0_8px_20px_-8px_rgb(244_63_94/0.8)]">
          <Siren className="size-5" />
        </span>
        <div>
          <p className="font-display text-base font-semibold text-slate-900">Need urgent medical help?</p>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            Alert the health-centre team with your location. They acknowledge the request and assign a responder.
          </p>
        </div>
        <Button asChild variant="destructive" className="w-full">
          <Link to="/student/emergency">
            <Siren /> Request emergency assistance
          </Link>
        </Button>
        <p className="text-center text-xs text-rose-700">
          Life-threatening? Call <span className="font-semibold">{NATIONAL_AMBULANCE_NUMBER}</span> immediately.
        </p>
      </div>
    </section>
  );
}

export function ActiveEmergencyBanner({ emergency }: { emergency: Emergency }) {
  return (
    <Link
      to="/student/emergency"
      className="mb-6 flex items-center gap-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 transition-colors hover:bg-rose-100/70"
    >
      <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-40" />
        <Siren className="relative size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-rose-900">
          Emergency request {emergency.code} · {EMERGENCY_STATUS_LABELS[emergency.status]}
        </p>
        <p className="truncate text-sm text-rose-800/90">
          {emergency.responderName
            ? `${emergency.responderName} has been assigned${emergency.responderPhone ? ` · ${emergency.responderPhone}` : ''}`
            : `${emergency.category} at ${emergency.location} · raised ${timeAgo(emergency.createdAt)}`}
        </p>
      </div>
      <span className="hidden items-center gap-1 text-sm font-semibold text-rose-700 sm:flex">
        Track status <ArrowRight className="size-4" />
      </span>
    </Link>
  );
}
