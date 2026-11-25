/** Date/time helpers. Calendar dates are LOCAL "YYYY-MM-DD", clock times "HH:MM". */

const pad = (n: number) => String(n).padStart(2, '0');

export const nowIso = (): string => new Date().toISOString();

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayStr = (): string => toDateStr(new Date());

export function currentTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysStr(s: string, n: number): string {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(s: string): number {
  return parseDateStr(s).getDay();
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateStr(b).getTime() - parseDateStr(a).getTime()) / 86_400_000);
}

/** ISO timestamp for a local date + time (e.g. for seeding "created at 10:15 on 2026-11-20"). */
export function localIso(date: string, time = '00:00'): string {
  const d = parseDateStr(date);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Local calendar date of an ISO timestamp. */
export function dateOfIso(iso: string): string {
  return toDateStr(new Date(iso));
}

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateStr(parseDateStr(s)) === s;
}

/** Age in whole years for a YYYY-MM-DD birth date. */
export function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const b = parseDateStr(dob);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}
