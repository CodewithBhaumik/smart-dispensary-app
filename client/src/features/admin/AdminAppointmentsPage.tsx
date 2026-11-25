import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarSearch, Video, X } from 'lucide-react';
import { APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS } from '@shared/constants';
import type { Appointment } from '@shared/types';
import {
  DataTable,
  EmptyState,
  ErrorState,
  FilterChips,
  PageHeader,
  Panel,
  SearchInput,
  StatusBadge,
  UserAvatar,
  type Column,
} from '@/components/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDayLabel, formatTimeRange } from '@/lib/format';
import { useAdminAppointments, useDebounced, useDoctorsList } from './api';
import { AppointmentDetailSheet } from './AppointmentDetailSheet';

type Scope = 'all' | 'today' | 'upcoming' | 'past';

export default function AdminAppointmentsPage() {
  const [params, setParams] = useSearchParams();
  const scopeParam = params.get('scope');
  const scope: Scope = scopeParam === 'today' || scopeParam === 'upcoming' || scopeParam === 'past' ? scopeParam : 'all';
  const status = params.get('status') ?? 'all';
  const doctorId = params.get('doctor') ?? 'all';
  const date = params.get('date') ?? '';
  const search = params.get('q') ?? '';
  const openId = params.get('open') ? Number(params.get('open')) : null;
  const debouncedSearch = useDebounced(search);

  const set = (key: string, value: string | null, fallback?: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === fallback) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: key !== 'open' },
    );

  const doctors = useDoctorsList();
  const query = useAdminAppointments({
    scope,
    status: status === 'all' ? undefined : status,
    doctorId: doctorId === 'all' ? undefined : doctorId,
    date: date || undefined,
    search: debouncedSearch || undefined,
    limit: 300,
  });
  const rows = query.data ?? [];

  const summary = useMemo(() => {
    const by = (s: string) => rows.filter((a) => a.status === s).length;
    return { completed: by('completed'), active: by('scheduled') + by('checked_in') + by('in_progress'), cancelled: by('cancelled') };
  }, [rows]);

  const filtersActive = scope !== 'all' || status !== 'all' || doctorId !== 'all' || Boolean(date) || Boolean(search);

  const columns: Column<Appointment>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (a) => (
        <div>
          <p className="font-medium text-slate-900">{formatDayLabel(a.date)}</p>
          <p className="text-xs text-muted-foreground">{formatTimeRange(a.startTime, a.endTime)}</p>
        </div>
      ),
    },
    { key: 'code', header: 'Reference', cell: (a) => <span className="font-mono text-xs font-semibold text-slate-700">{a.code}</span> },
    {
      key: 'student',
      header: 'Student',
      cell: (a) => (
        <div className="flex items-center gap-2.5">
          <UserAvatar user={a.student} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{a.student.name}</p>
            <p className="text-xs text-muted-foreground">{a.student.rollNo}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'doctor',
      header: 'Doctor',
      cell: (a) => (
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-slate-800">{a.doctor.name}</p>
          <p className="truncate text-xs text-muted-foreground">{a.doctor.specialty}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (a) => (
        <span className="flex max-w-[220px] items-center gap-1.5 text-[13px] text-slate-600">
          {a.mode === 'video' && <Video className="size-3.5 shrink-0 text-violet-500" aria-label="Video consultation" />}
          <span className="truncate">{a.reason}</span>
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (a) => <StatusBadge kind="appointment" status={a.status} /> },
  ];

  return (
    <>
      <PageHeader title="Appointments" description="Every booking across the health centre — filter by doctor, date or status." />
      <Panel padded={false}>
        <div className="space-y-3 border-b px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips<Scope>
              value={scope}
              onChange={(v) => set('scope', v, 'all')}
              options={[
                { value: 'all', label: 'All' },
                { value: 'today', label: 'Today' },
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'past', label: 'Past' },
              ]}
            />
            <SearchInput value={search} onChange={(v) => set('q', v)} placeholder="Search code, student, doctor…" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => set('status', v, 'all')}>
              <SelectTrigger size="sm" className="w-[150px]" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {APPOINTMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {APPOINTMENT_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={doctorId} onValueChange={(v) => set('doctor', v, 'all')}>
              <SelectTrigger size="sm" className="w-[200px]" aria-label="Doctor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All doctors</SelectItem>
                {doctors.data?.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={date}
              onChange={(e) => set('date', e.target.value)}
              className="h-8 w-[160px] text-[13px]"
              aria-label="Filter by date"
            />
            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={() => setParams(openId ? { open: String(openId) } : {}, { replace: true })}>
                <X /> Clear
              </Button>
            )}
            {!query.isLoading && rows.length > 0 && (
              <p className="ml-auto text-xs text-muted-foreground">
                {rows.length} shown · {summary.active} active · {summary.completed} completed · {summary.cancelled} cancelled
              </p>
            )}
          </div>
        </div>
        {query.isError ? (
          <div className="p-5">
            <ErrorState error={query.error} retry={() => query.refetch()} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={query.isLoading ? undefined : rows}
            loading={query.isLoading}
            rowKey={(a) => a.id}
            onRowClick={(a) => set('open', String(a.id))}
            empty={<EmptyState icon={CalendarSearch} title="No appointments found" description="Adjust the filters to see more bookings." />}
          />
        )}
      </Panel>
      <AppointmentDetailSheet appointmentId={openId} onOpenChange={(o) => !o && set('open', null)} />
    </>
  );
}
