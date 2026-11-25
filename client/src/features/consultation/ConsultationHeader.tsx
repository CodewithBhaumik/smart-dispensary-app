import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Timer } from 'lucide-react';
import type { AppointmentDetail } from '@shared/types';
import { StatusBadge, UserAvatar } from '@/components/app';
import { ModeBadge, TokenBadge, whenLabel } from '@/features/doctor/components/clinic-bits';

function ElapsedTimer({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const text = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 font-mono text-xs font-semibold text-violet-700 ring-1 ring-violet-600/15 ring-inset tabular-nums"
      aria-label={`Consultation running for ${text}`}
    >
      <Timer className="size-3.5" /> {text}
    </span>
  );
}

/** Patient + appointment identity bar used in every consultation state. */
export function ConsultationHeader({
  detail,
  actions,
  meta,
}: {
  detail: AppointmentDetail;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Link
        to="/doctor/appointments"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Appointments
      </Link>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <UserAvatar user={detail.student} size="lg" />
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold tracking-wider text-teal-700 uppercase">Consultation</p>
            <h1 className="truncate font-display text-xl font-semibold text-slate-900 sm:text-2xl">{detail.student.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700">{detail.code}</span>
              <StatusBadge kind="appointment" status={detail.status} />
              <ModeBadge mode={detail.mode} />
              {detail.tokenNo ? <TokenBadge token={detail.tokenNo} /> : null}
              <span className="hidden sm:inline">{whenLabel(detail)}</span>
              <span className="hidden text-slate-300 sm:inline">•</span>
              <span className="truncate">{detail.reason}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <div className="flex items-center gap-3 sm:justify-end">
            {meta}
            {detail.status === 'in_progress' && detail.startedAt && <ElapsedTimer since={detail.startedAt} />}
          </div>
          {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
