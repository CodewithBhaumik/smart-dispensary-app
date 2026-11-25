import { useEffect, useState } from 'react';
import { ArrowRight, Loader2, Minus, PackagePlus, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Medicine } from '@shared/types';
import { Field } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAdjustStock, type AdjustType } from './api';

type AdjustableMedicine = Pick<
  Medicine,
  'id' | 'name' | 'stockQuantity' | 'minStock' | 'unit' | 'batchNo' | 'expiryDate' | 'form' | 'strength'
>;

const TYPES: { value: AdjustType; label: string; hint: string; icon: typeof PackagePlus }[] = [
  { value: 'restock', label: 'Restock', hint: 'New delivery received', icon: PackagePlus },
  { value: 'adjustment', label: 'Correction', hint: 'Fix a count (+ or −)', icon: SlidersHorizontal },
  { value: 'expired_removal', label: 'Remove expired', hint: 'Discard expired units', icon: Trash2 },
];

const REASONS: Record<AdjustType, string[]> = {
  restock: ['Supplier delivery', 'Transfer from central store', 'Emergency purchase'],
  adjustment: ['Physical count correction', 'Damaged packaging', 'Data entry correction'],
  expired_removal: ['Batch expired', 'Recalled by manufacturer'],
};

/** Records a stock movement: restock, signed correction, or expired removal. */
export function AdjustStockDialog({
  open,
  onOpenChange,
  medicine,
  defaultType = 'restock',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicine: AdjustableMedicine | null;
  defaultType?: AdjustType;
}) {
  const adjust = useAdjustStock();
  const [type, setType] = useState<AdjustType>(defaultType);
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setQuantity('');
      setReason(REASONS[defaultType][0]);
      setBatchNo('');
      setExpiryDate('');
      setError(null);
    }
  }, [open, defaultType]);

  if (!medicine) return null;

  const parsed = quantity.trim() === '' ? NaN : Number(quantity);
  const validNumber = Number.isInteger(parsed) && (type === 'adjustment' ? parsed !== 0 : parsed > 0);
  const delta = !validNumber ? 0 : type === 'restock' ? parsed : type === 'expired_removal' ? -parsed : parsed;
  const after = medicine.stockQuantity + delta;
  const negative = after < 0;

  const changeType = (t: AdjustType) => {
    setType(t);
    setReason(REASONS[t][0]);
    setError(null);
  };

  const submit = async () => {
    if (!validNumber) {
      setError(
        type === 'adjustment' ? 'Enter a whole number other than zero (use − to remove units).' : 'Enter a whole number greater than zero.',
      );
      return;
    }
    if (negative) {
      setError(`Only ${medicine.stockQuantity} units are in stock.`);
      return;
    }
    if (type !== 'restock' && !reason.trim()) {
      setError('Add a short reason for the audit log.');
      return;
    }
    try {
      const res = await adjust.mutateAsync({
        id: medicine.id,
        body: {
          type,
          quantity: parsed,
          reason: reason.trim() || null,
          ...(type === 'restock' ? { batchNo: batchNo.trim() || null, expiryDate: expiryDate || null } : {}),
        },
      });
      toast.success(
        type === 'restock' ? 'Stock replenished' : type === 'expired_removal' ? 'Expired stock removed' : 'Stock corrected',
        { description: `${res.medicine.name}: ${medicine.stockQuantity} → ${res.medicine.stockQuantity} units` },
      );
      onOpenChange(false);
    } catch (e) {
      setError(getErrorMessage(e));
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !adjust.isPending && onOpenChange(o)}>
      <DialogContent className="gap-0 bg-card p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="font-display">Adjust stock</DialogTitle>
          <DialogDescription>
            {medicine.name} · {medicine.unit}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="space-y-5 px-6 py-5"
        >
          <div role="radiogroup" aria-label="Adjustment type" className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => {
              const active = t.value === type;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => changeType(t.value)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                    active ? 'border-primary bg-teal-50/60 ring-2 ring-primary/15' : 'hover:border-slate-300 hover:bg-muted/40',
                  )}
                >
                  <t.icon className={cn('size-4', active ? 'text-primary' : 'text-slate-400')} />
                  <span className="text-[13px] font-semibold text-slate-900">{t.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">{t.hint}</span>
                </button>
              );
            })}
          </div>

          <Field
            label={type === 'adjustment' ? 'Change in units (+/−)' : 'Quantity (units)'}
            htmlFor="adj-qty"
            required
            hint={type === 'adjustment' ? 'Example: 5 adds five units, −3 removes three.' : undefined}
          >
            <div className="flex gap-2">
              <Input
                id="adj-qty"
                inputMode="numeric"
                autoFocus
                placeholder={type === 'adjustment' ? 'e.g. -3' : 'e.g. 100'}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value.replace(/[^\d-]/g, ''));
                  setError(null);
                }}
                aria-invalid={!!error}
              />
              {type === 'restock' &&
                [50, 100, 200].map((n) => (
                  <Button key={n} type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setQuantity(String(n))}>
                    +{n}
                  </Button>
                ))}
            </div>
          </Field>

          <div
            className={cn(
              'flex items-center justify-between rounded-lg border px-4 py-3',
              negative ? 'border-rose-200 bg-rose-50' : 'bg-muted/40',
            )}
          >
            <span className="text-[13px] text-muted-foreground">Stock after this change</span>
            <span className="flex items-center gap-2 font-display text-base font-semibold tabular-nums">
              <span className="text-slate-500">{medicine.stockQuantity}</span>
              <ArrowRight className="size-4 text-slate-400" />
              <span className={cn(negative ? 'text-rose-600' : delta < 0 ? 'text-amber-700' : delta > 0 ? 'text-emerald-700' : 'text-slate-900')}>
                {validNumber ? after : '—'}
              </span>
            </span>
          </div>

          <Field label="Reason" htmlFor="adj-reason" required={type !== 'restock'}>
            <Input id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is stock changing?" />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {REASONS[type].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    reason === r ? 'border-teal-300 bg-teal-50 text-teal-800' : 'text-slate-600 hover:border-slate-300',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>

          {type === 'restock' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New batch no." htmlFor="adj-batch" hint={medicine.batchNo ? `Current: ${medicine.batchNo}` : 'Optional'}>
                <Input id="adj-batch" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="Leave blank to keep" />
              </Field>
              <Field label="New expiry date" htmlFor="adj-expiry" hint="Optional — for the new batch">
                <Input id="adj-expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </Field>
            </div>
          )}

          {error && (
            <p className="flex items-center gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
              <Minus className="size-4" /> {error}
            </p>
          )}

          <DialogFooter className="-mx-6 -mb-5 border-t bg-muted/30 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={adjust.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjust.isPending}>
              {adjust.isPending && <Loader2 className="animate-spin" />}
              {type === 'restock' ? 'Add stock' : type === 'expired_removal' ? 'Remove units' : 'Save correction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
