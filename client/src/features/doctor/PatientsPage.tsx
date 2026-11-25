import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { CalendarCheck2, Droplets, ShieldAlert, UsersRound } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, SearchInput, UserAvatar } from '@/components/app';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { usePatients } from './api';

export default function PatientsPage() {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search.trim());
  const { data, isLoading, isError, error, refetch, isFetching } = usePatients(deferred);
  const patients = data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        description="Students who have booked or visited you. Open a record for history, prescriptions and documents."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Search name, roll no, department…" className="sm:w-80" />}
       
      />

      {isError ? (
        <ErrorState error={error} retry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[184px] rounded-xl" />
          ))}
        </div>
      ) : patients.length === 0 ? (
        <div className="rounded-xl border bg-card shadow-xs">
          <EmptyState
            icon={UsersRound}
            title={deferred ? 'No patients match your search' : 'No patients yet'}
            description={deferred ? 'Try a different name or roll number.' : 'Students appear here once they book an appointment with you.'}
          />
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {patients.length} {patients.length === 1 ? 'patient' : 'patients'}
            {isFetching ? ' · updating…' : ''}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {patients.map((p) => (
              <Link
                key={p.id}
                to={`/doctor/patients/${p.id}`}
                className="group flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar user={p} size="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15px] font-semibold text-slate-900 group-hover:text-primary">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.rollNo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.department} · Year {p.year}
                    </p>
                  </div>
                  {p.bloodGroup && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
                      <Droplets className="size-3" /> {p.bloodGroup}
                    </span>
                  )}
                </div>
                <div className="min-h-[26px]">
                  {p.allergies.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ShieldAlert className="size-3.5 text-rose-500" aria-label="Allergies" />
                      {p.allergies.map((a) => (
                        <span key={a} className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-600/15 ring-inset">
                          {a}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-emerald-700">No known allergies</span>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarCheck2 className="size-3.5" />
                    {p.lastVisit ? `Last visit ${formatDate(p.lastVisit)}` : 'No completed visit yet'}
                  </span>
                  <span className="font-medium text-slate-700 tabular-nums">
                    {p.totalVisits} {p.totalVisits === 1 ? 'visit' : 'visits'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
