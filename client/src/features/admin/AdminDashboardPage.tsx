import { Link } from 'react-router';
import { format } from 'date-fns';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  GraduationCap,
  Package,
  PieChart as PieChartIcon,
  Pill,
  ShieldCheck,
  Siren,
  Stethoscope,
  Truck,
  Users,
} from 'lucide-react';
import { APPOINTMENT_STATUS_LABELS, EMERGENCY_SEVERITY_LABELS, type AppointmentStatus } from '@shared/constants';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageSkeleton,
  Panel,
  StatCard,
  StatusBadge,
  TONE_TILE,
  UserAvatar,
} from '@/components/app';
import { Button } from '@/components/ui/button';
import { formatDateLong, formatINR, parseDate, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ACTIVITY_META } from './activity-ui';
import { useAdminDashboard } from './api';
import { ChartLegend, ChartPanel, Columns, Donut, HorizontalBars, SERIES, StackedColumns } from './charts';

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: SERIES.blue,
  checked_in: SERIES.amber,
  in_progress: SERIES.violet,
  completed: SERIES.teal,
  cancelled: SERIES.rose,
};
const STATUS_ORDER: AppointmentStatus[] = ['scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled'];

const shortDate = (d: string) => format(parseDate(d), 'd MMM');
const longDate = (d: string) => format(parseDate(d), 'EEE, d MMM yyyy');
const hourLabel = (h: string) => {
  const hour = Number(h.slice(0, 2));
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
};

