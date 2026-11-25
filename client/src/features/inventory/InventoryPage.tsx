import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  History,
  IndianRupee,
  MoreHorizontal,
  PackageSearch,
  PackageX,
  Pencil,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import type { Medicine } from '@shared/types';
import {
  DataTable,
  EmptyState,
  ErrorState,
  FilterChips,
  PageHeader,
  Panel,
  SearchInput,
  StatCard,
  StatusBadge,
  ToneBadge,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { formatINR } from '@/lib/format';
import { AdjustStockDialog } from './AdjustStockDialog';
import { useInventory } from './api';
import { ExpiryBadge, medicineSubtitle, StockBar } from './inventory-ui';
import { MedicineFormDialog } from './MedicineFormDialog';
import { StockHistorySheet } from './StockHistorySheet';

type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type ExpiryFilter = 'all' | 'expiring' | 'expired';
type RxFilter = 'all' | 'otc' | 'rx';
type StatusFilter = 'all' | 'active' | 'inactive';
type SortKey = 'name' | 'stock' | 'expiry';

const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export default function InventoryPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const inventory = useInventory();

  const search = params.get('q') ?? '';
  const category = params.get('category') ?? 'all';
  const stock = pick<StockFilter>(params.get('stock'), ['all', 'in_stock', 'low_stock', 'out_of_stock'], 'all');
  const expiry = pick<ExpiryFilter>(params.get('expiry'), ['all', 'expiring', 'expired'], 'all');
  const rx = pick<RxFilter>(params.get('rx'), ['all', 'otc', 'rx'], 'all');
  const status = pick<StatusFilter>(params.get('status'), ['all', 'active', 'inactive'], 'active');
  const sort = pick<SortKey>(params.get('sort'), ['name', 'stock', 'expiry'], 'name');
  const openId = params.get('open') ? Number(params.get('open')) : null;

  const setParam = (key: string, value: string | null, defaultValue?: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '' || value === defaultValue) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Medicine | null>(null);
  const [adjusting, setAdjusting] = useState<Medicine | null>(null);

  const all = inventory.data ?? [];
  const active = all.filter((m) => m.isActive);

  const stats = useMemo(
    () => ({
      total: active.length,
      categories: new Set(active.map((m) => m.category)).size,
      low: active.filter((m) => m.stockStatus === 'low_stock').length,
      out: active.filter((m) => m.stockStatus === 'out_of_stock').length,
      expiring: active.filter((m) => m.expiryStatus === 'expiring').length,
      expired: active.filter((m) => m.expiryStatus === 'expired').length,
      value: active.reduce((sum, m) => sum + m.stockQuantity * m.unitPrice, 0),
      units: active.reduce((sum, m) => sum + m.stockQuantity, 0),
    }),
    [active],
  );

  const categories = useMemo(() => [...new Set(all.map((m) => m.category))].sort(), [all]);

  // Everything except the stock chip, so chip counts reflect the other filters.
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((m) => {
      if (status === 'active' && !m.isActive) return false;
      if (status === 'inactive' && m.isActive) return false;
      if (category !== 'all' && m.category !== category) return false;
      if (expiry !== 'all' && m.expiryStatus !== expiry) return false;
      if (rx === 'otc' && m.requiresPrescription) return false;
      if (rx === 'rx' && !m.requiresPrescription) return false;
      if (q) {
        const hay = [m.name, m.genericName, m.category, m.manufacturer, m.batchNo].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [all, search, category, expiry, rx, status]);

  const rows = useMemo(() => {
    const list = stock === 'all' ? baseFiltered : baseFiltered.filter((m) => m.stockStatus === stock);
    const sorted = [...list];
    if (sort === 'stock') sorted.sort((a, b) => a.stockQuantity / Math.max(a.minStock, 1) - b.stockQuantity / Math.max(b.minStock, 1));
    else if (sort === 'expiry')
      sorted.sort((a, b) => (a.daysToExpiry ?? Number.MAX_SAFE_INTEGER) - (b.daysToExpiry ?? Number.MAX_SAFE_INTEGER));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [baseFiltered, stock, sort]);

  const chipCount = (s: StockFilter) => (s === 'all' ? baseFiltered.length : baseFiltered.filter((m) => m.stockStatus === s).length);
  const filtersActive = Boolean(search) || category !== 'all' || stock !== 'all' || expiry !== 'all' || rx !== 'all' || status !== 'active';
  const base = `/${user.role}/inventory`;

  const openHistory = (id: number) => setParam('open', String(id));

  const columns: Column<Medicine>[] = [
    {
      key: 'name',
      header: 'Medicine',
      cell: (m) => (
        <div className="min-w-[220px]">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{m.name}</span>
            {m.requiresPrescription && (
              <ToneBadge tone="violet" className="h-5 px-1.5 text-[10px]">
                Rx
              </ToneBadge>
            )}
          </div>
          <p className="max-w-[280px] truncate text-xs text-muted-foreground">{medicineSubtitle(m)}</p>
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category · unit',
      cell: (m) => (
        <div>
          <p className="text-[13px] text-slate-700">{m.category}</p>
          <p className="text-xs text-muted-foreground">{m.unit}</p>
        </div>
      ),
    },
    { key: 'stock', header: 'Stock', cell: (m) => <StockBar medicine={m} className="w-[140px]" /> },
    {
      key: 'batch',
      header: 'Batch',
      cell: (m) => <span className="font-mono text-xs text-slate-600">{m.batchNo ?? '—'}</span>,
    },
    { key: 'expiry', header: 'Expiry', cell: (m) => <ExpiryBadge medicine={m} /> },
    {
      key: 'status',
      header: 'Status',
      cell: (m) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge kind="stock" status={m.stockStatus} />
          {!m.isActive && <ToneBadge tone="slate">Inactive</ToneBadge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      headClassName: 'w-12',
      className: 'text-right',
      cell: (m) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${m.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setAdjusting(m)}>
                <SlidersHorizontal /> Adjust stock
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setEditing(m);
                  setFormOpen(true);
                }}
              >
                <Pencil /> Edit details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openHistory(m.id)}>
                <History /> Stock history
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Track stock, batches and expiry across the dispensary formulary. Every change is recorded in the stock ledger."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Add medicine
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {inventory.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
        ) : (
          <>
            <StatCard label="Medicines in catalogue" value={stats.total} icon={Boxes} tone="teal" hint={`${stats.categories} categories`} />
            <StatCard
              label="Low stock"
              value={stats.low}
              icon={AlertTriangle}
              tone="amber"
              hint="At or below minimum"
              to={`${base}?stock=low_stock`}
            />
            <StatCard
              label="Out of stock"
              value={stats.out}
              icon={PackageX}
              tone="rose"
              hint="Cannot be dispensed"
              to={`${base}?stock=out_of_stock`}
            />
            <StatCard
              label="Expiring ≤ 60 days"
              value={stats.expiring}
              icon={CalendarClock}
              tone="orange"
              hint={stats.expired ? `${stats.expired} already expired` : 'No expired batches'}
              to={`${base}?expiry=expiring&sort=expiry`}
            />
            <StatCard
              label="Inventory value"
              value={formatINR(stats.value)}
              icon={IndianRupee}
              tone="emerald"
              hint={`${stats.units.toLocaleString('en-IN')} units on hand`}
              className="col-span-2 md:col-span-1"
            />
          </>
        )}
      </div>

      <Panel padded={false}>
        <div className="space-y-3 border-b px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <SearchInput
              value={search}
              onChange={(v) => setParam('q', v)}
              placeholder="Search name, generic, batch…"
              className="lg:w-64"
            />
            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Select value={category} onValueChange={(v) => setParam('category', v, 'all')}>
                <SelectTrigger size="sm" className="w-[160px]" aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={expiry} onValueChange={(v) => setParam('expiry', v, 'all')}>
                <SelectTrigger size="sm" className="w-[138px]" aria-label="Expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any expiry</SelectItem>
                  <SelectItem value="expiring">Expiring soon</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
              <Select value={rx} onValueChange={(v) => setParam('rx', v, 'all')}>
                <SelectTrigger size="sm" className="w-[124px]" aria-label="Medicine type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">OTC &amp; Rx</SelectItem>
                  <SelectItem value="otc">OTC only</SelectItem>
                  <SelectItem value="rx">Rx only</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => setParam('status', v, 'active')}>
                <SelectTrigger size="sm" className="w-[112px]" aria-label="Catalogue status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All items</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setParam('sort', v, 'name')}>
                <SelectTrigger size="sm" className="w-[168px]" aria-label="Sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Sort: Name</SelectItem>
                  <SelectItem value="stock">Sort: Lowest stock</SelectItem>
                  <SelectItem value="expiry">Sort: Expiring first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <FilterChips<StockFilter>
              value={stock}
              onChange={(v) => setParam('stock', v, 'all')}
              options={[
                { value: 'all', label: 'All', count: chipCount('all') },
                { value: 'in_stock', label: 'In stock', count: chipCount('in_stock') },
                { value: 'low_stock', label: 'Low stock', count: chipCount('low_stock') },
                { value: 'out_of_stock', label: 'Out of stock', count: chipCount('out_of_stock') },
              ]}
            />
            {filtersActive && (
              <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setParams(openId ? { open: String(openId) } : {}, { replace: true })}>
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {inventory.isError ? (
          <div className="p-5">
            <ErrorState error={inventory.error} retry={() => inventory.refetch()} />
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={inventory.isLoading ? undefined : rows}
            loading={inventory.isLoading}
            rowKey={(m) => m.id}
            onRowClick={(m) => openHistory(m.id)}
            rowClassName={(m) => (!m.isActive ? 'opacity-60' : undefined)}
            empty={
              <EmptyState
                icon={PackageSearch}
                title="No medicines match these filters"
                description="Try a different search or clear the filters to see the full formulary."
                action={
                  filtersActive ? (
                    <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        )}
        {!inventory.isLoading && rows.length > 0 && (
          <div className="border-t px-5 py-3 text-xs text-muted-foreground">
            Showing {rows.length} of {all.length} medicines
          </div>
        )}
      </Panel>

      <MedicineFormDialog open={formOpen} onOpenChange={setFormOpen} medicine={editing} />
      <AdjustStockDialog open={adjusting !== null} onOpenChange={(o) => !o && setAdjusting(null)} medicine={adjusting} />
      <StockHistorySheet
        medicineId={openId}
        onOpenChange={(o) => !o && setParam('open', null)}
        onEdit={(m) => {
          setEditing(m);
          setFormOpen(true);
        }}
        onAdjust={(m) => setAdjusting(m)}
      />
    </>
  );
}
