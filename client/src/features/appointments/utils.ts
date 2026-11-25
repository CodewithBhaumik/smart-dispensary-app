import { ACTIVE_APPOINTMENT_STATUSES } from '@shared/constants';
import type { Appointment, Slot } from '@shared/types';
import { toDateStr } from '@/lib/format';

export const isActiveAppointment = (a: Pick<Appointment, 'status'>) => ACTIVE_APPOINTMENT_STATUSES.includes(a.status);

/** Scheduled but the day has already gone by without a check-in. */
export const isMissed = (a: Pick<Appointment, 'status' | 'date'>) => a.status === 'scheduled' && a.date < toDateStr();

/** Video consultations can be joined on the appointment day while still active. */
export const canJoinVideo = (a: Pick<Appointment, 'mode' | 'status' | 'date'>) =>
  a.mode === 'video' && isActiveAppointment(a) && a.date === toDateStr();

export const canReschedule = (a: Pick<Appointment, 'status' | 'date'>) => a.status === 'scheduled' && !isMissed(a);
export const canCancel = canReschedule;

export function partitionAppointments(list: Appointment[]) {
  const today = toDateStr();
  const byStartAsc = (x: Appointment, y: Appointment) =>
    x.date === y.date ? x.startTime.localeCompare(y.startTime) : x.date.localeCompare(y.date);
  const byStartDesc = (x: Appointment, y: Appointment) => byStartAsc(y, x);
  const upcoming = list.filter((a) => isActiveAppointment(a) && a.date >= today).sort(byStartAsc);
  const cancelled = list.filter((a) => a.status === 'cancelled').sort(byStartDesc);
  const past = list
    .filter((a) => a.status !== 'cancelled' && !(isActiveAppointment(a) && a.date >= today))
    .sort(byStartDesc);
  return { upcoming, past, cancelled };
}

export const SLOT_REASON_LABELS: Record<NonNullable<Slot['reason']>, string> = {
  booked: 'Already booked',
  past: 'This time has passed',
  leave: 'Doctor is on leave',
  own_conflict: 'You have another appointment at this time',
};

export function slotPeriod(time: string): 'morning' | 'afternoon' | 'evening' {
  const [h] = time.split(':').map(Number);
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
