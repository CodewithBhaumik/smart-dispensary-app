import { DISPENSARY_HOURS, type HoursWindow } from '@shared/constants';
import { formatTime } from '@/lib/format';

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export interface DispensaryStatus {
  open: boolean;
  staffing: HoursWindow['staffing'] | null;
  /** Human readable, e.g. "Doctor on duty until 2:00 AM" */
  label: string;
}

/** Live open/closed status from the health-centre timetable. */
export function getDispensaryStatus(now = new Date()): DispensaryStatus {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const windows = DISPENSARY_HOURS[day] ?? [];
  const current = windows.find((w) => minutes >= toMin(w.start) && minutes < toMin(w.end));
  if (current) {
    // Find where continuous coverage ends (may continue into next window/day).
    let end = current.end;
    const nextDay = DISPENSARY_HOURS[(day + 1) % 7] ?? [];
    if (end === '24:00') {
      const cont = nextDay.find((w) => w.start === '00:00' && w.staffing === current.staffing);
      end = cont ? cont.end : '00:00';
    }
    const who = current.staffing === 'doctor' ? 'Doctor on duty' : 'Medical assistant only';
    return { open: true, staffing: current.staffing, label: `${who} until ${formatTime(end === '24:00' ? '00:00' : end)}` };
  }
  const next = windows.find((w) => toMin(w.start) > minutes);
  if (next) return { open: false, staffing: null, label: `Opens at ${formatTime(next.start)}` };
  const tomorrow = (DISPENSARY_HOURS[(day + 1) % 7] ?? [])[0];
  return { open: false, staffing: null, label: tomorrow ? `Opens tomorrow ${formatTime(tomorrow.start)}` : 'Closed' };
}
