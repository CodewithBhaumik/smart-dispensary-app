import { format, isToday } from 'date-fns';
import type { DayAvailability } from '@shared/types';
import { Skeleton } from '@/components/ui/skeleton';
import { parseDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Horizontally scrollable day picker with free-slot counts. */
export function DateStrip({
  days,
  value,
  onChange,
  loading,
  className,
  allowFullDays = false,
}: {
  days: DayAvailability[] | undefined;
  value: string | null;
  onChange: (date: string) => void;
  loading?: boolean;
  className?: string;
  /** Let users click days with no free slots (e.g. profile preview). */
  allowFullDays?: boolean;
}) {
  if (loading || !days) {
    return (
      <div className={cn('flex gap-2 overflow-hidden', className)}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-[76px] shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn('scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pt-0.5 pb-2', className)}
      role="listbox"
      aria-label="Choose a date"
    >
      {days.map((day) => {
        const date = parseDate(day.date);
        const off = day.totalSlots === 0 && !day.onLeave;
        const full = !off && !day.onLeave && day.freeSlots === 0;
        const disabled = !allowFullDays && (day.onLeave || off || full);
        const selected = value === day.date;
        const status = day.onLeave
          ? 'On leave'
          : off
            ? 'No OPD'
            : full
              ? isToday(date)
                ? 'No slots'
                : 'Full'
              : `${day.freeSlots} free`;
        return (
          <button
            key={day.date}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={`${format(date, 'EEEE d MMMM')}, ${status}`}
            disabled={disabled}
            onClick={() => onChange(day.date)}
            className={cn(
              'flex w-[76px] shrink-0 flex-col items-center rounded-xl border px-2 pt-2.5 pb-2 transition-all duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
              selected
                ? 'border-primary bg-primary text-white shadow-[0_8px_18px_-8px_rgb(13_148_136/0.7)]'
                : disabled
                  ? 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50/70 text-slate-400'
                  : 'border-border bg-card text-slate-700 hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm',
            )}
          >
            <span
              className={cn(
                'text-[11px] font-semibold tracking-wide uppercase',
                selected ? 'text-teal-50' : isToday(date) ? 'text-primary' : 'text-slate-500',
              )}
            >
              {isToday(date) ? 'Today' : format(date, 'EEE')}
            </span>
            <span className="font-display text-[22px] leading-7 font-semibold tabular-nums">{format(date, 'd')}</span>
            <span className={cn('text-[11px]', selected ? 'text-teal-50' : 'text-slate-500')}>{format(date, 'MMM')}</span>
            <span
              className={cn(
                'mt-1.5 rounded-full px-1.5 py-px text-[10px] font-semibold whitespace-nowrap',
                selected
                  ? 'bg-white/20 text-white'
                  : day.onLeave
                    ? 'bg-amber-50 text-amber-700'
                    : off || full
                      ? 'bg-slate-100 text-slate-400'
                      : 'bg-emerald-50 text-emerald-700',
              )}
            >
              {status}
            </span>
          </button>
        );
      })}
    </div>
  );
}
