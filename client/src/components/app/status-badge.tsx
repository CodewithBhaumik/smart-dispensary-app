import type { ReactNode } from 'react';
import {
  APPOINTMENT_STATUS_LABELS,
  EMERGENCY_SEVERITY_LABELS,
  EMERGENCY_STATUS_LABELS,
  EXPIRY_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  STOCK_STATUS_LABELS,
} from '@shared/constants';
import { cn } from '@/lib/utils';
import { TONE_BADGE, TONE_DOT, type Tone } from './tone';

export function ToneBadge({
  tone = 'slate',
  dot = false,
  pulse = false,
  icon,
  className,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset [&_svg]:size-3.5',
        TONE_BADGE[tone],
        className,
      )}
    >
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && (
            <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-70', TONE_DOT[tone])} />
          )}
          <span className={cn('relative inline-flex size-1.5 rounded-full', TONE_DOT[tone])} />
        </span>
      )}
      {icon}
      {children}
    </span>
  );
}

export type StatusKind =
  | 'appointment'
  | 'request'
  | 'emergency'
  | 'severity'
  | 'stock'
  | 'expiry'
  | 'consultation'
  | 'call'
  | 'user';

const TONES: Record<StatusKind, Record<string, Tone>> = {
  appointment: {
    scheduled: 'blue',
    checked_in: 'amber',
    in_progress: 'violet',
    completed: 'emerald',
    cancelled: 'slate',
  },
  request: {
    submitted: 'sky',
    approved: 'teal',
    preparing: 'amber',
    ready_for_pickup: 'indigo',
    out_for_delivery: 'indigo',
    fulfilled: 'emerald',
    rejected: 'rose',
    cancelled: 'slate',
  },
  emergency: { submitted: 'rose', acknowledged: 'amber', responder_assigned: 'blue', resolved: 'emerald' },
  severity: { critical: 'rose', high: 'orange', moderate: 'amber' },
  stock: { in_stock: 'emerald', low_stock: 'amber', out_of_stock: 'rose' },
  expiry: { ok: 'slate', expiring: 'amber', expired: 'rose' },
  consultation: { draft: 'amber', completed: 'emerald' },
  call: { ringing: 'sky', active: 'teal', completed: 'emerald', missed: 'rose', declined: 'rose', cancelled: 'slate' },
  user: { active: 'emerald', inactive: 'slate' },
};

const LABELS: Record<StatusKind, Record<string, string>> = {
  appointment: APPOINTMENT_STATUS_LABELS,
  request: REQUEST_STATUS_LABELS,
  emergency: EMERGENCY_STATUS_LABELS,
  severity: EMERGENCY_SEVERITY_LABELS,
  stock: STOCK_STATUS_LABELS,
  expiry: EXPIRY_STATUS_LABELS,
  consultation: { draft: 'Draft', completed: 'Completed' },
  call: {
    ringing: 'Ringing',
    active: 'In call',
    completed: 'Completed',
    missed: 'Missed',
    declined: 'Declined',
    cancelled: 'Cancelled',
  },
  user: { active: 'Active', inactive: 'Inactive' },
};

const PULSE: Record<string, boolean> = {
  in_progress: true,
  checked_in: true,
  submitted: true,
  critical: true,
  out_for_delivery: true,
};

export function statusTone(kind: StatusKind, status: string): Tone {
  return TONES[kind][status] ?? 'slate';
}

export function statusLabel(kind: StatusKind, status: string): string {
  return LABELS[kind][status] ?? status.replace(/_/g, ' ');
}

/** Consistent status pill for every workflow status in the app. */
export function StatusBadge({
  kind,
  status,
  className,
  noDot = false,
}: {
  kind: StatusKind;
  status: string;
  className?: string;
  noDot?: boolean;
}) {
  const live = kind === 'emergency' ? status !== 'resolved' : Boolean(PULSE[status]);
  return (
    <ToneBadge tone={statusTone(kind, status)} dot={!noDot} pulse={live && !noDot} className={className}>
      {statusLabel(kind, status)}
    </ToneBadge>
  );
}
