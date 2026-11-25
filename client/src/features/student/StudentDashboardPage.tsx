import { Link } from 'react-router';
import { CalendarDays, CalendarPlus, FileText, HeartPulse, PackageCheck } from 'lucide-react';
import { ErrorState, PageSkeleton, StatCard } from '@/components/app';
import { getDispensaryStatus } from '@/components/layout/dispensary-hours';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { firstName, formatDateLong, greeting } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useStudentDashboard } from './api';
import {
  ActiveEmergencyBanner,
  EmergencyHelpCard,
  HealthProfileCard,
  LatestNotifications,
  NextAppointmentCard,
  QuickActions,
  RecentPrescriptions,
  RequestTracker,
} from './components/DashboardCards';

export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useStudentDashboard();
  const status = getDispensaryStatus();

  if (isError) return <ErrorState error={error} retry={() => refetch()} />;
  if (isLoading || !data) return <PageSkeleton />;

  const more = data.upcomingAppointments.filter((a) => a.id !== data.nextAppointment?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-muted-foreground">{formatDateLong(new Date())}</p>
          <h1 className="text-2xl leading-tight font-semibold text-slate-900 sm:text-[28px]">
            {greeting()}, {firstName(user.name)}
          </h1>
          <p className="text-sm text-muted-foreground">Here&apos;s an overview of your health and upcoming care.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full border bg-card px-3 text-[13px] font-medium shadow-xs',
              status.open ? 'text-emerald-700' : 'text-slate-600',
            )}
          >
            <span className="relative flex size-2">
              {status.open && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
              <span className={cn('relative inline-flex size-2 rounded-full', status.open ? 'bg-emerald-500' : 'bg-slate-400')} />
            </span>
            {status.open ? 'Dispensary open' : 'Dispensary closed'}
            <span className="hidden font-normal text-muted-foreground md:inline">· {status.label}</span>
          </span>
          <Button asChild>
            <Link to="/student/book">
              <CalendarPlus /> Book appointment
            </Link>
          </Button>
        </div>
      </div>

      {data.activeEmergency && <ActiveEmergencyBanner emergency={data.activeEmergency} />}

      <QuickActions />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label="Upcoming appointments"
          value={data.stats.upcomingAppointments}
          icon={CalendarDays}
          tone="blue"
          hint={data.nextAppointment ? 'Next one shown below' : 'Nothing booked yet'}
          to="/student/appointments"
        />
        <StatCard
          label="Active prescriptions"
          value={data.stats.activePrescriptions}
          icon={FileText}
          tone="violet"
          hint="Valid for 30 days after issue"
          to="/student/prescriptions"
        />
        <StatCard
          label="Requests in progress"
          value={data.stats.requestsInProgress}
          icon={PackageCheck}
          tone="amber"
          hint="Pharmacy pickups & deliveries"
          to="/student/requests"
        />
        <StatCard
          label="Visits this year"
          value={data.stats.visitsThisYear}
          icon={HeartPulse}
          tone="emerald"
          hint="Completed consultations"
          to="/student/records"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <NextAppointmentCard appointment={data.nextAppointment} more={more} />
          <RequestTracker requests={data.activeRequests} />
          <RecentPrescriptions prescriptions={data.recentPrescriptions} />
        </div>
        <div className="min-w-0 space-y-6">
          <HealthProfileCard user={user} completion={data.profileCompletion} />
          <LatestNotifications notifications={data.recentNotifications} />
          <EmergencyHelpCard />
        </div>
      </div>
    </div>
  );
}
