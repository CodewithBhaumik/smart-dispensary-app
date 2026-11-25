import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, CalendarClock, FileText, PackageCheck, PillBottle, Stethoscope } from 'lucide-react';
import type { Prescription } from '@shared/types';
import {
  EmptyState,
  ErrorState,
  FilterChips,
  ListSkeleton,
  PageHeader,
  Panel,
  SearchInput,
  StatusBadge,
  ToneBadge,
  UserAvatar,
} from '@/components/app';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { daysUntil, formatDate } from '@/lib/format';
import { usePrescription, usePrescriptions } from './api';
import { isPrescriptionExpired, prescriptionRequestState } from './prescription-state';
import { PrescriptionPrintButton, PrescriptionView } from './PrescriptionView';

type Filter = 'all' | 'active' | 'expired';

function ValidityBadge({ rx }: { rx: Prescription }) {
  const left = daysUntil(rx.validUntil);
  if (left < 0) return <ToneBadge tone="slate">Expired {formatDate(rx.validUntil)}</ToneBadge>;
  return (
    <ToneBadge tone={left <= 5 ? 'amber' : 'emerald'} dot>
      Valid until {formatDate(rx.validUntil)}
    </ToneBadge>
  );
}

function RequestAction({ rx, onNavigate, size = 'sm' }: { rx: Prescription; onNavigate?: () => void; size?: 'sm' | 'default' }) {
  const state = prescriptionRequestState(rx);
  if (state.kind === 'open') {
    return (
      <Button asChild size={size} variant="soft" onClick={onNavigate}>
        <Link to={`/student/requests?open=${state.requestId}`}>
          <PackageCheck /> Track {state.code}
        </Link>
      </Button>
    );
  }
  if (state.kind === 'dispensed') {
    return (
      <Button asChild size={size} variant="outline" onClick={onNavigate}>
        <Link to={`/student/requests?open=${state.requestId}`}>
          <PackageCheck /> View dispensed request
        </Link>
      </Button>
    );
  }
  if (state.kind === 'expired') {
    return (
      <Button size={size} variant="outline" disabled>
        <CalendarClock /> Prescription expired
      </Button>
    );
  }
  return (
    <Button asChild size={size} onClick={onNavigate}>
      <Link to={`/student/medicines?prescription=${rx.id}`}>
        <PillBottle /> Request these medicines
      </Link>
    </Button>
  );
}

function PrescriptionCard({ rx, onOpen }: { rx: Prescription; onOpen: () => void }) {
  const preview = rx.items.slice(0, 3);
  const extra = rx.items.length - preview.length;
  const latest = rx.latestRequest;
  return (
    <article className="group flex h-full min-w-0 flex-col rounded-xl border bg-card shadow-xs transition-all hover:border-slate-300 hover:shadow-md">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-4 p-5 text-left" aria-label={`Open prescription ${rx.code}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-600/10">
              <FileText className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold tracking-wide text-slate-900">{rx.code}</p>
              <p className="text-xs text-muted-foreground">Issued {formatDate(rx.createdAt)}</p>
            </div>
          </div>
          <ValidityBadge rx={rx} />
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Diagnosis</p>
          <p className="line-clamp-2 font-display text-[15px] font-semibold text-slate-900">
            {rx.diagnosis ?? 'General consultation'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <UserAvatar user={rx.doctor} size="sm" />
          <div className="min-w-0 text-sm">
            <p className="truncate font-medium text-slate-800">{rx.doctor.name}</p>
            <p className="truncate text-xs text-muted-foreground">{rx.doctor.specialty}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {preview.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
            >
              {item.medicineName}
              <span className="text-slate-400">×{item.quantity}</span>
            </span>
          ))}
          {extra > 0 && (
            <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 ring-inset">
              +{extra} more
            </span>
          )}
        </div>
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 px-5 py-3">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          {latest ? (
            <>
              <StatusBadge kind="request" status={latest.status} />
              <span className="font-mono">{latest.code}</span>
            </>
          ) : (
            <span>Medicines not requested yet</span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onOpen} className="text-primary hover:text-primary">
          View <ArrowRight />
        </Button>
      </div>
    </article>
  );
}

function PrescriptionDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, isLoading, error, refetch } = usePrescription(id);
  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto bg-background p-0 sm:max-w-3xl">
        <DialogHeader className="border-b bg-card px-5 py-4 text-left sm:px-6">
          <DialogTitle className="font-display">{data ? `Prescription ${data.code}` : 'Prescription'}</DialogTitle>
          <DialogDescription>
            {data ? `Issued by ${data.doctor.name} on ${formatDate(data.createdAt)}` : 'Loading prescription details'}
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 sm:p-6">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          )}
          {error && <ErrorState error={error} retry={() => void refetch()} />}
          {data && <PrescriptionView prescription={data} />}
        </div>
        {data && (
          <DialogFooter className="sticky bottom-0 border-t bg-card px-5 py-3 sm:px-6">
            <PrescriptionPrintButton prescription={data} size="default" />
            <RequestAction rx={data} onNavigate={onClose} size="default" />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function StudentPrescriptionsPage() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const { data, isLoading, error, refetch } = usePrescriptions();

  const openId = params.get('open') ? Number(params.get('open')) : null;
  const setOpen = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', String(id));
    else next.delete('open');
    setParams(next, { replace: true });
  };

  const counts = useMemo(() => {
    const list = data ?? [];
    const expired = list.filter(isPrescriptionExpired).length;
    return { all: list.length, active: list.length - expired, expired };
  }, [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((rx) => (filter === 'all' ? true : filter === 'expired' ? isPrescriptionExpired(rx) : !isPrescriptionExpired(rx)))
      .filter((rx) => {
        if (!q) return true;
        const haystack = [rx.code, rx.diagnosis, rx.doctor.name, rx.doctor.specialty, ...rx.items.map((i) => i.medicineName)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      });
  }, [data, filter, search]);

  return (
    <>
      <PageHeader
        title="Prescriptions"
        description="Prescriptions issued to you by health-centre doctors. Request medicines from an active prescription in one click."
        actions={
          <Button asChild variant="outline">
            <Link to="/student/doctors">
              <Stethoscope /> Consult a doctor
            </Link>
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <FilterChips<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'expired', label: 'Expired', count: counts.expired },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Search by medicine, doctor or code" />
      </div>

      {error ? (
        <ErrorState error={error} retry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Panel key={i}>
              <ListSkeleton rows={3} />
            </Panel>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={FileText}
            title={data && data.length > 0 ? 'No prescriptions match your filters' : 'No prescriptions yet'}
            description={
              data && data.length > 0
                ? 'Try a different search term or filter.'
                : 'When a doctor prescribes medicines after your consultation, the prescription appears here.'
            }
            action={
              data && data.length > 0 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/student/book">Book an appointment</Link>
                </Button>
              )
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((rx) => (
            <PrescriptionCard key={rx.id} rx={rx} onOpen={() => setOpen(rx.id)} />
          ))}
        </div>
      )}

      <PrescriptionDialog id={openId} onClose={() => setOpen(null)} />
    </>
  );
}
