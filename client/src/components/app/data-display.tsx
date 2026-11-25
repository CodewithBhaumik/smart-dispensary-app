import { Fragment, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { StatusEvent } from '@shared/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headClassName?: string;
}

/** Simple, consistent table. Wrap in a Panel with `padded={false}`. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  loading,
  className,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  loading?: boolean;
  className?: string;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (!loading && rows && rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={cn('scrollbar-thin overflow-x-auto', className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => (
              <TableHead key={c.key} className={c.headClassName}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading || !rows
            ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`s${i}`}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                >
                  {columns.map((c) => (
                    <TableCell key={c.key} className={c.className}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Vertical status history. */
export function Timeline({
  events,
  labels,
  className,
}: {
  events: StatusEvent[];
  labels?: Record<string, string>;
  className?: string;
}) {
  if (events.length === 0) return <p className="text-sm text-muted-foreground">No history yet.</p>;
  return (
    <ol className={cn('relative space-y-5', className)}>
      {events.map((e, i) => {
        const last = i === events.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3">
            {!last && <span className="absolute top-6 left-[11px] h-[calc(100%-4px)] w-px bg-border" aria-hidden />}
            <span
              className={cn(
                'relative z-10 mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full ring-4 ring-white',
                last ? 'bg-primary text-white' : 'bg-teal-50 text-teal-600',
              )}
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1 pb-0.5">
              <p className="text-sm font-medium text-slate-900">{labels?.[e.status] ?? e.status.replace(/_/g, ' ')}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(e.createdAt)}
                {e.actor && <> · {e.actor.name}</>}
              </p>
              {e.note && <p className="mt-1 rounded-md bg-muted/70 px-2.5 py-1.5 text-[13px] text-slate-600">{e.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Horizontal workflow stepper. */
export function ProgressSteps({
  steps,
  current,
  failed,
  className,
}: {
  steps: { key: string; label: string }[];
  current: string;
  /** Show the current step as failed (e.g. rejected / cancelled). */
  failed?: { label: string } | null;
  className?: string;
}) {
  const currentIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === current),
  );
  return (
    <ol className={cn('flex w-full items-start', className)}>
      {steps.map((step, i) => {
        const done = !failed && i < currentIndex;
        const active = i === currentIndex;
        const isFailed = failed && active;
        const complete = done || (!failed && active && i === steps.length - 1);
        return (
          <Fragment key={step.key}>
            <li className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center first:items-start first:text-left last:items-end last:text-right">
              <span
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs font-semibold ring-4 ring-white transition-colors',
                  isFailed
                    ? 'bg-rose-500 text-white'
                    : complete
                      ? 'bg-emerald-500 text-white'
                      : active
                        ? 'bg-primary text-white shadow-[0_0_0_4px_rgb(20_184_166/0.18)]'
                        : 'bg-slate-100 text-slate-400',
                )}
              >
                {isFailed ? <X className="size-3.5" /> : complete ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'max-w-[7rem] text-[11px] leading-tight font-medium sm:text-xs',
                  isFailed ? 'text-rose-600' : active || done ? 'text-slate-800' : 'text-slate-400',
                )}
              >
                {isFailed ? failed.label : step.label}
              </span>
            </li>
            {i < steps.length - 1 && (
              <span
                className={cn('mt-3.5 h-0.5 flex-1 rounded-full', i < currentIndex && !failed ? 'bg-emerald-400' : 'bg-slate-200')}
                aria-hidden
              />
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}

/** Ticket-style pass with a QR code (appointment check-in / medicine pickup). */
export function QRPass({
  value,
  title,
  subtitle,
  code,
  details,
  footnote,
  className,
}: {
  value: string;
  title: string;
  subtitle?: ReactNode;
  code: string;
  details?: { label: string; value: ReactNode }[];
  footnote?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-white shadow-sm', className)}>
      <div className="relative bg-[#0b1b33] px-5 pt-5 pb-6 text-white">
        <div className="bg-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="relative">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-teal-300 uppercase">Smart Dispensary</p>
          <p className="mt-1 font-display text-lg font-semibold">{title}</p>
          {subtitle && <p className="mt-0.5 text-sm text-slate-300">{subtitle}</p>}
        </div>
      </div>
      <div className="relative">
        <span className="absolute top-0 -left-3 size-6 -translate-y-1/2 rounded-full border bg-background" aria-hidden />
        <span className="absolute top-0 -right-3 size-6 -translate-y-1/2 rounded-full border bg-background" aria-hidden />
        <div className="mx-5 border-t border-dashed border-slate-300" />
      </div>
      <div className="flex flex-col items-center gap-3 px-5 pt-5 pb-4">
        <div className="rounded-xl border p-3 shadow-xs">
          <QRCodeSVG value={value} size={148} level="M" fgColor="#0b1b33" />
        </div>
        <div className="text-center">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Reference</p>
          <p className="font-mono text-lg font-semibold tracking-[0.12em] text-slate-900">{code}</p>
        </div>
      </div>
      {details && details.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t bg-muted/40 px-5 py-4">
          {details.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="text-[11px] font-medium text-muted-foreground uppercase">{d.label}</dt>
              <dd className="truncate text-sm font-medium text-slate-800">{d.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {footnote && <p className="border-t px-5 py-3 text-center text-xs text-muted-foreground">{footnote}</p>}
    </div>
  );
}
