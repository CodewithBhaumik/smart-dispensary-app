import { Link } from 'react-router';
import { format } from 'date-fns';
import { CalendarClock, ChevronRight, Clock, FileText, Video, XCircle } from 'lucide-react';
import type { Appointment } from '@shared/types';
import { UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { formatDayLabel, formatTimeRange, parseDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { canCancel, canJoinVideo, canReschedule, isActiveAppointment, isMissed } from '../utils';
import { AppointmentStatusBadge, ModeBadge } from './badges';

/** List row for the student's appointments. */
export function AppointmentCard({
  appointment: a,
  onOpen,
  onReschedule,
  onCancel,
  onJoin,
}: {
  appointment: Appointment;
  onOpen: (a: Appointment) => void;
  onReschedule: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
  onJoin: (a: Appointment) => void;
}) {
  const date = parseDate(a.date);
  const upcoming = isActiveAppointment(a) && !isMissed(a);
  const dayLabel = formatDayLabel(a.date);
  const isRelative = dayLabel === 'Today' || dayLabel === 'Tomorrow';

  return (
    <article
      className={cn(
        'group flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs transition-all hover:border-slate-300 hover:shadow-sm sm:flex-row sm:items-center sm:p-5',
        a.status === 'cancelled' && 'bg-card/70',
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(a)}
        className="flex min-w-0 flex-1 items-center gap-4 text-left outline-none"
        aria-label={`Open appointment ${a.code}`}
      >
        <div
          className={cn(
            'flex w-[68px] shrink-0 flex-col items-center rounded-xl py-2.5 text-center ring-1 ring-inset',
            upcoming ? 'bg-teal-50 text-teal-800 ring-teal-600/15' : 'bg-slate-50 text-slate-600 ring-slate-500/10',
          )}
        >
          <span className="text-[11px] font-semibold tracking-wide uppercase">{format(date, 'EEE')}</span>
          <span className="font-display text-2xl leading-7 font-semibold tabular-nums">{format(date, 'd')}</span>
          <span className="text-[11px] font-medium">{format(date, 'MMM yyyy')}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2.5">
            <UserAvatar user={a.doctor} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-semibold text-slate-900">{a.doctor.name}</p>
              <p className="truncate text-xs text-muted-foreground">{a.doctor.specialty}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5 text-slate-400" />
              {isRelative && <span className="font-semibold text-slate-800">{dayLabel} ·</span>}
              {formatTimeRange(a.startTime, a.endTime)}
            </span>
            <span className="hidden text-slate-300 sm:inline">•</span>
            <span className="truncate">{a.reason}</span>
            <span className="hidden font-mono text-[11px] tracking-wider text-slate-400 md:inline">{a.code}</span>
          </div>
        </div>
      </button>

      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end">
        <ModeBadge mode={a.mode} />
        <AppointmentStatusBadge appointment={a} />
        <div className="ml-auto flex items-center gap-1.5 sm:ml-2">
          {canJoinVideo(a) && (
            <Button size="sm" onClick={() => onJoin(a)}>
              <Video /> Join call
            </Button>
          )}
          {canReschedule(a) && (
            <Button size="sm" variant="ghost" onClick={() => onReschedule(a)} aria-label="Reschedule appointment">
              <CalendarClock /> <span className="hidden lg:inline">Reschedule</span>
            </Button>
          )}
          {canCancel(a) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onCancel(a)}
              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
              aria-label="Cancel appointment"
            >
              <XCircle /> <span className="hidden lg:inline">Cancel</span>
            </Button>
          )}
          {a.prescriptionId && (
            <Button asChild size="sm" variant="soft">
              <Link to={`/student/prescriptions?open=${a.prescriptionId}`}>
                <FileText /> Prescription
              </Link>
            </Button>
          )}
          <Button size="icon-sm" variant="ghost" onClick={() => onOpen(a)} aria-label="View details">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </article>
  );
}
