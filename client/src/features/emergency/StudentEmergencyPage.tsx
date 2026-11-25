import { useMemo, useState } from 'react';
import { History, PhoneCall, ShieldAlert } from 'lucide-react';
import { NATIONAL_AMBULANCE_NUMBER } from '@shared/constants';
import type { Emergency } from '@shared/types';
import { ErrorState, PageHeader, Panel, StatusBadge } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { formatDateTime } from '@/lib/format';
import { ActiveEmergencyCard, SubmittedConfirmation } from './student/ActiveEmergencyCard';
import { useMyEmergencies } from './student/api';
import { EmergencyForm } from './student/EmergencyForm';
import { categoryIcon } from './student/meta';

function SafetyNotice() {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3.5 sm:flex-row sm:items-center">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-rose-600 ring-1 ring-rose-600/15">
        <ShieldAlert className="size-[18px]" />
      </span>
      <p className="flex-1 text-sm text-rose-950">
        This alerts the campus health-centre team. It does not automatically dispatch an ambulance.{' '}
        <span className="font-semibold">For life-threatening emergencies call {NATIONAL_AMBULANCE_NUMBER}.</span>
      </p>
      <Button asChild variant="destructive" className="shrink-0">
        <a href={`tel:${NATIONAL_AMBULANCE_NUMBER}`}>
          <PhoneCall /> Call {NATIONAL_AMBULANCE_NUMBER}
        </a>
      </Button>
    </div>
  );
}

function PastEmergencies({ items }: { items: Emergency[] }) {
  if (items.length === 0) return null;
  return (
    <Panel title="Past emergency requests" icon={History} description="Resolved requests and how they were handled." className="mt-6" padded={false}>
      <ul className="divide-y">
        {items.map((e) => {
          const Icon = categoryIcon(e.category);
          return (
            <li key={e.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{e.category}</p>
                  <StatusBadge kind="severity" status={e.severity} noDot />
                  <StatusBadge kind="emergency" status={e.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="font-mono">{e.code}</span> · {formatDateTime(e.createdAt)} · {e.location}
                </p>
                {e.resolutionNotes && <p className="mt-1.5 text-sm text-slate-600">{e.resolutionNotes}</p>}
                {e.responderName && <p className="mt-1 text-xs text-muted-foreground">Responder: {e.responderName}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export default function StudentEmergencyPage() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useMyEmergencies();
  const [justSubmitted, setJustSubmitted] = useState<Emergency | null>(null);

  const { active, past } = useMemo(() => {
    const list = [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      active: list.find((e) => e.status !== 'resolved') ?? null,
      past: list.filter((e) => e.status === 'resolved'),
    };
  }, [data]);

  // Prefer the freshest server copy; fall back to the just-created record until the list refetches.
  const fresh = justSubmitted ? data?.find((e) => e.id === justSubmitted.id) : undefined;
  const current = active ?? (justSubmitted && !fresh && justSubmitted.status !== 'resolved' ? justSubmitted : null);

  return (
    <>
      <PageHeader
        title="Emergency assistance"
        description="Alert the campus health-centre team instantly. Help is coordinated by the on-duty staff."
      />
      <SafetyNotice />

      {error ? (
        <ErrorState error={error} retry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : current ? (
        <div className="space-y-5">
          {justSubmitted && justSubmitted.id === current.id && <SubmittedConfirmation emergency={current} />}
          <ActiveEmergencyCard emergency={current} />
        </div>
      ) : (
        <EmergencyForm user={user} onSubmitted={setJustSubmitted} />
      )}

      {!isLoading && !error && <PastEmergencies items={past} />}
    </>
  );
}
