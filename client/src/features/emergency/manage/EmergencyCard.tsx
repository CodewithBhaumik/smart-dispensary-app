import { Clock, Droplet, HeartPulse, MapPin, Phone, UserRoundCheck } from 'lucide-react';
import type { Emergency } from '@shared/types';
import { StatusBadge, UserAvatar } from '@/components/app';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmergencyActions } from './EmergencyActions';

export const SEVERITY_STRIP: Record<Emergency['severity'], string> = {
  critical: 'bg-rose-500',
  high: 'bg-orange-500',
  moderate: 'bg-amber-400',
};

/** Summary card for the emergency board. */
export function EmergencyCard({ emergency: e, onOpen }: { emergency: Emergency; onOpen: () => void }) {
  const resolved = e.status === 'resolved';
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'group relative flex cursor-pointer overflow-hidden rounded-xl border bg-card shadow-xs transition-all hover:border-slate-300 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none',
        resolved && 'opacity-80',
      )}
    >
      <span className={cn('w-1.5 shrink-0', resolved ? 'bg-emerald-400' : SEVERITY_STRIP[e.severity])} aria-hidden />
      <div className="min-w-0 flex-1 space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-[15px] font-semibold text-slate-900">{e.category}</h3>
              <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3" /> Reported {timeAgo(e.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!resolved && <StatusBadge kind="severity" status={e.severity} />}
            <StatusBadge kind="emergency" status={e.status} />
          </div>
        </div>

        <p className="line-clamp-2 text-sm text-slate-700">{e.description}</p>

        <div className="grid gap-2 text-[13px] text-slate-600 sm:grid-cols-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{e.location}</span>
          </span>
          <a
            href={`tel:${e.contactPhone.replace(/\s/g, '')}`}
            onClick={(ev) => ev.stopPropagation()}
            className="flex items-center gap-1.5 hover:text-primary"
          >
            <Phone className="size-3.5 text-slate-400" /> {e.contactPhone}
          </a>
        </div>

        <div className="flex flex-col gap-3 border-t pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <UserAvatar user={e.student} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-slate-900">{e.student.name}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span>{e.student.rollNo}</span>
                {e.student.bloodGroup && (
                  <span className="inline-flex items-center gap-0.5">
                    <Droplet className="size-3 text-rose-400" /> {e.student.bloodGroup}
                  </span>
                )}
                {e.student.allergies.length > 0 && (
                  <span className="inline-flex items-center gap-0.5 font-medium text-rose-600">
                    <HeartPulse className="size-3" /> Allergy: {e.student.allergies.join(', ')}
                  </span>
                )}
              </p>
            </div>
          </div>
          {e.responderName && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              <UserRoundCheck className="size-3.5 text-blue-500" /> {e.responderName}
            </span>
          )}
          {!resolved && <EmergencyActions emergency={e} size="xs" className="lg:justify-end" />}
        </div>
      </div>
    </article>
  );
}
