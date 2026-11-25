import { History, PackageMinus, PackageOpen, PackagePlus, Pencil, SlidersHorizontal, Trash2, type LucideIcon } from 'lucide-react';
import { STOCK_MOVEMENT_LABELS, type StockMovementType } from '@shared/constants';
import type { Medicine } from '@shared/types';
import { EmptyState, ErrorState, KeyValueGrid, ListSkeleton, StatusBadge, ToneBadge } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMedicine, useMovements } from './api';
import { ExpiryBadge, formatPrice, medicineSubtitle, StockBar } from './inventory-ui';

const MOVEMENT_META: Record<StockMovementType, { icon: LucideIcon; className: string }> = {
  initial: { icon: PackageOpen, className: 'bg-slate-100 text-slate-600' },
  restock: { icon: PackagePlus, className: 'bg-emerald-50 text-emerald-600' },
  dispense: { icon: PackageMinus, className: 'bg-indigo-50 text-indigo-600' },
  adjustment: { icon: SlidersHorizontal, className: 'bg-amber-50 text-amber-600' },
  expired_removal: { icon: Trash2, className: 'bg-rose-50 text-rose-600' },
};

/** Medicine detail + full stock movement ledger. */
export function StockHistorySheet({
  medicineId,
  onOpenChange,
  onEdit,
  onAdjust,
}: {
  medicineId: number | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (m: Medicine) => void;
  onAdjust: (m: Medicine) => void;
}) {
  const medicine = useMedicine(medicineId);
  const movements = useMovements(medicineId);
  const m = medicine.data;

  return (
    <Sheet open={medicineId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 bg-card p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5 pr-12">
          {m ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="stock" status={m.stockStatus} />
                {m.expiryStatus !== 'ok' && <StatusBadge kind="expiry" status={m.expiryStatus} noDot />}
                {m.requiresPrescription && <ToneBadge tone="violet">Rx only</ToneBadge>}
                {!m.isActive && <ToneBadge tone="slate">Inactive</ToneBadge>}
              </div>
              <SheetTitle className="font-display text-xl">{m.name}</SheetTitle>
              <SheetDescription>
                {medicineSubtitle(m)} · {m.category}
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="sr-only">Medicine details</SheetTitle>
              <SheetDescription className="sr-only">Loading medicine</SheetDescription>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-40" />
            </>
          )}
        </SheetHeader>

        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {medicine.isError && <ErrorState error={medicine.error} retry={() => medicine.refetch()} />}
          {m && (
            <>
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-[13px] font-medium text-muted-foreground">Current stock</span>
                  <span className="font-display text-2xl font-semibold text-slate-900">
                    {m.stockQuantity.toLocaleString('en-IN')}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">units</span>
                  </span>
                </div>
                <StockBar medicine={m} showNumbers={false} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Minimum stock {m.minStock} · bar shows up to {m.minStock * 3} units
                </p>
              </div>
              <KeyValueGrid
                columns={3}
                items={[
                  { label: 'Dispensing unit', value: m.unit },
                  { label: 'Batch', value: m.batchNo ?? '—' },
                  { label: 'Expiry', value: <ExpiryBadge medicine={m} /> },
                  { label: 'Manufacturer', value: m.manufacturer ?? '—' },
                  { label: 'Unit price', value: formatPrice(m.unitPrice) },
                  { label: 'Stock value', value: formatINR(m.unitPrice * m.stockQuantity) },
                  ...(m.description ? [{ label: 'Description', value: m.description, full: true }] : []),
                  ...(m.usageInstructions ? [{ label: 'Usage instructions', value: m.usageInstructions, full: true }] : []),
                ]}
              />
            </>
          )}

          <div>
            <div className="mb-3 flex items-center gap-2">
              <History className="size-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">Stock movements</h3>
              {movements.data && <span className="text-xs text-muted-foreground">({movements.data.length})</span>}
            </div>
            {movements.isLoading && <ListSkeleton rows={4} />}
            {movements.isError && <ErrorState error={movements.error} retry={() => movements.refetch()} />}
            {movements.data && movements.data.length === 0 && (
              <EmptyState compact icon={History} title="No movements yet" description="Restocks and dispensing will be recorded here." />
            )}
            {movements.data && movements.data.length > 0 && (
              <ol className="divide-y rounded-xl border">
                {movements.data.map((mv) => {
                  const meta = MOVEMENT_META[mv.type];
                  const positive = mv.quantityChange > 0;
                  return (
                    <li key={mv.id} className="flex items-start gap-3 px-4 py-3">
                      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', meta.className)}>
                        <meta.icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{STOCK_MOVEMENT_LABELS[mv.type]}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[mv.reference, mv.reason].filter(Boolean).join(' · ') || '—'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {formatDateTime(mv.createdAt)}
                          {mv.performedBy && <> · {mv.performedBy.name}</>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn('text-sm font-semibold tabular-nums', positive ? 'text-emerald-600' : 'text-rose-600')}>
                          {positive ? '+' : '−'}
                          {Math.abs(mv.quantityChange)}
                        </p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">Balance {mv.balanceAfter}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>

        {m && (
          <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-6 py-4">
            <Button variant="outline" onClick={() => onEdit(m)}>
              <Pencil /> Edit details
            </Button>
            <Button onClick={() => onAdjust(m)}>
              <SlidersHorizontal /> Adjust stock
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
