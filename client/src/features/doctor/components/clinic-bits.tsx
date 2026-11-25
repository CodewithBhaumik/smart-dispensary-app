import type { ReactNode } from 'react';
import { Building2, ShieldAlert, ShieldCheck, Video } from 'lucide-react';
import type { AppointmentMode } from '@shared/constants';
import type { Appointment } from '@shared/types';
import { ToneBadge } from '@/components/app';
import { formatDayLabel, formatTime, toDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';

/** "Dr. Ritu Bassi" → "Bassi" */
export function doctorSurname(name: string): string {
  const parts = name.replace(/^Dr\.?\s+/i, '').trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

export const todayStr = () => toDateStr(new Date());

export function isToday(date: string) {
  return date === todayStr();
}

/** In-person / video pill. */
export function ModeBadge({ mode, className, iconOnly = false }: { mode: AppointmentMode; className?: string; iconOnly?: boolean }) {
  const video = mode === 'video';
  if (iconOnly) {
    return (
      <span
        title={video ? 'Video consultation' : 'In-person visit'}
        aria-label={video ? 'Video consultation' : 'In-person visit'}
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md ring-1 ring-inset',
          video ? 'bg-violet-50 text-violet-600 ring-violet-600/15' : 'bg-slate-100 text-slate-500 ring-slate-500/10',
          className,
        )}
      >
        {video ? <Video className="size-3.5" /> : <Building2 className="size-3.5" />}
      </span>
    );
  }
  return (
    <ToneBadge
      tone={video ? 'violet' : 'slate'}
      icon={video ? <Video /> : <Building2 />}
      className={className}
    >
      {video ? 'Video' : 'In-person'}
    </ToneBadge>
  );
}

/** Queue token, e.g. "#04". */
export function TokenBadge({ token, className }: { token: number | null; className?: string }) {
  if (!token) return <span className={cn('text-xs text-slate-300', className)}>—</span>;
  return (
    <span
      className={cn(
        'inline-flex h-6 min-w-9 items-center justify-center rounded-md bg-slate-900 px-1.5 font-mono text-[11px] font-semibold tracking-wide text-white tabular-nums',
        className,
      )}
      aria-label={`Token ${token}`}
    >
      #{String(token).padStart(2, '0')}
    </span>
  );
}

/** Prominent allergy box — rose when allergies exist, calm emerald otherwise. */
export function AllergyAlert({ allergies, className, compact = false }: { allergies: string[]; className?: string; compact?: boolean }) {
  if (allergies.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[13px] font-medium text-emerald-800',
          className,
        )}
      >
        <ShieldCheck className="size-4 shrink-0 text-emerald-600" />
        No known drug allergies
      </div>
    );
  }
  return (
    <div className={cn('rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5', className)} role="alert">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-rose-800">
        <ShieldAlert className="size-4 shrink-0 text-rose-600" />
        {compact ? 'Allergies' : 'Allergy alert'}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {allergies.map((a) => (
          <span key={a} className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/20 ring-inset">
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Small neutral chips for conditions / medications. */
export function ChipList({ items, empty = 'None recorded', tone = 'slate' }: { items: string[]; empty?: string; tone?: 'slate' | 'amber' | 'blue' }) {
  if (items.length === 0) return <span className="text-sm text-muted-foreground">{empty}</span>;
  const cls =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-800 ring-amber-600/15'
      : tone === 'blue'
        ? 'bg-blue-50 text-blue-700 ring-blue-600/15'
        : 'bg-slate-100 text-slate-700 ring-slate-500/10';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => (
        <span key={i} className={cn('rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset', cls)}>
          {i}
        </span>
      ))}
    </div>
  );
}

/** "Today · 10:30 AM – 10:45 AM" */
export function whenLabel(a: Pick<Appointment, 'date' | 'startTime' | 'endTime'>): string {
  return `${formatDayLabel(a.date)} · ${formatTime(a.startTime)} – ${formatTime(a.endTime)}`;
}

/** Compact calendar block (day + month). */
export function DateBlock({ date, className }: { date: string; className?: string }) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    <div
      className={cn(
        'flex w-12 shrink-0 flex-col items-center justify-center rounded-lg border bg-white py-1.5 leading-none shadow-xs',
        className,
      )}
    >
      <span className="text-[10px] font-semibold tracking-wide text-teal-600 uppercase">
        {dt.toLocaleDateString('en-IN', { month: 'short' })}
      </span>
      <span className="mt-0.5 font-display text-lg font-semibold text-slate-900">{d}</span>
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[11px] font-semibold tracking-wider text-muted-foreground uppercase', className)}>{children}</p>;
}
