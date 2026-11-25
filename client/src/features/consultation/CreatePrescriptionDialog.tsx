import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AppointmentDetail } from '@shared/types';
import { Field } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { useCreatePrescription, useFormulary } from './api';
import { PrescriptionBuilder, toItemInput, validateItems, type DraftItem, type ItemErrors } from './PrescriptionBuilder';
import { allergyConflicts } from './rx-utils';

/** Issue a prescription for a completed consultation that has none yet. */
export function CreatePrescriptionDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: AppointmentDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const formulary = useFormulary();
  const create = useCreatePrescription();
  const [items, setItems] = useState<DraftItem[]>([]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, ItemErrors>>({});
  const allergies = detail.patient.allergies;

  const submit = async () => {
    if (items.length === 0) {
      toast.error('Add at least one medicine to issue a prescription.');
      return;
    }
    const v = validateItems(items);
    setErrors(v);
    if (Object.keys(v).length) {
      toast.error('Please fix the highlighted prescription fields.');
      return;
    }
    const conflicts = items.flatMap((i) => allergyConflicts({ name: i.medicineName, genericName: i.genericName }, allergies));
    if (conflicts.length && !window.confirm(`Allergy alert (${[...new Set(conflicts)].join(', ')}). Issue the prescription anyway?`)) return;
    try {
      const rx = await create.mutateAsync({
        appointmentId: detail.id,
        notes: notes.trim() || null,
        items: items.map(toItemInput),
      });
      toast.success(`Prescription ${rx.code} issued`, { description: `${detail.student.name} can now view and request these medicines.` });
      setItems([]);
      setNotes('');
      onOpenChange(false);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <FileText className="size-5 text-primary" /> New prescription for {detail.student.name}
          </DialogTitle>
          <DialogDescription>
            Linked to appointment {detail.code}
            {detail.consultation?.diagnosis ? ` · ${detail.consultation.diagnosis}` : ''}
          </DialogDescription>
        </DialogHeader>
        <PrescriptionBuilder
          items={items}
          onChange={setItems}
          medicines={formulary.data ?? []}
          loadingMedicines={formulary.isLoading}
          allergies={allergies}
          errors={errors}
        />
        <Field label="Prescription notes" htmlFor="rx-notes-dialog" hint="Optional — shown on the prescription">
          <Textarea id="rx-notes-dialog" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={create.isPending || items.length === 0}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <FileText />}
            Issue prescription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
