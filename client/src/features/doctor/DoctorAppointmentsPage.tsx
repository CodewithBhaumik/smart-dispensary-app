import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  CalendarSearch,
  ClipboardCheck,
  Eye,
  MessageSquare,
  MoreHorizontal,
  Play,
  Stethoscope,
  UserCheck,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { ACTIVE_APPOINTMENT_STATUSES, APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUSES, type AppointmentStatus } from '@shared/constants';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCall } from '@/features/calls/CallProvider';
import { getErrorMessage } from '@/lib/api';
import { formatDayLabel, formatTime } from '@/lib/format';
import { useDoctorAppointments, useStartConversation } from './api';
import {
  AppointmentActionButton,
  CancelAppointmentDialog,
  CheckInByCodeDialog,
  useAppointmentActions,
} from './components/appointment-actions';
import { AppointmentDetailSheet } from './components/AppointmentDetailSheet';
import { isToday, ModeBadge, todayStr, TokenBadge } from './components/clinic-bits';

type Scope = 'today' | 'upcoming' | 'past' | 'all';

const isActive = (a: Appointment) => (ACTIVE_APPOINTMENT_STATUSES as AppointmentStatus[]).includes(a.status);

function inScope(a: Appointment, scope: Scope, today: string): boolean {
  switch (scope) {
    case 'today':
      return a.date === today;
    case 'upcoming':
      return a.date >= today && isActive(a);
    case 'past':
      return a.status === 'completed' || a.status === 'cancelled' || a.date < today;
    default:
      return true;
  }
}

const key = (a: Appointment) => `${a.date} ${a.startTime}`;

