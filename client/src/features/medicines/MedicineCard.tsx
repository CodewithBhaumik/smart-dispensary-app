import type { ReactNode } from 'react';
import { Check, Lock, Plus } from 'lucide-react';
import type { Medicine } from '@shared/types';
import { ToneBadge } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { AvailabilityBadge, formIcon, medicineSubtitle, RxBadge } from './medicine-meta';
import { QuantityStepper } from './QuantityStepper';

export type AddState =
  | { kind: 'addable'; max: number }
  | { kind: 'in_cart'; quantity: number; max: number }
  | { kind: 'out_of_stock' }
  | { kind: 'needs_prescription' };

export function DisabledWithTooltip({ tip, children }: { tip: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/30 focus-visible:outline-none">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

export function AddControl({
  medicine,
  state,
  onAdd,
  onQuantity,
  size = 'sm',
}: {
  medicine: Medicine;
  state: AddState;
  onAdd: () => void;
  onQuantity: (qty: number) => void;
  size?: 'sm' | 'default';
}) {
  if (state.kind === 'in_cart') {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1 text-xs font-medium text-emerald-700 sm:inline-flex">
          <Check className="size-3.5" /> Added
        </span>
        <QuantityStepper value={state.quantity} max={state.max} min={0} label={medicine.name} onChange={onQuantity} />
      </div>
    );
  }
  if (state.kind === 'out_of_stock') {
    return (
      <Button size={size} variant="outline" disabled>
        Out of stock
      </Button>
    );
  }
  if (state.kind === 'needs_prescription') {
    return (
      <DisabledWithTooltip tip="Needs a prescription from a doctor">
        <Button size={size} variant="outline" disabled>
          <Lock /> Prescription only
        </Button>
      </DisabledWithTooltip>
    );
  }
  return (
    <Button size={size} variant="soft" onClick={onAdd} aria-label={`Add ${medicine.name} to request list`}>
      <Plus /> Add
    </Button>
  );
}

export function MedicineCard({
  medicine,
  state,
  onOpen,
  onAdd,
  onQuantity,
}: {
  medicine: Medicine;
  state: AddState;
  onOpen: () => void;
  onAdd: () => void;
  onQuantity: (qty: number) => void;
}) {
  const Icon = formIcon(medicine.form);
  return (
    <article
      className={cn(
        'group flex h-full min-w-0 flex-col rounded-xl border bg-card shadow-xs transition-all hover:border-slate-300 hover:shadow-md',
        state.kind === 'in_cart' && 'border-teal-300 ring-1 ring-teal-500/20',
      )}
    >
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-3 p-4 text-left" aria-label={`View details for ${medicine.name}`}>
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-600 ring-1 ring-teal-600/10">
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold leading-snug text-slate-900 group-hover:text-teal-800">{medicine.name}</p>
            {medicine.genericName && <p className="truncate text-xs text-muted-foreground">{medicine.genericName}</p>}
            <p className="mt-0.5 text-xs text-slate-500">{medicineSubtitle(medicine)}</p>
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          <ToneBadge tone="slate">{medicine.category}</ToneBadge>
          <AvailabilityBadge medicine={medicine} />
          {medicine.requiresPrescription && <RxBadge />}
        </div>
      </button>
      <div className="flex items-center justify-end border-t border-border/70 px-4 py-2.5">
        <AddControl medicine={medicine} state={state} onAdd={onAdd} onQuantity={onQuantity} />
      </div>
    </article>
  );
}
