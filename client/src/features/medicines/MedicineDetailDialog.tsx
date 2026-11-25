import { Info } from 'lucide-react';
import type { Medicine } from '@shared/types';
import { KeyValueGrid, ToneBadge } from '@/components/app';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AddControl, type AddState } from './MedicineCard';
import { AvailabilityBadge, formIcon, RxBadge } from './medicine-meta';

export function MedicineDetailDialog({
  medicine,
  state,
  onClose,
  onAdd,
  onQuantity,
}: {
  medicine: Medicine | null;
  state: AddState | null;
  onClose: () => void;
  onAdd: () => void;
  onQuantity: (qty: number) => void;
}) {
  const Icon = medicine ? formIcon(medicine.form) : Info;
  return (
    <Dialog open={medicine !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto bg-card sm:max-w-lg">
        {medicine && state && (
          <>
            <DialogHeader className="text-left">
              <div className="flex items-start gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-600 ring-1 ring-teal-600/10">
                  <Icon className="size-6" />
                </span>
                <div className="min-w-0 space-y-1">
                  <DialogTitle className="font-display text-lg">{medicine.name}</DialogTitle>
                  <DialogDescription>{medicine.genericName ?? medicine.category}</DialogDescription>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <ToneBadge tone="slate">{medicine.category}</ToneBadge>
                    <AvailabilityBadge medicine={medicine} />
                    {medicine.requiresPrescription && <RxBadge />}
                  </div>
                </div>
              </div>
            </DialogHeader>

            <KeyValueGrid
              className="rounded-xl border bg-muted/30 p-4"
              items={[
                { label: 'Form', value: medicine.form },
                { label: 'Strength', value: medicine.strength ?? '—' },
                { label: 'Dispensed as', value: medicine.unit },
                { label: 'Manufacturer', value: medicine.manufacturer ?? '—' },
              ]}
            />

            {medicine.description && (
              <div>
                <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">About</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{medicine.description}</p>
              </div>
            )}
            {medicine.usageInstructions && (
              <div className="rounded-xl border border-teal-200/70 bg-teal-50/50 p-4">
                <p className="text-xs font-semibold tracking-wider text-teal-800 uppercase">General usage</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{medicine.usageInstructions}</p>
              </div>
            )}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              General information only — always follow your doctor&apos;s advice and the label instructions.
            </p>

            <DialogFooter className="items-center sm:justify-between">
              <span className="text-xs text-muted-foreground">
                {state.kind === 'needs_prescription'
                  ? 'Available on a doctor’s prescription'
                  : state.kind === 'out_of_stock'
                    ? 'Currently unavailable at the dispensary'
                    : 'Add to your request list'}
              </span>
              <AddControl medicine={medicine} state={state} onAdd={onAdd} onQuantity={onQuantity} size="default" />
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
