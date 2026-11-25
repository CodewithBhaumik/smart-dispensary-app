export type Tone =
  | 'teal'
  | 'emerald'
  | 'blue'
  | 'sky'
  | 'indigo'
  | 'violet'
  | 'amber'
  | 'orange'
  | 'rose'
  | 'slate';

/** Full class strings (static so Tailwind can see them). */
export const TONE_BADGE: Record<Tone, string> = {
  teal: 'bg-teal-50 text-teal-700 ring-teal-600/15',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/15',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/15',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/15',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  orange: 'bg-orange-50 text-orange-700 ring-orange-600/15',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/15',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/15',
};

export const TONE_DOT: Record<Tone, string> = {
  teal: 'bg-teal-500',
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  sky: 'bg-sky-500',
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
};

/** Soft icon tile (icon container) colours. */
export const TONE_TILE: Record<Tone, string> = {
  teal: 'bg-teal-50 text-teal-600 ring-teal-600/10',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-600/10',
  blue: 'bg-blue-50 text-blue-600 ring-blue-600/10',
  sky: 'bg-sky-50 text-sky-600 ring-sky-600/10',
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-600/10',
  violet: 'bg-violet-50 text-violet-600 ring-violet-600/10',
  amber: 'bg-amber-50 text-amber-600 ring-amber-600/10',
  orange: 'bg-orange-50 text-orange-600 ring-orange-600/10',
  rose: 'bg-rose-50 text-rose-600 ring-rose-600/10',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/10',
};

/** Hex values for charts / inline styles. */
export const TONE_HEX: Record<Tone, string> = {
  teal: '#0d9488',
  emerald: '#059669',
  blue: '#2563eb',
  sky: '#0284c7',
  indigo: '#4f46e5',
  violet: '#7c3aed',
  amber: '#d97706',
  orange: '#ea580c',
  rose: '#e11d48',
  slate: '#64748b',
};
