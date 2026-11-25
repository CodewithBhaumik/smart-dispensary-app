import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
} from 'date-fns';

/** Parses "YYYY-MM-DD" as a LOCAL date (not UTC). */
export function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

const toDate = (value: string | Date): Date =>
  value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDate(value) : parseISO(value);

/** "26 Nov 2026" */
export const formatDate = (value: string | Date) => format(toDate(value), 'd MMM yyyy');

/** "Thursday, 26 November 2026" */
export const formatDateLong = (value: string | Date) => format(toDate(value), 'EEEE, d MMMM yyyy');

/** "Thu, 26 Nov" */
export const formatDateShort = (value: string | Date) => format(toDate(value), 'EEE, d MMM');

/** "Today" / "Tomorrow" / "Yesterday" / "Wed, 27 Nov" */
export function formatDayLabel(value: string | Date): string {
  const d = toDate(value);
  if (isToday(d)) return 'Today';
  if (isTomorrow(d)) return 'Tomorrow';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEE, d MMM');
}

/** "14:30" → "2:30 PM" */
export function formatTime(time: string | null | undefined): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 && h < 24 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const formatTimeRange = (start: string, end: string) => `${formatTime(start)} – ${formatTime(end)}`;

/** "26 Nov 2026, 2:30 PM" for ISO timestamps */
export const formatDateTime = (iso: string) => format(parseISO(iso), 'd MMM yyyy, h:mm a');

/** "2:30 PM" for ISO timestamps */
export const formatClock = (iso: string) => format(parseISO(iso), 'h:mm a');

/** "5 min ago", "2 days ago" (ISO timestamps) */
export function timeAgo(iso: string): string {
  const d = parseISO(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 45_000) return 'just now';
  return `${formatDistanceToNowStrict(d)} ago`;
}

/** Days from today until a YYYY-MM-DD date (negative if past). */
export const daysUntil = (date: string) => differenceInCalendarDays(parseDate(date), new Date());

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const formatINR = (value: number) => inr.format(value);

const num = new Intl.NumberFormat('en-IN');
export const formatNumber = (value: number) => num.format(value);

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(name: string): string {
  const parts = name
    .replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i, '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

/** "Good morning" / "Good afternoon" / "Good evening" */
export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export const firstName = (name: string) => name.replace(/^(Dr\.?|Mr\.?|Mrs\.?|Ms\.?)\s+/i, '').split(/\s+/)[0] ?? name;

/** Local "YYYY-MM-DD" for a Date. */
export function toDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
