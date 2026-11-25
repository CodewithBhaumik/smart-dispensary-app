import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('size-9', className)} aria-hidden>
      <defs>
        <linearGradient id="sd-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#sd-g)" />
      <rect x="16.5" y="9" width="7" height="22" rx="2.5" fill="#fff" />
      <rect x="9" y="16.5" width="22" height="7" rx="2.5" fill="#fff" />
      <circle cx="29.5" cy="29.5" r="4.5" fill="#0b1b33" />
      <circle cx="29.5" cy="29.5" r="2" fill="#5eead4" />
    </svg>
  );
}

export function Logo({ className, light = true }: { className?: string; light?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-tight">
        <p className={cn('font-display text-[15px] font-bold tracking-tight', light ? 'text-white' : 'text-slate-900')}>
          Smart Dispensary
        </p>
        <p className={cn('text-[11px] font-medium', light ? 'text-teal-300/90' : 'text-teal-700')}>Campus Health Centre</p>
      </div>
    </div>
  );
}
