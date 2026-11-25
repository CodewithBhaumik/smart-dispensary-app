import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CalendarRange, FileText, PackageCheck, Stethoscope } from 'lucide-react';
import type { Prescription } from '@shared/types';
import {
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  SearchInput,
  StatCard,
  StatusBadge,
  UserAvatar,
  type Column,
} from '@/components/app';
import { formatDate, toDateStr } from '@/lib/format';
import { useDoctorPrescriptions } from './api';
import { PrescriptionDialog } from './components/PrescriptionDialog';

export default function DoctorPrescriptionsPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, error, refetch } = useDoctorPrescriptions();
  const [search, setSearch] = useState('');

  const openId = params.get('open') ? Number(params.get('open')) : null;
  const setOpen = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', String(id));
    else next.delete('open');
    setParams(next, { replace: true });
  };

  const all = useMemo(() => data ?? [], [data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((rx) =>
      [rx.code, rx.student.name, rx.student.rollNo, rx.diagnosis ?? '', ...rx.items.map((i) => i.medicineName)]
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [all, search]);

  const stats = useMemo(() => {
    const monthPrefix = toDateStr(new Date()).slice(0, 7);
    return {
      total: all.length,
      thisMonth: all.filter((rx) => toDateStr(new Date(rx.createdAt)).startsWith(monthPrefix)).length,
      dispensed: all.filter((rx) => rx.latestRequest?.status === 'fulfilled').length,
      patients: new Set(all.map((rx) => rx.student.id)).size,
    };
  }, [all]);

  const selected = openId ? (all.find((rx) => rx.id === openId) ?? null) : null;

  const columns: Column<Prescription>[] = [
    {
      key: 'code',
      header: 'Prescription',
      cell: (rx) => (
        <div className="leading-tight">
          <p className="font-mono text-[13px] font-semibold text-slate-900">{rx.code}</p>
          <p className="text-xs text-muted-foreground">{formatDate(rx.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      cell: (rx) => (
        <div className="flex items-center gap-2.5">
          <UserAvatar user={rx.student} size="sm" />
          <div className="min-w-0 leading-tight">
            <p className="max-w-[180px] truncate font-medium text-slate-900">{rx.student.name}</p>
            <p className="text-xs text-muted-foreground">{rx.student.rollNo}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'diagnosis',
      header: 'Diagnosis',
      cell: (rx) => <span className="block max-w-[220px] truncate text-slate-700">{rx.diagnosis ?? '—'}</span>,
    },
    {
      key: 'items',
      header: 'Medicines',
      cell: (rx) => (
        <div className="max-w-[260px] leading-tight">
          <p className="font-medium text-slate-800">
            {rx.items.length} {rx.items.length === 1 ? 'item' : 'items'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{rx.items.map((i) => i.medicineName).join(', ')}</p>
        </div>
      ),
    },
    {
      key: 'validity',
      header: 'Valid until',
      cell: (rx) => {
        const expired = rx.validUntil < toDateStr(new Date());
        return <span className={expired ? 'text-muted-foreground' : 'text-slate-700'}>{expired ? 'Expired' : formatDate(rx.validUntil)}</span>;
      },
    },
    {
      key: 'request',
      header: 'Pharmacy',
      cell: (rx) =>
        rx.latestRequest ? (
          <StatusBadge kind="request" status={rx.latestRequest.status} />
        ) : (
          <span className="text-xs text-muted-foreground">Not requested</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prescriptions"
        description="Every prescription you have issued, with its dispensing status at the pharmacy."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Patient, code, medicine…" className="sm:w-72" />}
       
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total issued" value={stats.total} icon={FileText} tone="violet" />
        <StatCard label="This month" value={stats.thisMonth} icon={CalendarRange} tone="blue" />
        <StatCard label="Dispensed" value={stats.dispensed} icon={PackageCheck} tone="emerald" hint="Fulfilled by the pharmacy" />
        <StatCard label="Patients" value={stats.patients} icon={Stethoscope} tone="teal" />
      </div>

      <Panel padded={false}>
        {isError ? (
          <div className="p-5">
            <ErrorState error={error} retry={() => void refetch()} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={isLoading ? undefined : rows}
            loading={isLoading}
            rowKey={(rx) => rx.id}
            onRowClick={(rx) => setOpen(rx.id)}
            empty={
              <EmptyState
                icon={FileText}
                title={search ? 'No prescriptions match your search' : 'No prescriptions issued yet'}
                description={search ? 'Try another patient name, code or medicine.' : 'Prescriptions you write during consultations appear here.'}
              />
            }
          />
        )}
      </Panel>

      <PrescriptionDialog
        prescription={selected}
        prescriptionId={openId}
        open={openId !== null}
        onOpenChange={(o) => !o && setOpen(null)}
      />
    </div>
  );
}
