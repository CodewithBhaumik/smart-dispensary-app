import { useNavigate } from 'react-router';
import { CircleCheckBig, PackageCheck } from 'lucide-react';
import { FULFILMENT_LABELS } from '@shared/constants';
import type { MedicineRequest } from '@shared/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export function RequestSuccessDialog({ request, onClose }: { request: MedicineRequest | null; onClose: () => void }) {
  const navigate = useNavigate();
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card sm:max-w-md">
        {request && (
          <div className="flex flex-col items-center gap-4 pt-2 text-center">
            <div className="relative">
              <span className="absolute inset-0 scale-125 rounded-full bg-emerald-100/70 blur-lg" />
              <span className="relative flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
                <CircleCheckBig className="size-8" />
              </span>
            </div>
            <div className="space-y-1.5">
              <DialogTitle className="font-display text-xl">Request submitted</DialogTitle>
              <DialogDescription>
                The dispensary team has been notified. You&apos;ll get a notification at every step.
              </DialogDescription>
            </div>
            <div className="w-full rounded-xl border bg-muted/40 p-4 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">Reference</span>
                <span className="font-mono text-sm font-semibold tracking-wider text-slate-900">{request.code}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground uppercase">Fulfilment</span>
                <span className="text-sm font-medium text-slate-800">{FULFILMENT_LABELS[request.fulfilment]}</span>
              </div>
              <ul className="mt-3 space-y-1 border-t pt-3">
                {request.items.map((item) => (
                  <li key={item.id} className="flex justify-between text-sm">
                    <span className="truncate text-slate-700">{item.medicineName}</span>
                    <span className="font-medium text-slate-900 tabular-nums">× {item.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Continue browsing
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  onClose();
                  navigate(`/student/requests?open=${request.id}`);
                }}
              >
                <PackageCheck /> Track request
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
