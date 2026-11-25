import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TONE_TILE, type Tone } from './tone';

/** Page title row. Every page starts with one. */
export function PageHeader({
  title,
  description,
  actions,
  back,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1.5">
        {back && (
          <Link
            to={back.to}
            className="mb-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            {back.label}
          </Link>
        )}
        {eyebrow && <div className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</div>}
        <h1 className="text-2xl leading-tight font-semibold text-slate-900 sm:text-[26px]">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** White card with optional header. */
export function Panel({
  title,
  description,
  actions,
  icon: Icon,
  children,
  className,
  bodyClassName,
  padded = true,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn('rounded-xl border bg-card shadow-xs', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-slate-600">
                <Icon className="size-4" />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] leading-6 font-semibold text-slate-900">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** KPI tile. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = 'teal',
  trend,
  to,
  className,
}: {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  hint?: ReactNode;
  tone?: Tone;
  trend?: { value: string; direction: 'up' | 'down' | 'flat'; positive?: boolean };
  to?: string;
  className?: string;
}) {
  const body = (
    <div
      className={cn(
        'group relative flex h-full flex-col justify-between gap-4 rounded-xl border bg-card p-5 shadow-xs transition-all',
        to && 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg ring-1', TONE_TILE[tone])}>
          <Icon className="size-[18px]" />
        </span>
      </div>
      <div className="space-y-1">
        <div className="font-display text-[28px] leading-none font-semibold tracking-tight text-slate-900 tabular-nums">
          {value}
        </div>
        {(hint || trend) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {trend && (
              <span
                className={cn(
                  'inline-flex items-center rounded-md px-1.5 py-0.5 font-medium',
                  trend.direction === 'flat'
                    ? 'bg-slate-100 text-slate-600'
                    : (trend.positive ?? trend.direction === 'up')
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-700',
                )}
              >
                {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} {trend.value}
              </span>
            )}
            {hint && <span className="truncate">{hint}</span>}
          </div>
        )}
      </div>
      {to && (
        <ArrowUpRight className="absolute right-4 bottom-4 size-4 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </div>
  );
  return to ? (
    <Link to={to} className="block h-full rounded-xl focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Friendly empty state. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-teal-100/40 blur-xl" />
        <span
          className={cn(
            'relative flex items-center justify-center rounded-2xl border bg-white text-teal-600 shadow-sm',
            compact ? 'size-10' : 'size-14',
          )}
        >
          <Icon className={compact ? 'size-5' : 'size-6'} />
        </span>
      </div>
      <div className="space-y-1">
        <p className={cn('font-display font-semibold text-slate-900', compact ? 'text-sm' : 'text-base')}>{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Label/value row. */
export function InfoRow({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2 text-sm', className)}>
      <span className="flex items-center gap-2 text-muted-foreground">
        {Icon && <Icon className="size-4 text-slate-400" />}
        {label}
      </span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}

/** Grid of label/value pairs. */
export function KeyValueGrid({
  items,
  columns = 2,
  className,
}: {
  items: { label: ReactNode; value: ReactNode; full?: boolean }[];
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const cols = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' }[columns];
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-4', cols, className)}>
      {items.map((item, i) => (
        <div key={i} className={cn('min-w-0', item.full && 'sm:col-span-full')}>
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium break-words text-slate-800">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
