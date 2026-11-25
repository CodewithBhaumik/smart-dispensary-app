import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AlertTriangle, ClipboardList, Package } from 'lucide-react';
import { REQUEST_STATUSES, REQUEST_STATUS_LABELS, type RequestStatus } from '@shared/constants';
import type { MedicineRequest } from '@shared/types';
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
import { useAuth } from '@/hooks/use-auth';
import { pluralize, timeAgo } from '@/lib/format';
import { useAllRequests } from './api';
import { RequestDetailSheet } from './RequestDetailSheet';
import { FulfilmentLabel, hasShortfall, itemsSummary, RequestActions } from './request-ui';

type ChipValue = 'all' | 'open' | RequestStatus;

const CHIP_LABELS: Partial<Record<RequestStatus, string>> = {
  ready_for_pickup: 'Ready',
  out_for_delivery: 'Out for delivery',
};

export default function RequestsManagementPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const requests = useAllRequests();
  const [search, setSearch] = useState('');

  const statusParam = params.get('status');
  const chip: ChipValue =
    statusParam === 'open' || (statusParam && (REQUEST_STATUSES as readonly string[]).includes(statusParam))
      ? (statusParam as ChipValue)
      : 'all';
  const openId = params.get('open') ? Number(params.get('open')) : null;

  const update = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: key !== 'open' },
    );

  const all = requests.data ?? [];
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      [r.code, r.student.name, r.student.rollNo, ...r.items.map((i) => i.medicineName)].join(' ').toLowerCase().includes(q),
    );
  }, [all, search]);

  const count = (value: ChipValue) =>
    value === 'all'
      ? searched.length
      : value === 'open'
        ? searched.filter((r) => !['fulfilled', 'rejected', 'cancelled'].includes(r.status)).length
        : searched.filter((r) => r.status === value).length;

  const rows = useMemo(() => {
    if (chip === 'all') return searched;
    if (chip === 'open') return searched.filter((r) => !['fulfilled', 'rejected', 'cancelled'].includes(r.status));
    return searched.filter((r) => r.status === chip);
  }, [searched, chip]);

  const chipOptions: { value: ChipValue; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: count('all') },
    { value: 'open', label: 'Open', count: count('open') },
    ...REQUEST_STATUSES.map((s) => ({ value: s as ChipValue, label: CHIP_LABELS[s] ?? REQUEST_STATUS_LABELS[s], count: count(s) })),
  ];

  const columns: Column<MedicineRequest>[] = [
    {
      key: 'code',
      header: 'Request',
      cell: (r) => (
        <div>
          <p className="font-mono text-[13px] font-semibold tracking-wide text-slate-900">{r.code}</p>
          <p className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <UserAvatar user={r.student} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{r.student.name}</p>
            <p className="text-xs text-muted-foreground">{r.student.rollNo}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      cell: (r) => (
        <div className="max-w-[280px]">
          <p className="truncate text-[13px] text-slate-700">{itemsSummary(r)}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {pluralize(r.totalUnits, 'unit')}
            {r.prescription && <> · {r.prescription.code}</>}
            {hasShortfall(r) && (
              <span className="inline-flex items-center gap-1 font-medium text-rose-600">
                <AlertTriangle className="size-3" /> Low stock
              </span>
            )}
          </p>
        </div>
      ),
    },
    { key: 'fulfilment', header: 'Fulfilment', cell: (r) => <FulfilmentLabel request={r} showLocation /> },
    { key: 'status', header: 'Status', cell: (r) => <StatusBadge kind="request" status={r.status} /> },
    {
      key: 'action',
      header: <span className="sr-only">Next step</span>,
      className: 'text-right',
      cell: (r) => <RequestActions request={r} primaryOnly size="xs" className="justify-end" />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Medicine requests"
        description="Review, prepare and dispense student medicine requests. Stock is deducted automatically when a request is fulfilled."
        actions={
          <Button asChild variant="outline">
            <Link to={`/${user.role}/inventory`}>
              <Package /> Inventory
            </Link>
          </Button>
        }
      />
      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:px-5 xl:flex-row xl:items-center xl:justify-between">
          <FilterChips<ChipValue> options={chipOptions} value={chip} onChange={(v) => update('status', v === 'all' ? null : v)} />
          <SearchInput value={search} onChange={setSearch} placeholder="Search code, student, medicine…" className="xl:w-72" />
        </div>
        {requests.isError ? (
          <div className="p-5">
            <ErrorState error={requests.error} retry={() => requests.refetch()} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={requests.isLoading ? undefined : rows}
            loading={requests.isLoading}
            rowKey={(r) => r.id}
            onRowClick={(r) => update('open', String(r.id))}
            empty={
              <EmptyState
                icon={ClipboardList}
                title={chip === 'all' && !search ? 'No medicine requests yet' : 'Nothing in this view'}
                description={
                  chip === 'all' && !search
                    ? 'Requests submitted by students appear here instantly.'
                    : 'Try another status filter or clear the search.'
                }
              />
            }
          />
        )}
        {!requests.isLoading && rows.length > 0 && (
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">
            Showing {rows.length} of {all.length} requests · updates live as students submit
          </div>
        )}
      </Panel>
      <RequestDetailSheet requestId={openId} onOpenChange={(o) => !o && update('open', null)} />
    </>
  );
}
