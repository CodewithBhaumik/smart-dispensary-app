import { useRef, type ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { FREQUENCIES } from '@shared/constants';
import type { Prescription, PrescriptionItem } from '@shared/types';
import { LogoMark } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { isPrescriptionExpired } from './prescription-state';
import { printElement } from './print';

/** "BD" → "Twice daily (1-0-1)" */
export function frequencyLabel(code: string): string {
  return FREQUENCIES.find((f) => f.value === code)?.label ?? code;
}

export { isPrescriptionExpired } from './prescription-state';

/** Prints the PrescriptionView with the given id (rendered somewhere on the page). */
export function printPrescription(prescriptionId: number): void {
  const el = document.querySelector<HTMLElement>(`[data-rx-id="${prescriptionId}"]`);
  if (el) printElement(el, `Prescription ${el.dataset.rxCode ?? ''}`.trim());
}

function medicineMeta(item: PrescriptionItem): string {
  return [item.form, item.strength].filter(Boolean).join(' · ');
}

function Block({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/60 px-4 py-3', className)}>
      <p className="text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase">{label}</p>
      <div className="mt-1.5 space-y-0.5 text-sm text-slate-700">{children}</div>
    </div>
  );
}

/**
 * Printable prescription card (shared by student and doctor screens).
 * Use `printPrescription(prescription.id)` or `<PrescriptionPrintButton />` to print only this card.
 */
export function PrescriptionView({ prescription, className }: { prescription: Prescription; className?: string }) {
  const expired = isPrescriptionExpired(prescription);
  const { doctor, student } = prescription;

  return (
    <article
      data-print-root
      data-rx-id={prescription.id}
      data-rx-code={prescription.code}
      className={cn('overflow-hidden rounded-xl border bg-white text-slate-800 shadow-xs', className)}
    >
      {/* Header */}
      <header className="relative border-b border-slate-200 bg-gradient-to-br from-teal-50/80 via-white to-white px-5 pt-5 pb-4 sm:px-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-500 via-teal-600 to-emerald-500" aria-hidden />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <LogoMark className="size-10" />
            <div className="leading-tight">
              <p className="font-display text-base font-bold tracking-tight text-slate-900">Smart Dispensary</p>
              <p className="text-xs font-medium text-teal-700">Campus Health Centre · Medical Prescription</p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="font-mono text-[15px] font-semibold tracking-[0.08em] text-slate-900">{prescription.code}</p>
            <p className="mt-0.5 text-xs text-slate-500">Issued {formatDateTime(prescription.createdAt)}</p>
            <p className={cn('text-xs font-medium', expired ? 'text-rose-600' : 'text-emerald-700')}>
              {expired ? 'Expired' : 'Valid until'} {formatDate(prescription.validUntil)}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-5 px-5 py-5 sm:px-6">
        {/* People */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Block label="Prescribing doctor">
            <p className="font-semibold text-slate-900">{doctor.name}</p>
            <p>{doctor.qualifications}</p>
            <p className="text-slate-500">
              {doctor.specialty}
              {doctor.room ? ` · ${doctor.room}` : ''}
            </p>
          </Block>
          <Block label="Patient">
            <p className="font-semibold text-slate-900">{student.name}</p>
            <p>Roll no. {student.rollNo}</p>
            <p className="text-slate-500">
              {student.department}
              {student.year ? ` · Year ${student.year}` : ''}
            </p>
          </Block>
        </div>

        {/* Diagnosis */}
        {prescription.diagnosis && (
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase">Diagnosis</p>
            <p className="mt-1 text-[15px] font-medium text-slate-900">{prescription.diagnosis}</p>
          </div>
        )}

        {/* Medicines */}
        <div>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-display text-2xl leading-none font-bold text-teal-700 italic" aria-hidden>
              Rx
            </span>
            <p className="text-[10.5px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
              Medicines ({prescription.items.length})
            </p>
          </div>
          <div className="scrollbar-thin overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">
                <tr>
                  <th className="w-8 px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Medicine</th>
                  <th className="px-3 py-2.5">Dosage</th>
                  <th className="px-3 py-2.5">Frequency</th>
                  <th className="px-3 py-2.5">Duration</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5">Instructions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {prescription.items.map((item, index) => (
                  <tr key={item.id} className="align-top">
                    <td className="px-3 py-3 text-slate-400 tabular-nums">{index + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{item.medicineName}</span>
                        {item.requiresPrescription && (
                          <span className="rounded bg-violet-50 px-1.5 py-px text-[10px] font-semibold text-violet-700 ring-1 ring-violet-600/15 ring-inset">
                            Rx
                          </span>
                        )}
                      </div>
                      {medicineMeta(item) && <p className="text-xs text-slate-500">{medicineMeta(item)}</p>}
                      {item.notes && <p className="mt-1 text-xs text-slate-600 italic">{item.notes}</p>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{item.dosage}</td>
                    <td className="px-3 py-3">{frequencyLabel(item.frequency)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {item.durationDays} {item.durationDays === 1 ? 'day' : 'days'}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-3 text-slate-600">{item.instructions ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {prescription.notes && (
          <div className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-4 py-3">
            <p className="text-[10.5px] font-semibold tracking-[0.12em] text-amber-700 uppercase">Doctor&apos;s notes</p>
            <p className="mt-1 text-sm whitespace-pre-line text-slate-700">{prescription.notes}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex flex-col gap-3 border-t border-dashed border-slate-300 bg-slate-50/50 px-5 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <p className="text-xs text-slate-500">
          Digitally issued via Smart Dispensary · Verify with code{' '}
          <span className="font-mono font-semibold text-slate-700">{prescription.code}</span>
        </p>
        <div className="text-left sm:text-right">
          <p className="font-display text-sm font-semibold text-slate-900">{doctor.name}</p>
          <p className="text-[11px] tracking-wide text-slate-500 uppercase">Digitally signed</p>
        </div>
      </footer>
    </article>
  );
}

/** Button that prints only the given prescription card. The card must be rendered on the page. */
export function PrescriptionPrintButton({
  prescription,
  size = 'sm',
  variant = 'outline',
  className,
}: {
  prescription: Pick<Prescription, 'id'>;
  size?: 'xs' | 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'secondary' | 'default';
  className?: string;
}) {
  const busy = useRef(false);
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      onClick={() => {
        if (busy.current) return;
        busy.current = true;
        printPrescription(prescription.id);
        window.setTimeout(() => (busy.current = false), 1500);
      }}
    >
      <Printer /> Print
    </Button>
  );
}
