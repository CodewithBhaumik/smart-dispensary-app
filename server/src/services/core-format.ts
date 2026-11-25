/** Human-friendly formatting for notification / activity text (server side). */
import { format } from 'date-fns';
import { parseDateStr } from '../lib/time';

/** "Wed, 26 Nov" */
export function fmtDate(date: string): string {
  return format(parseDateStr(date), 'EEE, d MMM');
}

/** "2:30 PM" */
export function fmtTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 && h < 24 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** "Wed, 26 Nov at 2:30 PM" */
export function fmtSlot(date: string, time: string): string {
  return `${fmtDate(date)} at ${fmtTime(time)}`;
}

const AVATAR_COLORS = [
  '#0d9488',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#059669',
  '#0891b2',
  '#4f46e5',
  '#c026d3',
  '#65a30d',
];

/** Deterministic avatar colour from a name. */
export function avatarColorFor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
