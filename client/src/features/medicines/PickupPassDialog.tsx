import type { MedicineRequest } from '@shared/types';
import { QRPass } from '@/components/app';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { formatClock } from '@/lib/format';

export function PickupPassDialog({ request, onClose }: { request: MedicineRequest | null; onClose: () => void }) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-sm" showCloseButton={false}>
        <DialogTitle className="sr-only">Medicine pickup pass</DialogTitle>
        <DialogDescription className="sr-only">Show this pass at the dispensary counter</DialogDescription>
        {request && (
          <div className="space-y-3">
            <QRPass
              value={`SMARTDISPENSARY:PICKUP:${request.code}`}
              title="Medicine pickup pass"
              subtitle={request.student.name}
              code={request.code}
              details={[
                { label: 'Items', value: `${request.items.length} (${request.totalUnits} units)` },
                { label: 'Ready since', value: request.readyAt ? formatClock(request.readyAt) : '—' },
                { label: 'Roll no.', value: request.student.rollNo },
                { label: 'Collect at', value: 'Dispensary counter' },
              ]}
              footnote="Show this pass at the dispensary counter to collect your medicines."
            />
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-white/90 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-white"
            >
              Close
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