export default function AdminDashboardPage() {
  const { data, isLoading, isError, error, refetch } = useAdminDashboard();

  if (isLoading) return <PageSkeleton stats={8} />;
  if (isError || !data) return <ErrorState error={error} retry={() => refetch()} />;

  const k = data.kpis;
  const closed = k.appointmentsCompleted + k.appointmentsCancelled;
  const completionRate = closed ? Math.round((k.appointmentsCompleted / closed) * 100) : 0;

  const trend = data.appointmentsOverTime;
  const trendTotals = {
    completed: trend.reduce((s, d) => s + d.completed, 0),
    scheduled: trend.reduce((s, d) => s + d.scheduled, 0),
    cancelled: trend.reduce((s, d) => s + d.cancelled, 0),
  };

  const donut = STATUS_ORDER.map((status) => ({
    key: status,
    label: APPOINTMENT_STATUS_LABELS[status],
    value: data.statusDistribution.find((d) => d.status === status)?.count ?? 0,
    color: STATUS_COLORS[status],
  }));

  const weeks = data.requestsByWeek;
  const weekTotals = {
    pickup: weeks.reduce((s, w) => s + w.pickup, 0),
    delivery: weeks.reduce((s, w) => s + w.delivery, 0),
  };

  const inventory = [...data.inventoryByCategory].sort((a, b) => b.units - a.units);
  const specialties = [...data.specialtyDemand].sort((a, b) => b.count - a.count);
  const peak = data.peakHours.reduce((best, h) => (h.count > best.count ? h : best), { hour: '', count: 0 });

  return (
    <>
      <PageHeader
        eyebrow={formatDateLong(new Date())}
        title="Health centre overview"
        description="Live operational analytics across appointments, pharmacy, users and emergencies."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/admin/activity">
                <Activity /> Activity log
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/users">
                <Users /> Manage users
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Students"
          value={k.students.toLocaleString('en-IN')}
          icon={GraduationCap}
          tone="sky"
          hint={`${k.activeUsers} active accounts in total`}
          to="/admin/users?role=student"
        />
        <StatCard
          label="Doctors"
          value={k.doctors}
          icon={Stethoscope}
          tone="teal"
          hint={`${k.staff} dispensary staff`}
          to="/admin/users?role=doctor"
        />
        <StatCard
          label="Appointments"
          value={k.appointmentsTotal.toLocaleString('en-IN')}
          icon={CalendarDays}
          tone="blue"
          hint={`${k.appointmentsToday} scheduled for today`}
          to="/admin/appointments"
        />
        <StatCard
          label="Pending appointments"
          value={k.appointmentsPending}
          icon={Clock}
          tone="amber"
          hint="Scheduled, waiting or in consultation"
          to="/admin/appointments?scope=upcoming"
        />
        <StatCard
          label="Completed consultations"
          value={k.appointmentsCompleted.toLocaleString('en-IN')}
          icon={CheckCircle2}
          tone="emerald"
          hint={`${completionRate}% completion · ${k.prescriptionsTotal} prescriptions`}
        />
        <StatCard
          label="Open medicine requests"
          value={k.requestsOpen}
          icon={ClipboardList}
          tone="indigo"
          hint={`${k.requestsFulfilled} fulfilled of ${k.requestsTotal}`}
          to="/admin/requests?status=open"
        />
        <StatCard
          label="Inventory items"
          value={k.inventoryItems}
          icon={Package}
          tone="orange"
          hint={`${k.lowStock} low stock · ${k.expiringSoon} expiring`}
          to="/admin/inventory"
        />
        <StatCard
          label="Active emergencies"
          value={k.emergenciesActive}
          icon={Siren}
          tone="rose"
          hint={`${k.emergenciesTotal} reported in total`}
          to="/admin/emergencies"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <ChartPanel
          className="lg:col-span-8"
          title="Appointments — last 30 days"
          description={`${(trendTotals.completed + trendTotals.scheduled + trendTotals.cancelled).toLocaleString('en-IN')} appointments by visit date`}
          icon={BarChart3}
          legend={
            <ChartLegend
              items={[
                { label: 'Completed', color: SERIES.teal, value: trendTotals.completed },
                { label: 'Scheduled', color: SERIES.blue, value: trendTotals.scheduled },
                { label: 'Cancelled', color: SERIES.rose, value: trendTotals.cancelled },
              ]}
            />
          }
          table={{
            headers: ['Date', 'Completed', 'Scheduled', 'Cancelled'],
            rows: trend.map((d) => [longDate(d.date), d.completed, d.scheduled, d.cancelled]),
          }}
        >
          <StackedColumns
            data={trend}
            xKey="date"
            xTickFormatter={shortDate}
            tooltipLabel={longDate}
            height={270}
            series={[
              { key: 'completed', label: 'Completed', color: SERIES.teal },
              { key: 'scheduled', label: 'Scheduled', color: SERIES.blue },
              { key: 'cancelled', label: 'Cancelled', color: SERIES.rose },
            ]}
          />
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-4"
          title="Appointment status"
          description="All appointments on record"
          icon={PieChartIcon}
          table={{ headers: ['Status', 'Appointments'], rows: donut.map((d) => [d.label, d.value]) }}
        >
          <Donut data={donut} centerLabel="appointments" size={180} layout="column" />
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-6"
          title="Medicine requests by week"
          description={`${(weekTotals.pickup + weekTotals.delivery).toLocaleString('en-IN')} requests over the last ${weeks.length} weeks`}
          icon={Truck}
          legend={
            <ChartLegend
              items={[
                { label: 'Pickup', color: SERIES.teal, value: weekTotals.pickup },
                { label: 'Campus delivery', color: SERIES.blue, value: weekTotals.delivery },
              ]}
            />
          }
          table={{ headers: ['Week of', 'Pickup', 'Delivery'], rows: weeks.map((w) => [w.week, w.pickup, w.delivery]) }}
        >
          <StackedColumns
            data={weeks}
            xKey="week"
            tooltipLabel={(w) => `Week of ${w}`}
            height={330}
            minTickGap={4}
            series={[
              { key: 'pickup', label: 'Pickup', color: SERIES.teal },
              { key: 'delivery', label: 'Campus delivery', color: SERIES.blue },
            ]}
          />
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-6"
          title="Inventory by category"
          description={`${k.inventoryUnits.toLocaleString('en-IN')} units on hand · ${formatINR(k.inventoryValue)} stock value`}
          icon={Package}
          table={{ headers: ['Category', 'Items', 'Units'], rows: inventory.map((c) => [c.category, c.items, c.units]) }}
        >
          {inventory.length === 0 ? (
            <EmptyState compact icon={Package} title="No inventory yet" />
          ) : (
            <HorizontalBars data={inventory} labelKey="category" valueKey="units" name="Units in stock" unit="units" labelWidth={150} />
          )}
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-6"
          title="Demand by specialty"
          description="Appointments booked per specialty"
          icon={Stethoscope}
          table={{ headers: ['Specialty', 'Appointments'], rows: specialties.map((s) => [s.specialty, s.count]) }}
        >
          {specialties.length === 0 ? (
            <EmptyState compact icon={Stethoscope} title="No appointments yet" />
          ) : (
            <HorizontalBars data={specialties} labelKey="specialty" valueKey="count" name="Appointments" labelWidth={170} />
          )}
        </ChartPanel>

        <ChartPanel
          className="lg:col-span-6"
          title="Peak consultation hours"
          description={peak.count ? `Busiest slot: ${hourLabel(peak.hour)} with ${peak.count} appointments` : 'Appointments by start hour'}
          icon={Clock}
          table={{ headers: ['Hour', 'Appointments'], rows: data.peakHours.map((h) => [hourLabel(h.hour), h.count]) }}
        >
          <Columns data={data.peakHours} xKey="hour" yKey="count" name="Appointments" xTickFormatter={hourLabel} tooltipLabel={hourLabel} height={232} />
        </ChartPanel>

        <Panel
          className="lg:col-span-7"
          title="Recent activity"
          description="Latest actions across the platform"
          icon={Activity}
          padded={false}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/activity">
                View log <ArrowRight />
              </Link>
            </Button>
          }
        >
          {data.recentActivity.length === 0 ? (
            <EmptyState compact icon={Activity} title="No activity yet" />
          ) : (
            <ul className="divide-y">
              {data.recentActivity.slice(0, 7).map((a) => {
                const meta = ACTIVITY_META[a.category] ?? ACTIVITY_META.system;
                return (
                  <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1', TONE_TILE[meta.tone])}>
                      <meta.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-5 text-slate-700">{a.description}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {a.actor && (
                          <>
                            <UserAvatar user={a.actor} size="xs" />
                            {a.actor.name} ·
                          </>
                        )}
                        {timeAgo(a.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-6 lg:col-span-5">
        <Panel
          title="Active emergencies"
          description={k.emergenciesActive ? 'Unresolved requests needing a response' : 'Campus response status'}
          icon={Siren}
          padded={false}
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/emergencies">
                Open board <ArrowRight />
              </Link>
            </Button>
          }
        >
          {data.activeEmergencies.length === 0 ? (
            <EmptyState compact icon={ShieldCheck} title="All clear" description="No unresolved emergencies right now." />
          ) : (
            <ul className="divide-y">
              {data.activeEmergencies.map((e) => (
                <li key={e.id}>
                  <Link to={`/admin/emergencies?open=${e.id}`} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                    <span className="mt-1 flex size-2.5 shrink-0 rounded-full bg-rose-500 ring-4 ring-rose-100" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-slate-900">
                        {e.category} · {EMERGENCY_SEVERITY_LABELS[e.severity]}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {e.student.name} · {e.location} · {timeAgo(e.createdAt)}
                      </span>
                    </span>
                    <StatusBadge kind="emergency" status={e.status} noDot />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Pharmacy snapshot" description="Stock and dispensing at a glance" icon={Pill} padded={false}>
          <ul className="divide-y">
            {[
              { label: 'Stock value', value: formatINR(k.inventoryValue), to: '/admin/inventory' },
              { label: 'Units on hand', value: k.inventoryUnits.toLocaleString('en-IN'), to: '/admin/inventory' },
              { label: 'Low-stock items', value: k.lowStock, to: '/admin/inventory?stock=low_stock', warn: k.lowStock > 0 },
              { label: 'Expiring within 60 days', value: k.expiringSoon, to: '/admin/inventory?expiry=expiring&sort=expiry', warn: k.expiringSoon > 0 },
              { label: 'Prescriptions issued', value: k.prescriptionsTotal.toLocaleString('en-IN'), to: '/admin/appointments?status=completed' },
              { label: 'Requests fulfilled', value: k.requestsFulfilled.toLocaleString('en-IN'), to: '/admin/requests?status=fulfilled' },
            ].map((row) => (
              <li key={row.label}>
                <Link to={row.to} className="flex items-center justify-between gap-3 px-5 py-2.5 text-[13px] transition-colors hover:bg-muted/40">
                  <span className="text-slate-600">{row.label}</span>
                  <span className={cn('font-semibold tabular-nums', row.warn ? 'text-amber-700' : 'text-slate-900')}>{row.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        </div>
      </div>
    </>
  );
}
