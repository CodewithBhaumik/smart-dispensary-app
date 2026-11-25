import { useId, useState } from 'react';
import { AlertTriangle, Check, PackageX, Pill, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { DOSE_INSTRUCTIONS, FREQUENCIES, type FrequencyCode, type StockStatus } from '@shared/constants';
import type { Medicine } from '@shared/types';
import { EmptyState, StatusBadge, ToneBadge } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { PrescriptionItemInput } from './api';
import { allergyConflicts, defaultDosage, defaultDuration, defaultFrequency, estimateQuantity } from './rx-utils';

export interface DraftItem {
  key: string;
  medicineId: number;
  medicineName: string;
  genericName: string | null;
  form: string;
  strength: string | null;
  unit: string;
  requiresPrescription: boolean;
  stockQuantity: number;
  stockStatus: StockStatus;
  dosage: string;
  frequency: FrequencyCode;
  durationDays: string;
  quantity: string;
  quantityTouched: boolean;
  instructions: string;
  notes: string;
}

export type ItemErrors = Partial<Record<'dosage' | 'frequency' | 'durationDays' | 'quantity', string>>;

export function newDraftItem(med: Medicine): DraftItem {
  const frequency = defaultFrequency(med.form);
  const duration = defaultDuration(med.form);
  const dosage = defaultDosage(med.form);
  return {
    key: `${med.id}-${Date.now()}`,
    medicineId: med.id,
    medicineName: med.name,
    genericName: med.genericName,
    form: med.form,
    strength: med.strength,
    unit: med.unit,
    requiresPrescription: med.requiresPrescription,
    stockQuantity: med.stockQuantity,
    stockStatus: med.stockStatus,
    dosage,
    frequency,
    durationDays: String(duration),
    quantity: String(estimateQuantity(med, frequency, duration, dosage).quantity),
    quantityTouched: false,
    instructions: ['Ointment', 'Cream', 'Gel'].includes(med.form) ? 'Apply locally' : med.form === 'Sachet' ? 'Dissolve in 1 litre of water' : 'After food',
    notes: '',
  };
}

export function validateItems(items: DraftItem[]): Record<string, ItemErrors> {
  const errors: Record<string, ItemErrors> = {};
  for (const item of items) {
    const e: ItemErrors = {};
    if (!item.dosage.trim()) e.dosage = 'Enter a dosage';
    if (!item.frequency) e.frequency = 'Choose a frequency';
    const d = Number(item.durationDays);
    if (!Number.isInteger(d) || d < 1 || d > 90) e.durationDays = '1–90 days';
    const q = Number(item.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 100) e.quantity = '1–100 units';
    if (Object.keys(e).length) errors[item.key] = e;
  }
  return errors;
}

export function toItemInput(item: DraftItem): PrescriptionItemInput {
  return {
    medicineId: item.medicineId,
    dosage: item.dosage.trim(),
    frequency: item.frequency,
    durationDays: Number(item.durationDays),
    quantity: Number(item.quantity),
    instructions: item.instructions.trim() || null,
    notes: item.notes.trim() || null,
  };
}

function MedicinePicker({
  medicines,
  selectedIds,
  allergies,
  onPick,
  loading,
}: {
  medicines: Medicine[];
  selectedIds: number[];
  allergies: string[];
  onPick: (m: Medicine) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="border-dashed" disabled={loading}>
          <Plus /> Add medicine
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(440px,calc(100vw-32px))] p-0">
        <Command>
          <CommandInput placeholder="Search formulary by name, generic or category…" />
          <CommandList className="max-h-[340px]">
            <CommandEmpty>No medicine found.</CommandEmpty>
            <CommandGroup heading="Dispensary formulary">
              {medicines.map((m) => {
                const added = selectedIds.includes(m.id);
                const conflict = allergyConflicts(m, allergies).length > 0;
                return (
                  <CommandItem
                    key={m.id}
                    value={`${m.name} ${m.genericName ?? ''} ${m.category} ${m.form}`}
                    disabled={added}
                    onSelect={() => {
                      onPick(m);
                      setOpen(false);
                    }}
                    className="items-start gap-3 py-2"
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
                        conflict ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600',
                      )}
                    >
                      {conflict ? <ShieldAlert className="size-3.5" /> : <Pill className="size-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{m.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[m.genericName, m.form, m.unit].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {added ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                          <Check className="size-3.5" /> Added
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'text-[11px] font-semibold tabular-nums',
                            m.stockStatus === 'out_of_stock' ? 'text-rose-600' : m.stockStatus === 'low_stock' ? 'text-amber-600' : 'text-emerald-600',
                          )}
                        >
                          {m.stockStatus === 'out_of_stock' ? 'Out of stock' : `${m.stockQuantity} in stock`}
                        </span>
                      )}
                      {m.requiresPrescription && <span className="text-[10px] font-semibold text-violet-600 uppercase">Rx</span>}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ItemRow({
  item,
  index,
  errors,
  allergies,
  onChange,
  onRemove,
  disabled,
}: {
  item: DraftItem;
  index: number;
  errors?: ItemErrors;
  allergies: string[];
  onChange: (next: DraftItem) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const conflicts = allergyConflicts({ name: item.medicineName, genericName: item.genericName }, allergies);
  const estimate = estimateQuantity(item, item.frequency, Number(item.durationDays) || 0, item.dosage);

  /** Applies a change and keeps the auto-quantity in sync until the doctor edits it by hand. */
  const update = (patch: Partial<DraftItem>) => {
    const next = { ...item, ...patch };
    if (!next.quantityTouched && ('frequency' in patch || 'durationDays' in patch || 'dosage' in patch)) {
      next.quantity = String(estimateQuantity(next, next.frequency, Number(next.durationDays) || 0, next.dosage).quantity);
    }
    onChange(next);
  };

  return (
    <div className={cn('rounded-xl border bg-white p-4 shadow-xs', conflicts.length > 0 && 'border-rose-200 ring-1 ring-rose-100')}>
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-xs font-semibold text-white">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{item.medicineName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[item.genericName, item.form, item.unit].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          {item.requiresPrescription && <ToneBadge tone="violet">Rx only</ToneBadge>}
          <StatusBadge kind="stock" status={item.stockStatus} noDot />
        </div>
        {!disabled && (
          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.medicineName}`} onClick={onRemove} className="text-slate-400 hover:text-rose-600">
            <Trash2 />
          </Button>
        )}
      </div>

      {conflicts.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800" role="alert">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-rose-600" />
          <span>
            <span className="font-semibold">Allergy alert:</span> patient is allergic to {conflicts.join(', ')}. Review before prescribing{' '}
            {item.medicineName}.
          </span>
        </div>
      )}
      {item.stockStatus === 'out_of_stock' && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <PackageX className="size-4 shrink-0" /> Out of stock at the dispensary — the student will be told it is unavailable.
        </div>
      )}
      {item.stockStatus !== 'out_of_stock' && Number(item.quantity) > item.stockQuantity && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <AlertTriangle className="size-4 shrink-0" /> Only {item.stockQuantity} in stock.
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-dosage`} className="text-xs text-slate-600">
            Dosage
          </Label>
          <Input
            id={`${uid}-dosage`}
            value={item.dosage}
            onChange={(e) => update({ dosage: e.target.value })}
            aria-invalid={Boolean(errors?.dosage)}
            disabled={disabled}
            placeholder="1 tablet"
          />
          {errors?.dosage && <p className="text-xs text-rose-600">{errors.dosage}</p>}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-600">Frequency</Label>
          <Select value={item.frequency} onValueChange={(v) => update({ frequency: v as FrequencyCode })} disabled={disabled}>
            <SelectTrigger className="w-full" aria-label="Frequency" aria-invalid={Boolean(errors?.frequency)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-days`} className="text-xs text-slate-600">
            Duration
          </Label>
          <div className="relative">
            <Input
              id={`${uid}-days`}
              type="number"
              min={1}
              max={90}
              inputMode="numeric"
              value={item.durationDays}
              onChange={(e) => update({ durationDays: e.target.value })}
              aria-invalid={Boolean(errors?.durationDays)}
              disabled={disabled}
              className="pr-12"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">days</span>
          </div>
          {errors?.durationDays && <p className="text-xs text-rose-600">{errors.durationDays}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-qty`} className="text-xs text-slate-600">
            Quantity
          </Label>
          <Input
            id={`${uid}-qty`}
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            value={item.quantity}
            onChange={(e) => onChange({ ...item, quantity: e.target.value, quantityTouched: true })}
            aria-invalid={Boolean(errors?.quantity)}
            disabled={disabled}
          />
          {errors?.quantity ? (
            <p className="text-xs text-rose-600">{errors.quantity}</p>
          ) : (
            <p className="truncate text-[11px] text-muted-foreground" title={estimate.hint ?? undefined}>
              {item.quantityTouched ? `Units: ${item.unit}` : estimate.hint}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-instr`} className="text-xs text-slate-600">
            Instructions
          </Label>
          <Input
            id={`${uid}-instr`}
            list={`${uid}-instr-list`}
            value={item.instructions}
            onChange={(e) => onChange({ ...item, instructions: e.target.value })}
            disabled={disabled}
            placeholder="After food"
          />
          <datalist id={`${uid}-instr-list`}>
            {DOSE_INSTRUCTIONS.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-notes`} className="text-xs text-slate-600">
            Notes <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`${uid}-notes`}
            value={item.notes}
            onChange={(e) => onChange({ ...item, notes: e.target.value })}
            disabled={disabled}
            placeholder="e.g. Stop if rash develops"
          />
        </div>
      </div>
    </div>
  );
}

/** Editable list of prescription rows with a formulary picker and allergy checks. */
export function PrescriptionBuilder({
  items,
  onChange,
  medicines,
  allergies,
  errors = {},
  loadingMedicines,
  disabled,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  medicines: Medicine[];
  allergies: string[];
  errors?: Record<string, ItemErrors>;
  loadingMedicines?: boolean;
  disabled?: boolean;
}) {
  const add = (m: Medicine) => onChange([...items, newDraftItem(m)]);
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/30">
          <EmptyState
            compact
            icon={Pill}
            title="No medicines added"
            description="Add medicines from the dispensary formulary, or complete the consultation without a prescription."
            action={
              !disabled && (
                <MedicinePicker medicines={medicines} selectedIds={[]} allergies={allergies} onPick={add} loading={loadingMedicines} />
              )
            }
          />
        </div>
      ) : (
        <>
          {items.map((item, i) => (
            <ItemRow
              key={item.key}
              item={item}
              index={i}
              errors={errors[item.key]}
              allergies={allergies}
              disabled={disabled}
              onChange={(next) => onChange(items.map((it) => (it.key === item.key ? next : it)))}
              onRemove={() => onChange(items.filter((it) => it.key !== item.key))}
            />
          ))}
          {!disabled && items.length < 15 && (
            <MedicinePicker
              medicines={medicines}
              selectedIds={items.map((i) => i.medicineId)}
              allergies={allergies}
              onPick={add}
              loading={loadingMedicines}
            />
          )}
        </>
      )}
    </div>
  );
}
