import { CalendarX2, Moon, Sun, Sunrise, type LucideIcon } from 'lucide-react';
import type { Slot } from '@shared/types';
import { EmptyState } from '@/components/app';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SLOT_REASON_LABELS, slotPeriod } from '../utils';

const PERIODS: { key: 'morning' | 'afternoon' | 'evening'; label: string; icon: LucideIcon }[] = [
  { key: 'morning', label: 'Morning', icon: Sunrise },
  { key: 'afternoon', label: 'Afternoon', icon: Sun },
  { key: 'evening', label: 'Evening', icon: Moon },
];

/** Time-slot picker grouped by part of day; unavailable slots explain why. */
export function SlotGrid({
  slots,
  value,
  onChange,
  loading,
  className,
}: {
  slots: Slot[] | undefined;
  value: string | null;
  onChange: (time: string) => void;
  loading?: boolean;
  className?: string;
}) {
  if (loading || !slots) {
    return (
      <div className={cn('grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5', className)}>
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-lg" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <EmptyState
        compact
        icon={CalendarX2}
        title="No OPD hours on this day"
        description="This doctor doesn't consult on the selected date. Pick another day above."
        className={className}
      />
    );
  }

  const freeCount = slots.filter((s) => s.available).length;

  return (
    <div className={cn('space-y-5', className)}>
      {freeCount === 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Every slot on this day is taken or has passed — please choose another date.
        </p>
      )}
      {PERIODS.map((period) => {
        const group = slots.filter((s) => slotPeriod(s.time) === period.key);
        if (group.length === 0) return null;
        const free = group.filter((s) => s.available).length;
        return (
          <div key={period.key} className="space-y-2.5">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-700">
              <period.icon className="size-4 text-slate-400" />
              {period.label}
              <span className="font-normal text-muted-foreground">
                · {free} of {group.length} available
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
              {group.map((slot) => {
                const selected = value === slot.time;
                const button = (
                  <button
                    type="button"
                    disabled={!slot.available}
                    aria-pressed={selected}
                    onClick={() => onChange(slot.time)}
                    className={cn(
                      'h-10 w-full rounded-lg border text-[13px] font-semibold tabular-nums transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                      selected
                        ? 'border-primary bg-primary text-white shadow-[0_6px_14px_-6px_rgb(13_148_136/0.7)]'
                        : slot.available
                          ? 'border-border bg-card text-slate-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-800'
                          : 'pointer-events-none border-dashed border-slate-200 bg-slate-50 text-slate-400 line-through decoration-slate-300',
                    )}
                  >
                    {formatTime(slot.time)}
                  </button>
                );
                if (slot.available) return <div key={slot.time}>{button}</div>;
                return (
                  <Tooltip key={slot.time}>
                    <TooltipTrigger asChild>
                      <span tabIndex={0} className="block rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
                        {button}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{slot.reason ? SLOT_REASON_LABELS[slot.reason] : 'Unavailable'}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
