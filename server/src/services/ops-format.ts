import { parseDateStr } from '../lib/time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-25" → "25 Nov 2026" (for human-readable messages). */
export function formatDisplayDate(date: string): string {
  const d = parseDateStr(date);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
