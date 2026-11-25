import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Hourglass,
  Inbox,
  Package,
  PackagePlus,
  Siren,
  Truck,
} from 'lucide-react';
import { EMERGENCY_SEVERITY_LABELS } from '@shared/constants';
import type { Medicine } from '@shared/types';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  Panel,
  StatCard,
  StatusBadge,
  ToneBadge,
  UserAvatar,
} from '@/components/app';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { firstName, formatDateLong, formatDayLabel, greeting, timeAgo } from '@/lib/format';
import { Columns } from '@/features/admin/charts';
import { AdjustStockDialog } from '@/features/inventory/AdjustStockDialog';
import { StockBar } from '@/features/inventory/inventory-ui';
import { useStaffDashboard } from './api';
import { RequestDetailSheet } from './RequestDetailSheet';
import { FulfilmentLabel, hasShortfall, itemsSummary, RequestActions } from './request-ui';

export default function StaffDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useStaffDashboard();
  const [restock, setRestock] = useState<Medicine | null>(null);
  const [openRequest, setOpenRequest] = useState<number | null>(null);
  const base = `/${user.role}`;

  if (isLoading) return <PageSkeleton stats={6} />;
  if (isError || !data) return <ErrorState error={error} retry={() => refetch()} />;

  const s = data.stats;
  const dispensedTotal = data.dispensedLast7Days.reduce((sum, d) => sum + d.units, 0);
  const requestsTotal = data.dispensedLast7Days.reduce((sum, d) => sum + d.requests, 0);
  const chartData = data.dispensedLast7Days.map((d) => ({ ...d, day: formatDayLabel(d.date) }));

  return (
    <>
      <PageHeader
        eyebrow={formatDateLong(new Date())}
        title={`${greeting()}, ${firstName(user.name)}`}
        description="Here's what needs your attention at the dispensary counter today."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`${base}/inventory`}>
                <Package /> Inventory
              </Link>
            </Button>
            <Button asChild>
              <Link to={`${base}/requests?status=open`}>
                <ClipboardList /> Open requests
              </Link>
            </Button>
          </>
        }
      />

      {data.activeEmergencies.length > 0 && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 sm:flex-row sm:items-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
            <Siren className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-rose-900">
              {data.activeEmergencies.length === 1
                ? '1 emergency needs a response'
                : `${data.activeEmergencies.length} emergencies need a response`}
            </p>
            <p className="truncate text-sm text-rose-800/90">
              {data.activeEmergencies
                .slice(0, 2)
                .map((e) => `${e.category} · ${EMERGENCY_SEVERITY_LABELS[e.severity]} · ${e.location}`)
                .join('  |  ')}
            </p>
          </div>
          <Button asChild variant="destructive" className="shrink-0">
            <Link to={`${base}/emergencies?open=${data.activeEmergencies[0].id}`}>
              Respond now <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Pending"
          value={s.pendingRequests}
          icon={Inbox}
          tone="sky"
          hint="Awaiting approval"
          to={`${base}/requests?status=submitted`}
        />
        <StatCard
          label="Preparing"
          value={s.inProgress}
          icon={Hourglass}
          tone="amber"
          hint="Approved & preparing"
          to={`${base}/requests?status=open`}
        />
        <StatCard
          label="Ready / out"
          value={s.readyForPickup + s.outForDelivery}
          icon={Truck}
          tone="indigo"
          hint={`${s.readyForPickup} pickup · ${s.outForDelivery} delivery`}
          to={`${base}/requests?status=open`}
        />
        <StatCard label="Fulfilled" value={s.fulfilledToday} icon={CheckCircle2} tone="emerald" hint="Today · dispensed & closed" />
        <StatCard
          label="Low stock"
          value={s.lowStock + s.outOfStock}
          icon={AlertTriangle}
          tone="orange"
          hint={`${s.outOfStock} out of stock`}
          to={`${base}/inventory?stock=low_stock`}
        />
        <StatCard
          label="Expiring"
          value={s.expiringSoon}
          icon={CalendarClock}
          tone="rose"
          hint={`≤ 60 days · ${s.expired} expired`}
          to={`${base}/inventory?expiry=expiring&sort=expiry`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
          <Panel
            className="xl:col-span-2"
            title="Needs action"
            description="Open requests, oldest first — take each one to its next step."
            icon={ClipboardList}
            padded={false}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to={`${base}/requests`}>
                  View all <ArrowRight />
                </Link>
              </Button>
            }
          >
            {data.actionQueue.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="All caught up"
                description="No medicine requests are waiting. New ones appear here instantly."
                compact
              />
            ) : (
              <ul className="divide-y">
                {data.actionQueue.slice(0, 7).map((r) => (
                  <li
                    key={r.id}
                    className="flex cursor-pointer flex-col gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40 md:flex-row md:items-center"
                    onClick={() => setOpenRequest(r.id)}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <UserAvatar user={r.student} size="sm" />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm">
                          <span className="font-medium text-slate-900">{r.student.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {itemsSummary(r)} · {timeAgo(r.createdAt)}
                          {hasShortfall(r) && <span className="ml-1.5 font-medium text-rose-600">· low stock</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 pl-11 md:pl-0">
                      <FulfilmentLabel request={r} className="hidden lg:inline-flex" />
                      <StatusBadge kind="request" status={r.status} />
                      <RequestActions request={r} primaryOnly size="xs" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.actionQueue.length > 7 && (
              <div className="border-t px-5 py-3 text-xs text-muted-foreground">
                +{data.actionQueue.length - 7} more open requests ·{' '}
                <Link to={`${base}/requests?status=open`} className="font-medium text-primary hover:underline">
                  see all
                </Link>
              </div>
            )}
          </Panel>


          <Panel
            title="Low stock"
            description="At or below minimum level"
            icon={AlertTriangle}
            padded={false}
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to={`${base}/inventory?stock=low_stock`}>Inventory</Link>
              </Button>
            }
          >
            {data.lowStockItems.length === 0 ? (
              <EmptyState compact icon={CheckCircle2} title="Stock levels healthy" description="No medicine is below its minimum." />
            ) : (
              <ul className="divide-y">
                {data.lowStockItems.slice(0, 6).map((m) => (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Link to={`${base}/inventory?open=${m.id}`} className="truncate text-[13px] font-medium text-slate-900 hover:text-primary">
                          {m.name}
                        </Link>
                        <StatusBadge kind="stock" status={m.stockStatus} noDot />
                      </div>
                      <StockBar medicine={m} />
                    </div>
                    <Button variant="outline" size="xs" onClick={() => setRestock(m)} aria-label={`Restock ${m.name}`}>
                      <PackagePlus /> Restock
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            className="xl:col-span-2"
            title="Dispensed in the last 7 days"
            description={`${dispensedTotal.toLocaleString('en-IN')} units across ${requestsTotal} fulfilled requests`}
            icon={PackagePlus}
          >
            {dispensedTotal === 0 ? (
              <EmptyState compact icon={Package} title="Nothing dispensed this week" description="Fulfilled requests will chart here." />
            ) : (
              <Columns data={chartData} xKey="day" yKey="units" name="Units dispensed" unit="units" height={290} />
            )}
          </Panel>

          <Panel title="Expiring soon" description="Use first or remove from shelves" icon={CalendarClock} padded={false}>
            {data.expiringItems.length === 0 ? (
              <EmptyState compact icon={CheckCircle2} title="No batches expiring soon" />
            ) : (
              <ul className="divide-y">
                {data.expiringItems.slice(0, 5).map((m) => (
                  <li key={m.id}>
                    <Link
                      to={`${base}/inventory?open=${m.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-slate-900">{m.name}</span>
                        <span className="text-xs text-muted-foreground">
                          Batch {m.batchNo ?? '—'} · {m.stockQuantity} units
                        </span>
                      </span>
                      <ToneBadge tone={m.expiryStatus === 'expired' ? 'rose' : (m.daysToExpiry ?? 99) <= 30 ? 'orange' : 'amber'}>
                        {m.expiryStatus === 'expired' ? 'Expired' : `${m.daysToExpiry}d left`}
                      </ToneBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" description="Latest pharmacy and emergency actions" icon={Activity} padded={false} className="xl:col-span-3">
            {data.recentActivity.length === 0 ? (
              <EmptyState compact icon={Activity} title="No recent activity" />
            ) : (
              <ul className="grid divide-y md:grid-cols-2 md:divide-y-0">
                {data.recentActivity.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex gap-3 border-border/70 px-5 py-3 md:border-b">
                    {a.actor ? (
                      <UserAvatar user={a.actor} size="xs" className="mt-0.5" />
                    ) : (
                      <span className="mt-0.5 size-6 rounded-full bg-slate-100" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] leading-5 text-slate-700">{a.description}</p>
                      <p className="text-[11px] text-muted-foreground">{timeAgo(a.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {user.role === 'admin' && (
              <div className="border-t px-5 py-3">
                <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('/admin/activity')}>
                  Full activity log
                </Button>
              </div>
            )}
          </Panel>
      </div>

      <AdjustStockDialog open={restock !== null} onOpenChange={(o) => !o && setRestock(null)} medicine={restock} defaultType="restock" />
      <RequestDetailSheet requestId={openRequest} onOpenChange={(o) => !o && setOpenRequest(null)} />
    </>
  );
}
