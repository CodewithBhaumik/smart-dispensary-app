import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardCheck, Loader2, Play, ScanLine, Stethoscope, UserCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Appointment } from '@shared/types';
import { ConfirmDialog, Field } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useAppointmentMutations } from '../api';
import { isToday } from './clinic-bits';

export type PrimaryAction = 'check_in' | 'start' | 'continue' | 'view' | null;

/** Which single primary action a doctor should take next for an appointment. */
export function primaryActionFor(a: Pick<Appointment, 'status' | 'mode' | 'date'>): PrimaryAction {
  switch (a.status) {
    case 'scheduled':
      if (a.mode === 'video') return isToday(a.date) ? 'start' : null;
      return isToday(a.date) ? 'check_in' : null;
    case 'checked_in':
      return 'start';
    case 'in_progress':
      return 'continue';
    case 'completed':
      return 'view';
    default:
      return null;
  }
}

/** Shared handlers for check-in / start / continue so every entry point behaves the same. */
export function useAppointmentActions() {
  const navigate = useNavigate();
  const { checkIn, start, cancel, checkInByCode } = useAppointmentMutations();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const doCheckIn = async (a: Appointment) => {
    setPendingId(a.id);
    try {
      const updated = await checkIn.mutateAsync(a.id);
      toast.success(`${a.student.name} checked in`, {
        description: updated.tokenNo ? `Queue token #${String(updated.tokenNo).padStart(2, '0')} assigned.` : undefined,
      });
      return updated;
    } catch (e) {
      toast.error(getErrorMessage(e));
      return null;
    } finally {
      setPendingId(null);
    }
  };

  const doStart = async (a: Appointment) => {
    setPendingId(a.id);
    try {
      await start.mutateAsync(a.id);
      toast.success('Consultation started', { description: `${a.student.name} · ${formatTime(a.startTime)}` });
      navigate(`/doctor/consultation/${a.id}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPendingId(null);
    }
  };

  const run = (action: PrimaryAction, a: Appointment) => {
    if (action === 'check_in') return doCheckIn(a);
    if (action === 'start') return doStart(a);
    if (action === 'continue' || action === 'view') return navigate(`/doctor/consultation/${a.id}`);
  };

  return { run, doCheckIn, doStart, pendingId, cancel, checkInByCode };
}

const LABELS: Record<Exclude<PrimaryAction, null>, { label: string; icon: typeof Play }> = {
  check_in: { label: 'Check in', icon: UserCheck },
  start: { label: 'Start', icon: Play },
  continue: { label: 'Continue', icon: Stethoscope },
  view: { label: 'Summary', icon: ClipboardCheck },
};

/** Compact status-aware primary button (queue rows, tables). */
export function AppointmentActionButton({
  appointment,
  size = 'xs',
  className,
  fullLabels = false,
}: {
  appointment: Appointment;
  size?: 'xs' | 'sm' | 'default';
  className?: string;
  fullLabels?: boolean;
}) {
  const { run, pendingId } = useAppointmentActions();
  const action = primaryActionFor(appointment);
  if (!action) return null;
  const meta = LABELS[action];
  const pending = pendingId === appointment.id;
  const label = fullLabels
    ? action === 'start'
      ? 'Start consultation'
      : action === 'continue'
        ? 'Continue consultation'
        : action === 'view'
          ? 'View summary'
          : 'Check in patient'
    : meta.label;
  return (
    <Button
      size={size}
      variant={action === 'view' ? 'outline' : action === 'check_in' ? 'soft' : 'default'}
      className={className}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        void run(action, appointment);
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <meta.icon />}
      {label}
    </Button>
  );
}

/** Check a patient in by typing the code from their appointment pass. */
export function CheckInByCodeDialog({ trigger }: { trigger?: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { checkInByCode } = useAppointmentMutations();

  const submit = async () => {
    const value = code.trim().toUpperCase();
    if (!/^APT-?[A-Z0-9]{4,}$/.test(value)) {
      setError('Enter the code shown on the appointment pass, e.g. APT-7K3Q9M.');
      return;
    }
    setError(null);
    try {
      const appt = await checkInByCode.mutateAsync(value.startsWith('APT-') ? value : value.replace(/^APT/, 'APT-'));
      toast.success(`${appt.student.name} checked in`, {
        description: appt.tokenNo ? `Queue token #${String(appt.tokenNo).padStart(2, '0')} · ${formatTime(appt.startTime)}` : undefined,
      });
      setOpen(false);
      setCode('');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <ScanLine /> Check in by code
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setError(null);
            setCode('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Check in by appointment code</DialogTitle>
            <DialogDescription>
              Scan or type the reference on the student&apos;s appointment pass. A queue token is assigned automatically.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-4"
          >
            <Field label="Appointment code" htmlFor="checkin-code" error={error}>
              <Input
                id="checkin-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="APT-7K3Q9M"
                className="h-11 font-mono text-base tracking-[0.12em] uppercase"
                aria-invalid={Boolean(error)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={checkInByCode.isPending || !code.trim()}>
                {checkInByCode.isPending ? <Loader2 className="animate-spin" /> : <UserCheck />}
                Check in
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Cancel with an optional reason shared with the student. */
export function CancelAppointmentDialog({
  appointment,
  open,
  onOpenChange,
  onDone,
}: {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = useState('');
  const { cancel } = useAppointmentMutations();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setReason('');
      }}
      tone="danger"
      title="Cancel this appointment?"
      description={
        appointment
          ? `${appointment.student.name} will be notified that the ${formatTime(appointment.startTime)} slot was cancelled. The slot becomes free for other students.`
          : undefined
      }
      confirmLabel="Cancel appointment"
      cancelLabel="Keep appointment"
      onConfirm={async () => {
        if (!appointment) return;
        try {
          await cancel.mutateAsync({ id: appointment.id, reason: reason.trim() });
          toast.success('Appointment cancelled', { description: `${appointment.student.name} has been notified.` });
          onDone?.();
        } catch (e) {
          toast.error(getErrorMessage(e));
          throw e;
        }
      }}
    >
      <Field label="Reason (shared with the student)" htmlFor="cancel-reason" hint="Optional">
        <Textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Doctor called for an emergency — please rebook for tomorrow."
          rows={3}
          maxLength={300}
        />
      </Field>
    </ConfirmDialog>
  );
}

export { XCircle as CancelIcon };
