import type { Medicine } from '@shared/types';
import { ToneBadge, type Tone } from '@/components/app';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const BAR_COLOR: Record<Medicine['stockStatus'], string> = {
  in_stock: 'bg-emerald-500',
  low_stock: 'bg-amber-500',
  out_of_stock: 'bg-rose-500',
};

/** Stock level bar: full width = 3× minimum stock; the tick marks the minimum. */
export function StockBar({
  medicine,
  className,
  showNumbers = true,
}: {
  medicine: Pick<Medicine, 'stockQuantity' | 'minStock' | 'stockStatus' | 'unit'>;
  className?: string;
  showNumbers?: boolean;
}) {
  const scale = Math.max(medicine.minStock * 3, 1);
  const pct = Math.min(100, (medicine.stockQuantity / scale) * 100);
  const tick = Math.min(100, (medicine.minStock / scale) * 100);
  return (
    <div className={cn('min-w-[120px] space-y-1.5', className)}>
      {showNumbers && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span
            className={cn(
              'font-semibold tabular-nums',
              medicine.stockStatus === 'out_of_stock'
                ? 'text-rose-600'
                : medicine.stockStatus === 'low_stock'
                  ? 'text-amber-700'
                  : 'text-slate-900',
            )}
          >
            {medicine.stockQuantity.toLocaleString('en-IN')}
          </span>
          <span className="text-muted-foreground">min {medicine.minStock}</span>
        </div>
      )}
      <div
        className="relative h-1.5 w-full overflow-visible rounded-full bg-slate-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={medicine.stockQuantity}
        aria-label={`Stock ${medicine.stockQuantity}, minimum ${medicine.minStock}`}
      >
        <div className={cn('h-full rounded-full transition-[width]', BAR_COLOR[medicine.stockStatus])} style={{ width: `${pct}%` }} />
        <span className="absolute -top-0.5 h-2.5 w-px bg-slate-400" style={{ left: `${tick}%` }} aria-hidden />
      </div>
    </div>
  );
}

/** "Expires in 23 days" style badge for a medicine's expiry. */
export function ExpiryBadge({ medicine, className }: { medicine: Pick<Medicine, 'expiryDate' | 'expiryStatus' | 'daysToExpiry'>; className?: string }) {
  if (!medicine.expiryDate || medicine.daysToExpiry === null) {
    return <span className={cn('text-xs text-muted-foreground', className)}>No expiry</span>;
  }
  const days = medicine.daysToExpiry;
  let tone: Tone = 'slate';
  let label = `${days} days left`;
  if (medicine.expiryStatus === 'expired') {
    tone = 'rose';
    label = days === 0 ? 'Expires today' : `Expired ${Math.abs(days)}d ago`;
  } else if (medicine.expiryStatus === 'expiring') {
    tone = days <= 30 ? 'orange' : 'amber';
    label = days === 0 ? 'Expires today' : `${days} days left`;
  } else if (days > 365) {
    label = `${Math.round(days / 30)} months left`;
  }
  return (
    <div className={cn('flex flex-col items-start gap-1', className)}>
      <span className="text-[13px] text-slate-700">{formatDate(medicine.expiryDate)}</span>
      {medicine.expiryStatus === 'ok' ? (
        <span className="text-[11px] text-muted-foreground">{label}</span>
      ) : (
        <ToneBadge tone={tone} className="h-5 px-2 text-[11px]">
          {label}
        </ToneBadge>
      )}
    </div>
  );
}

const priceFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Unit price with paise, e.g. "₹98.50". */
export const formatPrice = (value: number) => priceFormat.format(value);

/** "Tablet · 500 mg" */
export function medicineSubtitle(m: Pick<Medicine, 'form' | 'strength' | 'genericName'>): string {
  return [m.genericName, [m.form, m.strength].filter(Boolean).join(' · ')].filter(Boolean).join(' — ');
}
