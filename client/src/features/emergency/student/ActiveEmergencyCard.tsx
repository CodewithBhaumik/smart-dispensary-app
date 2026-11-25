import { CircleCheckBig, Clock, MapPin, Phone, PhoneCall, ShieldCheck, Siren } from 'lucide-react';
import { EMERGENCY_STATUSES, EMERGENCY_STATUS_LABELS } from '@shared/constants';
import type { Emergency } from '@shared/types';
import { ProgressSteps, StatusBadge, Timeline } from '@/components/app';
import { Button } from '@/components/ui/button';
import { formatDateTime, timeAgo } from '@/lib/format';
import { categoryIcon, statusMessage, WHILE_YOU_WAIT } from './meta';

const STEPS = EMERGENCY_STATUSES.map((key) => ({
  key,
  label: key === 'responder_assigned' ? 'Responder assigned' : EMERGENCY_STATUS_LABELS[key],
}));

export function SubmittedConfirmation({ emergency }: { emergency: Emergency }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white px-6 py-8 text-center">
      <span className="relative flex size-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300/40" />
        <span className="relative flex size-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
          <CircleCheckBig className="size-8" />
        </span>
      </span>
      <h2 className="font-display text-xl font-semibold text-slate-900">The health-centre team has been alerted</h2>
      <p className="max-w-md text-sm text-slate-600">
        Reference <span className="font-mono font-semibold text-slate-900">{emergency.code}</span>. Keep your phone close — the
        team may call you on {emergency.contactPhone}.
      </p>
    </div>
  );
}

export function ActiveEmergencyCard({ emergency }: { emergency: Emergency }) {
  const Icon = categoryIcon(emergency.category);
  return (
    <section className="overflow-hidden rounded-xl border border-rose-200 bg-card shadow-sm">
      <header className="relative flex flex-col gap-4 bg-gradient-to-r from-rose-50 via-white to-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="relative flex size-12 shrink-0 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-rose-400/30" />
            <span className="relative flex size-12 items-center justify-center rounded-full bg-rose-500 text-white shadow-md shadow-rose-500/30">
              <Icon className="size-6" />
            </span>
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wider text-rose-600 uppercase">Emergency request active</p>
            <h2 className="font-display text-xl font-semibold text-slate-900">{emergency.category}</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              <span className="font-mono font-medium">{emergency.code}</span> · reported {timeAgo(emergency.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="severity" status={emergency.severity} />
          <StatusBadge kind="emergency" status={emergency.status} />
        </div>
      </header>

      <div className="space-y-5 px-5 py-5">
        <div className="rounded-xl bg-muted/40 px-3 py-4 sm:px-5">
          <ProgressSteps steps={STEPS} current={emergency.status} />
        </div>

        <p className="flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          <Siren className="mt-0.5 size-4 shrink-0 text-rose-500" />
          {statusMessage(emergency.status, emergency.responderName)}
        </p>

        {emergency.responderName && (
          <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-blue-600/15">
                <ShieldCheck className="size-5" />
              </span>
              <div>
                <p className="text-xs font-medium text-blue-700">Responder assigned</p>
                <p className="font-semibold text-slate-900">{emergency.responderName}</p>
              </div>
            </div>
            {emergency.responderPhone && (
              <Button asChild variant="outline" className="border-blue-200 bg-white text-blue-700 hover:bg-blue-50">
                <a href={`tel:${emergency.responderPhone.replace(/\s/g, '')}`}>
                  <PhoneCall /> {emergency.responderPhone}
                </a>
              </Button>
            )}
          </div>
        )}

        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">Location</dt>
              <dd className="text-sm font-medium break-words text-slate-800">{emergency.location}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Phone className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Your contact</dt>
              <dd className="text-sm font-medium text-slate-800">{emergency.contactPhone}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Reported at</dt>
              <dd className="text-sm font-medium text-slate-800">{formatDateTime(emergency.createdAt)}</dd>
            </div>
          </div>
        </dl>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Status updates</h3>
            <Timeline events={emergency.timeline} labels={EMERGENCY_STATUS_LABELS} />
          </div>
          <div className="rounded-xl border bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">While you wait</h3>
            <ul className="space-y-2.5">
              {WHILE_YOU_WAIT.map((tip) => (
                <li key={tip} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" />
                  {tip}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">This page updates automatically every few seconds.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
