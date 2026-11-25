import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { MEDICINE_CATEGORIES, MEDICINE_FORMS } from '@shared/constants';
import type { Medicine } from '@shared/types';
import { Field } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, getErrorMessage } from '@/lib/api';
import { useCreateMedicine, useUpdateMedicine, type MedicinePayload } from './api';

const wholeNumber = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number.`);

const schema = z.object({
  name: z.string().trim().min(2, 'Enter the medicine name (e.g. Paracetamol 500 mg).').max(120),
  genericName: z.string().trim().max(120),
  category: z.string().min(1, 'Choose a category.'),
  form: z.string().min(1, 'Choose a dosage form.'),
  strength: z.string().trim().max(60),
  unit: z.string().trim().min(1, 'Enter the dispensing unit (e.g. strip of 10).').max(60),
  manufacturer: z.string().trim().max(120),
  requiresPrescription: z.boolean(),
  isActive: z.boolean(),
  stockQuantity: wholeNumber('Opening stock'),
  minStock: wholeNumber('Minimum stock'),
  unitPrice: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid price, e.g. 12.50.'),
  batchNo: z.string().trim().max(60),
  expiryDate: z.string(),
  description: z.string().trim().max(1000),
  usageInstructions: z.string().trim().max(1000),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  name: '',
  genericName: '',
  category: '',
  form: '',
  strength: '',
  unit: '',
  manufacturer: '',
  requiresPrescription: false,
  isActive: true,
  stockQuantity: '0',
  minStock: '20',
  unitPrice: '0',
  batchNo: '',
  expiryDate: '',
  description: '',
  usageInstructions: '',
};

function toForm(m: Medicine): FormValues {
  return {
    name: m.name,
    genericName: m.genericName ?? '',
    category: m.category,
    form: m.form,
    strength: m.strength ?? '',
    unit: m.unit,
    manufacturer: m.manufacturer ?? '',
    requiresPrescription: m.requiresPrescription,
    isActive: m.isActive,
    stockQuantity: String(m.stockQuantity),
    minStock: String(m.minStock),
    unitPrice: String(m.unitPrice),
    batchNo: m.batchNo ?? '',
    expiryDate: m.expiryDate ?? '',
    description: m.description ?? '',
    usageInstructions: m.usageInstructions ?? '',
  };
}

const orNull = (v: string) => (v.trim() ? v.trim() : null);

/** Add a new medicine, or edit an existing one (stock is changed via "Adjust stock"). */
export function MedicineFormDialog({
  open,
  onOpenChange,
  medicine,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medicine?: Medicine | null;
}) {
  const isEdit = Boolean(medicine);
  const create = useCreateMedicine();
  const update = useUpdateMedicine();
  const pending = create.isPending || update.isPending;

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) reset(medicine ? toForm(medicine) : EMPTY);
  }, [open, medicine, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const body: MedicinePayload = {
      name: values.name.trim(),
      genericName: orNull(values.genericName),
      category: values.category,
      form: values.form,
      strength: orNull(values.strength),
      unit: values.unit.trim(),
      description: orNull(values.description),
      usageInstructions: orNull(values.usageInstructions),
      requiresPrescription: values.requiresPrescription,
      minStock: Number(values.minStock),
      batchNo: orNull(values.batchNo),
      expiryDate: values.expiryDate || null,
      manufacturer: orNull(values.manufacturer),
      unitPrice: Number(values.unitPrice),
    };
    try {
      if (medicine) {
        const saved = await update.mutateAsync({ id: medicine.id, body: { ...body, isActive: values.isActive } });
        toast.success('Medicine updated', { description: saved.name });
      } else {
        const saved = await create.mutateAsync({ ...body, stockQuantity: Number(values.stockQuantity) });
        toast.success('Medicine added to inventory', {
          description: `${saved.name} · opening stock ${saved.stockQuantity}`,
        });
      }
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.fields) {
        for (const [key, message] of Object.entries(e.fields)) {
          if (key in EMPTY) setError(key as keyof FormValues, { message });
        }
      }
      if (e instanceof ApiError && e.code === 'NAME_TAKEN') setError('name', { message: e.message });
      toast.error(getErrorMessage(e));
    }
  });

  const categories = [...new Set([...MEDICINE_CATEGORIES, ...(medicine ? [medicine.category] : [])])];
  const forms = [...new Set([...MEDICINE_FORMS, ...(medicine ? [medicine.form] : [])])];

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="gap-0 bg-card p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="font-display">{isEdit ? 'Edit medicine' : 'Add medicine'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update catalogue details. Stock levels are changed with “Adjust stock” so every change is recorded.'
              : 'Add a new item to the dispensary formulary with its opening stock.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <div className="scrollbar-thin max-h-[min(68vh,640px)] space-y-6 overflow-y-auto px-6 py-5">
            <section className="space-y-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Basics</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Medicine name" htmlFor="med-name" required error={errors.name?.message} className="sm:col-span-2">
                  <Input id="med-name" placeholder="e.g. Paracetamol 500 mg" {...register('name')} aria-invalid={!!errors.name} />
                </Field>
                <Field label="Generic name" htmlFor="med-generic" error={errors.genericName?.message}>
                  <Input id="med-generic" placeholder="e.g. Paracetamol" {...register('genericName')} />
                </Field>
                <Field label="Manufacturer" htmlFor="med-mfr" error={errors.manufacturer?.message}>
                  <Input id="med-mfr" placeholder="e.g. Cipla" {...register('manufacturer')} />
                </Field>
                <Field label="Category" required error={errors.category?.message}>
                  <Controller
                    control={control}
                    name="category"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full" aria-invalid={!!errors.category} aria-label="Category">
                          <SelectValue placeholder="Choose category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Dosage form" required error={errors.form?.message}>
                  <Controller
                    control={control}
                    name="form"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full" aria-invalid={!!errors.form} aria-label="Dosage form">
                          <SelectValue placeholder="Choose form" />
                        </SelectTrigger>
                        <SelectContent>
                          {forms.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
                <Field label="Strength" htmlFor="med-strength" error={errors.strength?.message}>
                  <Input id="med-strength" placeholder="e.g. 500 mg" {...register('strength')} />
                </Field>
                <Field label="Dispensing unit" htmlFor="med-unit" required error={errors.unit?.message}>
                  <Input id="med-unit" placeholder="e.g. strip of 10" {...register('unit')} aria-invalid={!!errors.unit} />
                </Field>
              </div>
              <Controller
                control={control}
                name="requiresPrescription"
                render={({ field }) => (
                  <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
                    <span>
                      <span className="block text-sm font-medium text-slate-900">Prescription required</span>
                      <span className="block text-xs text-muted-foreground">
                        Students can only request this item against a valid doctor&apos;s prescription.
                      </span>
                    </span>
                    <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Prescription required" />
                  </label>
                )}
              />
              {isEdit && (
                <Controller
                  control={control}
                  name="isActive"
                  render={({ field }) => (
                    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border bg-muted/30 px-4 py-3">
                      <span>
                        <span className="block text-sm font-medium text-slate-900">Active in catalogue</span>
                        <span className="block text-xs text-muted-foreground">
                          Inactive medicines are hidden from students and cannot be requested.
                        </span>
                      </span>
                      <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Active in catalogue" />
                    </label>
                  )}
                />
              )}
            </section>

            <section className="space-y-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Stock &amp; batch</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {!isEdit && (
                  <Field label="Opening stock" htmlFor="med-stock" required error={errors.stockQuantity?.message}>
                    <Input id="med-stock" inputMode="numeric" {...register('stockQuantity')} aria-invalid={!!errors.stockQuantity} />
                  </Field>
                )}
                <Field
                  label="Minimum stock"
                  htmlFor="med-min"
                  required
                  error={errors.minStock?.message}
                  hint="Low-stock alert threshold"
                >
                  <Input id="med-min" inputMode="numeric" {...register('minStock')} aria-invalid={!!errors.minStock} />
                </Field>
                <Field label="Unit price (₹)" htmlFor="med-price" required error={errors.unitPrice?.message}>
                  <Input id="med-price" inputMode="decimal" {...register('unitPrice')} aria-invalid={!!errors.unitPrice} />
                </Field>
                <Field label="Batch number" htmlFor="med-batch" error={errors.batchNo?.message}>
                  <Input id="med-batch" placeholder="e.g. PCM2611A" {...register('batchNo')} />
                </Field>
                <Field label="Expiry date" htmlFor="med-expiry" error={errors.expiryDate?.message}>
                  <Input id="med-expiry" type="date" {...register('expiryDate')} />
                </Field>
              </div>
            </section>

            <section className="space-y-4">
              <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Label information</p>
              <Field label="Description" htmlFor="med-desc" error={errors.description?.message}>
                <Textarea id="med-desc" rows={2} placeholder="What this medicine is used for" {...register('description')} />
              </Field>
              <Field
                label="Usage instructions"
                htmlFor="med-usage"
                error={errors.usageInstructions?.message}
                hint="General label guidance shown to students in the catalogue."
              >
                <Textarea id="med-usage" rows={2} placeholder="e.g. Take after food. Do not exceed 4 doses in 24 hours." {...register('usageInstructions')} />
              </Field>
            </section>
          </div>
          <DialogFooter className="border-t bg-muted/30 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {isEdit ? 'Save changes' : 'Add medicine'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
