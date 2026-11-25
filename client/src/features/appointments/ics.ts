import type { Appointment } from '@shared/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Floating local time: 20261126T103000 */
function localStamp(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function utcStamp(d = new Date()): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(
    d.getUTCMinutes(),
  )}${pad(d.getUTCSeconds())}Z`;
}

const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Builds an iCalendar file for an appointment so students can add it to their calendar app. */
export function buildAppointmentIcs(a: Appointment): string {
  const location = a.mode === 'video' ? 'Video consultation (Smart Dispensary app)' : `Health Centre${a.doctor.room ? ` · ${a.doctor.room}` : ''}`;
  const description = [
    `Reference: ${a.code}`,
    `Reason: ${a.reason}`,
    a.mode === 'video'
      ? 'Join the video call from the Smart Dispensary app at your appointment time.'
      : 'Show your check-in pass at the health-centre reception.',
  ].join('\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Smart Dispensary//Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${a.code}@smart-dispensary`,
    `DTSTAMP:${utcStamp()}`,
    `DTSTART:${localStamp(a.date, a.startTime)}`,
    `DTEND:${localStamp(a.date, a.endTime)}`,
    `SUMMARY:${escapeText(`Appointment with ${a.doctor.name}`)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Appointment reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadAppointmentIcs(a: Appointment): void {
  const blob = new Blob([buildAppointmentIcs(a)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${a.code}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
