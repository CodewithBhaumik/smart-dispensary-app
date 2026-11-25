import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarCheck2, CalendarPlus, CalendarX2, History } from 'lucide-react';
import type { Appointment } from '@shared/types';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCall } from '@/features/calls/CallProvider';
import { useMyAppointments } from './api';
import { CancelAppointmentDialog, RescheduleDialog } from './components/AppointmentDialogs';
import { AppointmentCard } from './components/AppointmentCard';
import { AppointmentDetailSheet } from './components/AppointmentDetailSheet';
import { partitionAppointments } from './utils';

type TabKey = 'upcoming' | 'past' | 'cancelled';

export default function StudentAppointmentsPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError, error, refetch } = useMyAppointments();
  const { startCall } = useCall();
  const [tab, setTab] = useState<TabKey>((params.get('tab') as TabKey) || 'upcoming');
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);

  const groups = useMemo(() => partitionAppointments(data ?? []), [data]);
  const openId = params.get('open') ? Number(params.get('open')) : null;

  const openDetail = (a: Appointment) => {
    const next = new URLSearchParams(params);
    next.set('open', String(a.id));
    setParams(next, { replace: false });
  };
  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  };
  const join = (a: Appointment) => startCall(a.doctor, { appointmentId: a.id });

  const lists: Record<TabKey, Appointment[]> = groups;
  const empty: Record<TabKey, { title: string; description: string; icon: typeof CalendarPlus }> = {
    upcoming: {
      icon: CalendarCheck2,
      title: 'No upcoming appointments',
      description: 'Book a slot with a doctor at the health centre — it takes less than a minute.',
    },
    past: {
      icon: History,
      title: 'No past visits yet',
      description: 'Completed consultations and their summaries will appear here.',
    },
    cancelled: {
      icon: CalendarX2,
      title: 'Nothing cancelled',
      description: 'Appointments you or the health centre cancel are listed here.',
    },
  };

  return (
    <>
      <PageHeader
        title="My appointments"
        description="Track upcoming visits, check-in passes, consultation summaries and past appointments."
        actions={
          <Button asChild>
            <Link to="/student/book">
              <CalendarPlus /> Book appointment
            </Link>
          </Button>
        }
      />

      {isError ? (
        <ErrorState error={error} retry={() => refetch()} />
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="gap-5">
          <TabsList className="h-10 bg-white p-1 shadow-xs ring-1 ring-border">
            {(['upcoming', 'past', 'cancelled'] as TabKey[]).map((key) => (
              <TabsTrigger key={key} value={key} className="h-8 px-3.5 capitalize data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                {key}
                <span className="ml-1 rounded-full bg-black/5 px-1.5 text-[11px] font-semibold tabular-nums in-data-[state=active]:bg-white/20">
                  {isLoading ? '–' : lists[key].length}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {(['upcoming', 'past', 'cancelled'] as TabKey[]).map((key) => (
            <TabsContent key={key} value={key} className="space-y-3">
              {isLoading ? (
                <div className="rounded-xl border bg-card p-5">
                  <ListSkeleton rows={4} />
                </div>
              ) : lists[key].length === 0 ? (
                <div className="rounded-xl border bg-card">
                  <EmptyState
                    icon={empty[key].icon}
                    title={empty[key].title}
                    description={empty[key].description}
                    action={
                      key === 'upcoming' ? (
                        <Button asChild>
                          <Link to="/student/book">
                            <CalendarPlus /> Book appointment
                          </Link>
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                lists[key].map((a) => (
                  <AppointmentCard
                    key={a.id}
                    appointment={a}
                    onOpen={openDetail}
                    onReschedule={setRescheduling}
                    onCancel={setCancelling}
                    onJoin={join}
                  />
                ))
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <AppointmentDetailSheet
        appointmentId={openId}
        onClose={closeDetail}
        onReschedule={setRescheduling}
        onCancel={setCancelling}
        onJoin={join}
      />
      <RescheduleDialog
        appointment={rescheduling}
        open={rescheduling !== null}
        onOpenChange={(o) => !o && setRescheduling(null)}
      />
      <CancelAppointmentDialog
        appointment={cancelling}
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        onDone={() => setTab('cancelled')}
      />
    </>
  );
}
