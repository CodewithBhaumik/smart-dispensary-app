import { Link } from 'react-router';
import { BriefcaseMedical, Building2, CalendarPlus, Languages, MapPin, Video } from 'lucide-react';
import type { DoctorListItem } from '@shared/types';
import { ToneBadge, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { formatDayLabel, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** One-line availability summary with a status colour. */
export function availabilityLine(d: Pick<DoctorListItem, 'isAccepting' | 'todayFreeSlots' | 'nextAvailable'>): {
  text: string;
  className: string;
  dot: string;
} {
  if (!d.isAccepting) return { text: 'Not accepting appointments', className: 'text-slate-500', dot: 'bg-slate-400' };
  if (d.todayFreeSlots > 0)
    return {
      text: `${d.todayFreeSlots} slot${d.todayFreeSlots === 1 ? '' : 's'} left today`,
      className: 'text-emerald-700',
      dot: 'bg-emerald-500',
    };
  if (d.nextAvailable)
    return {
      text: `Next available ${formatDayLabel(d.nextAvailable.date)}, ${formatTime(d.nextAvailable.time)}`,
      className: 'text-blue-700',
      dot: 'bg-blue-500',
    };
  return { text: 'Fully booked for the next 2 weeks', className: 'text-amber-700', dot: 'bg-amber-500' };
}

export function ModeChips({ modes, className }: { modes: DoctorListItem['consultationModes']; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {modes.includes('in_person') && (
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          <Building2 className="size-3" /> In-person
        </span>
      )}
      {modes.includes('video') && (
        <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
          <Video className="size-3" /> Video
        </span>
      )}
    </div>
  );
}

export function DoctorCard({ doctor: d }: { doctor: DoctorListItem }) {
  const line = availabilityLine(d);
  return (
    <article className="group flex h-full min-w-0 flex-col rounded-xl border bg-card shadow-xs transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3.5">
          <UserAvatar user={d} size="lg" />
          <div className="min-w-0 flex-1">
            <Link
              to={`/student/doctors/${d.id}`}
              className="block truncate font-display text-[15px] font-semibold text-slate-900 hover:text-primary"
            >
              {d.name}
            </Link>
            <p className="truncate text-[13px] text-muted-foreground">{d.title ?? 'Medical Officer'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ToneBadge tone="teal">{d.specialty}</ToneBadge>
              {d.isVisiting && <ToneBadge tone="violet">Visiting</ToneBadge>}
            </div>
          </div>
        </div>

        <dl className="space-y-1.5 text-[13px] text-slate-600">
          <div className="flex items-center gap-2">
            <BriefcaseMedical className="size-3.5 shrink-0 text-slate-400" />
            <dt className="sr-only">Qualifications</dt>
            <dd className="truncate">
              {d.qualifications}
              {d.experienceYears !== null && (
                <span className="text-slate-400"> · {Math.round(d.experienceYears)} yrs experience</span>
              )}
            </dd>
          </div>
          {d.languages.length > 0 && (
            <div className="flex items-center gap-2">
              <Languages className="size-3.5 shrink-0 text-slate-400" />
              <dt className="sr-only">Languages</dt>
              <dd className="truncate">{d.languages.join(', ')}</dd>
            </div>
          )}
          {d.room && (
            <div className="flex items-center gap-2">
              <MapPin className="size-3.5 shrink-0 text-slate-400" />
              <dt className="sr-only">Room</dt>
              <dd className="truncate">{d.room}</dd>
            </div>
          )}
        </dl>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className={cn('flex min-w-0 items-center gap-1.5 text-xs font-semibold', line.className)}>
            <span className={cn('size-1.5 shrink-0 rounded-full', line.dot)} />
            <span className="truncate">{line.text}</span>
          </span>
          <ModeChips modes={d.consultationModes} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-5 py-3">
        <Button asChild size="sm" variant="outline">
          <Link to={`/student/doctors/${d.id}`}>Profile</Link>
        </Button>
        <Button asChild size="sm" disabled={!d.isAccepting}>
          <Link
            to={d.isAccepting ? `/student/book?doctorId=${d.id}` : '#'}
            aria-disabled={!d.isAccepting}
            onClick={(e) => !d.isAccepting && e.preventDefault()}
            className={cn(!d.isAccepting && 'pointer-events-none opacity-50')}
          >
            <CalendarPlus /> Book
          </Link>
        </Button>
      </div>
    </article>
  );
}
