import { useEffect, useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Appointment } from '@shared/types';
import { ConfirmDialog, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, getErrorMessage } from '@/lib/api';
import { formatDateShort, formatDayLabel, formatTime, formatTimeRange } from '@/lib/format';
import { useDoctorAvailability, useDoctorSlots } from '../../doctors/api';
import { useCancelAppointment, useRescheduleAppointment } from '../api';
import { DateStrip } from './DateStrip';
import { SlotGrid } from './SlotGrid';

/** Pick a new date/time with the same doctor. */
export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
  onDone,
}: {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: (updated: Appointment) => void;
}) {
  const doctorId = appointment?.doctor.id ?? null;
  const availability = useDoctorAvailability(open ? doctorId : null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const slots = useDoctorSlots(open ? doctorId : null, date);
  const reschedule = useRescheduleAppointment();

  useEffect(() => {
    if (!open) {
      setDate(null);
      setTime(null);
    }
  }, [open]);

  // Default to the current appointment date when it still has room, else the first free day.
  useEffect(() => {
    if (!open || date || !availability.data) return;
    const current = availability.data.find((d) => d.date === appointment?.date && d.freeSlots > 0 && !d.onLeave);
    const first = current ?? availability.data.find((d) => d.freeSlots > 0 && !d.onLeave);
    if (first) setDate(first.date);
  }, [open, date, availability.data, appointment?.date]);

  useEffect(() => {
    if (time && slots.data && !slots.data.some((s) => s.time === time && s.available)) setTime(null);
  }, [slots.data, time]);

  if (!appointment) return null;

  const submit = async () => {
    if (!date || !time) return;
    try {
      const updated = await reschedule.mutateAsync({ id: appointment.id, date, startTime: time });
      toast.success('Appointment rescheduled', {
        description: `${formatDayLabel(updated.date)}, ${formatTimeRange(updated.startTime, updated.endTime)} with ${updated.doctor.name}`,
      });
      onOpenChange(false);
      onDone?.(updated);
    } catch (e) {
      toast.error(getErrorMessage(e));
      if (e instanceof ApiError && e.status === 409) {
        setTime(null);
        void slots.refetch();
        void availability.refetch();
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !reschedule.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[92dvh] overflow-x-hidden overflow-y-auto sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="font-display">Reschedule appointment</DialogTitle>
          <DialogDescription>
            Currently {formatDateShort(appointment.date)} at {formatTime(appointment.startTime)} · {appointment.code}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-xl border bg-muted/40 px-3.5 py-3">
          <UserAvatar user={appointment.doctor} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{appointment.doctor.name}</p>
            <p className="truncate text-xs text-muted-foreground">{appointment.doctor.specialty}</p>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-slate-700">New date</p>
          <DateStrip
            days={availability.data}
            loading={availability.isLoading}
            value={date}
            onChange={(d) => {
              setDate(d);
              setTime(null);
            }}
          />
        </div>
        <div className="space-y-2">
          <p className="text-[13px] font-semibold text-slate-700">New time</p>
          {date ? (
            <SlotGrid slots={slots.data} loading={slots.isLoading} value={time} onChange={setTime} />
          ) : (
            <p className="text-sm text-muted-foreground">Pick a date to see open slots.</p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reschedule.isPending}>
            Keep current time
          </Button>
          <Button onClick={submit} disabled={!date || !time || reschedule.isPending}>
            {reschedule.isPending ? <Loader2 className="animate-spin" /> : <CalendarClock />}
            {date && time ? `Move to ${formatDayLabel(date)}, ${formatTime(time)}` : 'Confirm new time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cancel with an optional reason. */
export function CancelAppointmentDialog({
  appointment,
  open,
  onOpenChange,
  onDone,
}: {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: (updated: Appointment) => void;
}) {
  const [reason, setReason] = useState('');
  const cancel = useCancelAppointment();

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  if (!appointment) return null;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="danger"
      title="Cancel this appointment?"
      description={`${appointment.doctor.name} · ${formatDateShort(appointment.date)}, ${formatTime(appointment.startTime)}. The slot will be released for other students.`}
      confirmLabel="Cancel appointment"
      cancelLabel="Keep appointment"
      loading={cancel.isPending}
      onConfirm={async () => {
        try {
          const updated = await cancel.mutateAsync({ id: appointment.id, reason });
          toast.success('Appointment cancelled', { description: `${appointment.code} has been cancelled.` });
          onDone?.(updated);
        } catch (e) {
          toast.error(getErrorMessage(e));
          throw e;
        }
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="cancel-reason" className="text-[13px] text-slate-700">
          Reason <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="cancel-reason"
          value={reason}
          maxLength={300}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Exam schedule clash, feeling better"
          rows={3}
        />
      </div>
    </ConfirmDialog>
  );
}
