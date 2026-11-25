import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { Info, ShieldCheck, Siren } from 'lucide-react';
import { ErrorState, FilterChips, ListSkeleton, PageHeader, Panel, EmptyState } from '@/components/app';
import { useAllEmergencies } from './manage/api';
import { EmergencyCard } from './manage/EmergencyCard';
import { EmergencyDetailSheet } from './manage/EmergencyDetailSheet';

type View = 'active' | 'resolved' | 'all';

/** Emergency board for staff, doctors and admins. */
export default function EmergencyManagementPage() {
  const [params, setParams] = useSearchParams();
  const query = useAllEmergencies();
  const viewParam = params.get('view');
  const view: View = viewParam === 'resolved' || viewParam === 'all' ? viewParam : 'active';
  const openId = params.get('open') ? Number(params.get('open')) : null;

  const set = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: key !== 'open' },
    );

  const all = query.data ?? [];
  const active = all.filter((e) => e.status !== 'resolved');
  const resolved = all.filter((e) => e.status === 'resolved');
  const rows = useMemo(() => (view === 'active' ? active : view === 'resolved' ? resolved : all), [view, all, active, resolved]);

  return (
    <>
      <PageHeader
        title="Emergency assistance"
        description="Acknowledge requests, assign a responder and close each case. Students see every update instantly."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips<View>
          value={view}
          onChange={(v) => set('view', v === 'active' ? null : v)}
          options={[
            { value: 'active', label: 'Active', count: active.length },
            { value: 'resolved', label: 'Resolved', count: resolved.length },
            { value: 'all', label: 'All', count: all.length },
          ]}
        />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Live · refreshes every 10 seconds
        </p>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : query.isLoading ? (
        <Panel>
          <ListSkeleton rows={4} />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={view === 'active' ? ShieldCheck : Siren}
            title={view === 'active' ? 'No active emergencies' : 'No emergencies in this view'}
            description={
              view === 'active'
                ? 'All clear. New requests from students appear here immediately and raise an alert for the team.'
                : 'Resolved cases are kept here for the record.'
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((e) => (
            <EmergencyCard key={e.id} emergency={e} onOpen={() => set('open', String(e.id))} />
          ))}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-px size-3.5 shrink-0" />
        Smart Dispensary coordinates the campus response team. It does not dispatch ambulances automatically — call 108 for
        life-threatening emergencies.
      </p>

      <EmergencyDetailSheet emergencyId={openId} onOpenChange={(o) => !o && set('open', null)} />
    </>
  );
}
