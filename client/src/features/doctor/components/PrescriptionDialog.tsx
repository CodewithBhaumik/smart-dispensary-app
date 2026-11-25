import { Printer } from 'lucide-react';
import type { Prescription } from '@shared/types';
import { ErrorState, LoadingState } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PrescriptionView, printPrescription } from '@/features/prescriptions/PrescriptionView';
import { usePrescription } from '../api';

/** Shows a prescription (by object or id) in a dialog with a print action. */
export function PrescriptionDialog({
  prescription,
  prescriptionId,
  open,
  onOpenChange,
}: {
  prescription?: Prescription | null;
  prescriptionId?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = usePrescription(open && !prescription ? prescriptionId : null);
  const rx = prescription ?? query.data ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader className="no-print">
          <DialogTitle className="font-display">{rx ? `Prescription ${rx.code}` : 'Prescription'}</DialogTitle>
          <DialogDescription>
            {rx ? `Issued to ${rx.student.name} by ${rx.doctor.name}` : 'Loading prescription details'}
          </DialogDescription>
        </DialogHeader>
        <div>
          {rx ? (
            <PrescriptionView prescription={rx} />
          ) : query.isError ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : (
            <LoadingState label="Loading prescription…" />
          )}
        </div>
        <DialogFooter className="no-print">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => rx && printPrescription(rx.id)} disabled={!rx}>
            <Printer /> Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