function RowMenu({ a, onOpen, onCancel }: { a: Appointment; onOpen: () => void; onCancel: () => void }) {
  const navigate = useNavigate();
  const { doCheckIn, doStart } = useAppointmentActions();
  const { startCall } = useCall();
  const startConversation = useStartConversation();
  const today = isToday(a.date);
  const active = isActive(a);

  const message = async () => {
    try {
      const convo = await startConversation.mutateAsync(a.student.id);
      navigate(`/doctor/messages?c=${convo.id}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${a.student.name}`} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onOpen}>
          <Eye /> View details
        </DropdownMenuItem>
        {a.status === 'scheduled' && a.mode === 'in_person' && (
          <DropdownMenuItem disabled={!today} onSelect={() => void doCheckIn(a)}>
            <UserCheck /> {today ? 'Check in' : 'Check in (on the day)'}
          </DropdownMenuItem>
        )}
        {(a.status === 'checked_in' || (a.status === 'scheduled' && a.mode === 'video')) && (
          <DropdownMenuItem disabled={!today} onSelect={() => void doStart(a)}>
            <Play /> Start consultation
          </DropdownMenuItem>
        )}
        {a.status === 'in_progress' && (
          <DropdownMenuItem onSelect={() => navigate(`/doctor/consultation/${a.id}`)}>
            <Stethoscope /> Continue consultation
          </DropdownMenuItem>
        )}
        {a.status === 'completed' && (
          <DropdownMenuItem onSelect={() => navigate(`/doctor/consultation/${a.id}`)}>
            <ClipboardCheck /> Consultation summary
          </DropdownMenuItem>
        )}
        {a.mode === 'video' && active && (
          <DropdownMenuItem onSelect={() => startCall(a.student, { appointmentId: a.id })}>
            <Video /> Start video call
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => void message()}>
          <MessageSquare /> Message patient
        </DropdownMenuItem>
        {(a.status === 'scheduled' || a.status === 'checked_in') && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCancel} className="text-rose-600 focus:bg-rose-50 focus:text-rose-700">
              <XCircle /> Cancel appointment
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function DoctorAppointmentsPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, error, refetch } = useDoctorAppointments();
  const [scope, setScope] = useState<Scope>((params.get('scope') as Scope) || 'today');
  const [status, setStatus] = useState<'all' | AppointmentStatus>('all');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);

  const openId = params.get('open') ? Number(params.get('open')) : null;
  const setOpen = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', String(id));
    else next.delete('open');
    setParams(next, { replace: true });
  };

  const today = todayStr();
  const all = useMemo(() => data ?? [], [data]);

  const counts = useMemo(
    () => ({
      today: all.filter((a) => inScope(a, 'today', today)).length,
      upcoming: all.filter((a) => inScope(a, 'upcoming', today)).length,
      past: all.filter((a) => inScope(a, 'past', today)).length,
      all: all.length,
    }),
    [all, today],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = all.filter((a) => {
      if (!inScope(a, scope, today)) return false;
      if (status !== 'all' && a.status !== status) return false;
      if (date && a.date !== date) return false;
      if (!q) return true;
      return [a.code, a.student.name, a.student.rollNo, a.reason, a.student.department]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q));
    });
    const asc = scope === 'today' || scope === 'upcoming';
    return filtered.sort((x, y) => (asc ? key(x).localeCompare(key(y)) : key(y).localeCompare(key(x))));
  }, [all, scope, status, date, search, today]);

  const hasFilters = status !== 'all' || date || search;

  const columns: Column<Appointment>[] = [
    {
      key: 'when',
      header: 'When',
      cell: (a) => (
        <div className="leading-tight">
          <p className="font-medium text-slate-900">{formatDayLabel(a.date)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatTime(a.startTime)} – {formatTime(a.endTime)}
          </p>
        </div>
      ),
    },
    { key: 'token', header: 'Token', cell: (a) => <TokenBadge token={a.tokenNo} /> },
    {
      key: 'patient',
      header: 'Patient',
      cell: (a) => (
        <div className="flex items-center gap-2.5">
          <UserAvatar user={a.student} size="sm" />
          <div className="min-w-0 leading-tight">
            <p className="max-w-[180px] truncate font-medium text-slate-900">{a.student.name}</p>
            <p className="text-xs text-muted-foreground">{a.student.rollNo}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      cell: (a) => <span className="block max-w-[200px] truncate text-slate-700">{a.reason}</span>,
    },
    { key: 'mode', header: 'Mode', cell: (a) => <ModeBadge mode={a.mode} /> },
    { key: 'status', header: 'Status', cell: (a) => <StatusBadge kind="appointment" status={a.status} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headClassName: 'text-right',
      className: 'text-right',
      cell: (a) => (
        <div className="flex items-center justify-end gap-1">
          <AppointmentActionButton appointment={a} />
          <RowMenu a={a} onOpen={() => setOpen(a.id)} onCancel={() => setCancelTarget(a)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appointments"
        description="Your patient queue — check patients in, run consultations and keep the day moving."
        actions={<CheckInByCodeDialog />}
       
      />

      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<Scope>
            value={scope}
            onChange={setScope}
            options={[
              { value: 'today', label: 'Today', count: counts.today },
              { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
              { value: 'past', label: 'Past', count: counts.past },
              { value: 'all', label: 'All', count: counts.all },
            ]}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={status} onValueChange={(v) => setStatus(v as 'all' | AppointmentStatus)}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
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
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-40"
              aria-label="Filter by date"
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Patient, roll no, code…" className="sm:w-60" />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setStatus('all');
                  setDate('');
                  setSearch('');
                }}
              >
                <X /> Clear
              </Button>
            )}
          </div>
        </div>

        {isError ? (
          <div className="p-5">
            <ErrorState error={error} retry={() => void refetch()} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={isLoading ? undefined : rows}
            loading={isLoading}
            rowKey={(a) => a.id}
            onRowClick={(a) => setOpen(a.id)}
            rowClassName={(a) => (a.status === 'cancelled' ? 'opacity-60' : a.status === 'in_progress' ? 'bg-violet-50/40' : undefined)}
            empty={
              <EmptyState
                icon={CalendarSearch}
                title={hasFilters ? 'No appointments match these filters' : scope === 'today' ? 'No appointments today' : 'Nothing here yet'}
                description={
                  hasFilters
                    ? 'Try clearing the filters or switching tabs.'
                    : scope === 'today'
                      ? 'Your upcoming bookings are one tab away.'
                      : 'Appointments booked by students will appear here.'
                }
                action={
                  scope === 'today' && !hasFilters ? (
                    <Button variant="outline" size="sm" onClick={() => setScope('upcoming')}>
                      View upcoming
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        )}
        {!isLoading && rows.length > 0 && (
          <div className="border-t px-5 py-2.5 text-xs text-muted-foreground">
            Showing {rows.length} of {counts[scope]} {scope === 'all' ? 'appointments' : `${scope} appointments`}
          </div>
        )}
      </Panel>

      <AppointmentDetailSheet appointmentId={openId} onOpenChange={(o) => !o && setOpen(null)} />
      <CancelAppointmentDialog
        appointment={cancelTarget}
        open={cancelTarget !== null}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      />
    </div>
  );
}
