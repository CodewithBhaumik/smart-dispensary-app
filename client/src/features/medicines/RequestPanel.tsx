import { ClipboardList, FileText, Loader2, MapPin, Send, Store, Trash2, Truck, X } from 'lucide-react';
import { FULFILMENT_LABELS, type FulfilmentMethod } from '@shared/constants';
import type { Prescription } from '@shared/types';
import { EmptyState, Field } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CartItem } from './cart';
import { formIcon } from './medicine-meta';
import { QuantityStepper } from './QuantityStepper';

const FULFILMENT_OPTIONS: { value: FulfilmentMethod; icon: typeof Store; hint: string }[] = [
  { value: 'pickup', icon: Store, hint: 'Collect at the dispensary counter' },
  { value: 'delivery', icon: Truck, hint: 'Delivered to your hostel or block' },
];

export interface RequestPanelProps {
  items: CartItem[];
  prescription: Prescription | null;
  fulfilment: FulfilmentMethod;
  location: string;
  notes: string;
  locationError?: string | null;
  submitting: boolean;
  onQuantity: (medicineId: number, quantity: number) => void;
  onRemove: (medicineId: number) => void;
  onClear: () => void;
  onFulfilment: (value: FulfilmentMethod) => void;
  onLocation: (value: string) => void;
  onNotes: (value: string) => void;
  onSubmit: () => void;
  className?: string;
}

export function RequestPanel({
  items,
  prescription,
  fulfilment,
  location,
  notes,
  locationError,
  submitting,
  onQuantity,
  onRemove,
  onClear,
  onFulfilment,
  onLocation,
  onNotes,
  onSubmit,
  className,
}: RequestPanelProps) {
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <section className={cn('flex flex-col rounded-xl border bg-card shadow-xs', className)} aria-label="Request list">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-8 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-teal-600/10">
            <ClipboardList className="size-4" />
          </span>
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Request list</h2>
            <p className="text-xs text-muted-foreground">
              {items.length ? `${items.length} ${items.length === 1 ? 'medicine' : 'medicines'} · ${totalUnits} units` : 'Nothing added yet'}
            </p>
          </div>
        </div>
        {items.length > 0 && (
          <Button variant="ghost" size="xs" onClick={onClear} className="text-slate-500">
            <Trash2 /> Clear
          </Button>
        )}
      </header>

      {prescription && (
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800 ring-1 ring-violet-600/15 ring-inset">
          <FileText className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Linked to <span className="font-mono font-semibold">{prescription.code}</span> · {prescription.doctor.name}
          </span>
        </div>
      )}

      <div className="px-5 py-4">
        {items.length === 0 ? (
          <EmptyState
            compact
            icon={ClipboardList}
            title="Your request list is empty"
            description="Add over-the-counter medicines from the catalog, or request from a prescription."
          />
        ) : (
          <ul className="space-y-3">
            {items.map((line) => {
              const Icon = formIcon(line.medicine.form);
              return (
                <li key={line.medicine.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{line.medicine.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {line.medicine.unit}
                      {line.fromPrescription && line.prescribed ? ` · prescribed ${line.prescribed}` : ''}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <QuantityStepper
                        value={line.quantity}
                        max={line.max}
                        label={line.medicine.name}
                        onChange={(q) => onQuantity(line.medicine.id, q)}
                      />
                      <span className="text-[11px] text-muted-foreground">max {line.max}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${line.medicine.name}`}
                    onClick={() => onRemove(line.medicine.id)}
                    className="text-slate-400 hover:text-rose-600"
                  >
                    <X />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-4 border-t border-border/70 px-5 py-4">
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-slate-700">How would you like to receive them?</p>
          <RadioGroup
            value={fulfilment}
            onValueChange={(v) => onFulfilment(v as FulfilmentMethod)}
            className="grid grid-cols-2 gap-2"
            aria-label="Fulfilment method"
          >
            {FULFILMENT_OPTIONS.map((opt) => {
              const active = fulfilment === opt.value;
              return (
                <label
                  key={opt.value}
                  htmlFor={`fulfil-${opt.value}`}
                  className={cn(
                    'relative flex cursor-pointer flex-col gap-1.5 rounded-xl border p-3 transition-colors',
                    active ? 'border-teal-400 bg-teal-50/60 ring-1 ring-teal-500/30' : 'hover:border-slate-300 hover:bg-muted/40',
                  )}
                >
                  <RadioGroupItem id={`fulfil-${opt.value}`} value={opt.value} className="absolute top-3 right-3" />
                  <opt.icon className={cn('size-5', active ? 'text-teal-600' : 'text-slate-400')} />
                  <span className="pr-5 text-[13px] leading-tight font-semibold text-slate-900">
                    {opt.value === 'pickup' ? 'Pickup' : 'Campus delivery'}
                  </span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{opt.hint}</span>
                </label>
              );
            })}
          </RadioGroup>
        </div>

        {fulfilment === 'delivery' && (
          <Field label="Delivery location" htmlFor="delivery-location" required error={locationError}>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="delivery-location"
                value={location}
                maxLength={120}
                onChange={(e) => onLocation(e.target.value)}
                placeholder="Hostel, block and room"
                className="pl-9"
                aria-invalid={Boolean(locationError)}
              />
            </div>
          </Field>
        )}

        <Field label="Note for the pharmacist" htmlFor="request-notes" hint="Optional">
          <Textarea
            id="request-notes"
            rows={2}
            maxLength={300}
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            placeholder="e.g. Please include dosage labels"
          />
        </Field>

        <Button className="w-full" size="lg" onClick={onSubmit} disabled={items.length === 0 || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Send />}
          Submit request
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          {FULFILMENT_LABELS[fulfilment]} · reviewed by the dispensary pharmacist
        </p>
      </div>
    </section>
  );
}
