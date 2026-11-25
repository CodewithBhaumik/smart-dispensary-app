import { Link, useNavigate, useParams } from 'react-router';
import {
  BriefcaseMedical,
  CalendarOff,
  CalendarPlus,
  Clock,
  Languages,
  Loader2,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Stethoscope,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { WEEKDAY_LABELS } from '@shared/constants';
import { ErrorState, PageSkeleton, Panel, ToneBadge, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api';
import { formatDateLong, formatNumber, formatTimeRange, toDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DateStrip } from '../appointments/components/DateStrip';
import { useDoctor, useDoctorAvailability, useStartConversation } from './api';
import { availabilityLine, ModeChips } from './components/DoctorCard';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function DoctorProfilePage() {
  const { id } = useParams();
  const doctorId = Number(id);
  const navigate = useNavigate();
  const doctor = useDoctor(Number.isFinite(doctorId) ? doctorId : null);
  const availability = useDoctorAvailability(Number.isFinite(doctorId) ? doctorId : null);
  const startConversation = useStartConversation();

  if (doctor.isError) {
    return (
      <>
        <Link to="/student/doctors" className="mb-4 inline-block text-sm font-medium text-primary hover:underline">
          ← All doctors
        </Link>
        <ErrorState error={doctor.error} retry={() => doctor.refetch()} />
      </>
    );
  }
  if (!doctor.data) return <PageSkeleton stats={0} />;

  const d = doctor.data;
  const line = availabilityLine(d);
  const today = new Date().getDay();
  const upcomingLeaves = d.leaves.filter((l) => l.date >= toDateStr()).slice(0, 5);

  const message = async () => {
    try {
      const conversation = await startConversation.mutateAsync(d.id);
      navigate(`/student/messages?c=${conversation.id}`);
    } catch (e) {
      toast.error(getErrorMessage(e));
    }
  };

  return (
    <>
      <Link
        to="/student/doctors"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        ← All doctors
      </Link>

      <section className="relative mb-6 overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="h-24 bg-[#0b1b33] sm:h-28">
          <div className="bg-grid h-full w-full opacity-70" />
        </div>
        <div className="px-5 pb-6 sm:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="-mt-12 w-fit shrink-0 rounded-full bg-card p-1.5 shadow-sm">
                <UserAvatar user={d} size="xl" className="[&>span]:size-20 [&>span]:text-2xl" />
              </span>
              <div className="space-y-1.5 sm:pt-4">
                <h1 className="text-2xl font-semibold text-slate-900">{d.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {d.title ?? 'Medical Officer'} · {d.qualifications}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ToneBadge tone="teal" icon={<Stethoscope />}>
                    {d.specialty}
                  </ToneBadge>
                  {d.isVisiting && <ToneBadge tone="violet">Visiting consultant</ToneBadge>}
                  <ToneBadge tone={d.isAccepting ? 'emerald' : 'slate'} dot>
                    {d.isAccepting ? 'Accepting appointments' : 'Not accepting'}
                  </ToneBadge>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:pt-5">
              <Button variant="outline" onClick={message} disabled={startConversation.isPending}>
                {startConversation.isPending ? <Loader2 className="animate-spin" /> : <MessageSquare />}
                Message
              </Button>
              <Button asChild disabled={!d.isAccepting}>
                <Link
                  to={d.isAccepting ? `/student/book?doctorId=${d.id}` : '#'}
                  onClick={(e) => !d.isAccepting && e.preventDefault()}
                  className={cn(!d.isAccepting && 'pointer-events-none opacity-50')}
                >
                  <CalendarPlus /> Book appointment
                </Link>
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-3">
              {d.bio && <p className="max-w-3xl text-[15px] leading-relaxed text-slate-600">{d.bio}</p>}
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-600">
                {d.experienceYears !== null && (
                  <span className="inline-flex items-center gap-1.5">
                    <BriefcaseMedical className="size-4 text-slate-400" /> {Math.round(d.experienceYears)} years of experience
                  </span>
                )}
                {d.languages.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Languages className="size-4 text-slate-400" /> {d.languages.join(', ')}
                  </span>
                )}
                {d.room && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4 text-slate-400" /> {d.room}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4 text-slate-400" /> {d.slotMinutes}-minute appointments
                </span>
              </div>
              <ModeChips modes={d.consultationModes} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/30 p-3.5">
                <UsersRound className="size-4 text-teal-600" />
                <p className="mt-2 font-display text-xl font-semibold text-slate-900 tabular-nums">
                  {formatNumber(d.patientsSeen)}
                </p>
                <p className="text-xs text-muted-foreground">Students treated</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3.5">
                <ShieldCheck className="size-4 text-teal-600" />
                <p className="mt-2 font-display text-xl font-semibold text-slate-900 tabular-nums">
                  {formatNumber(d.completedConsultations)}
                </p>
                <p className="text-xs text-muted-foreground">Consultations</p>
              </div>
              <div className="col-span-2 flex items-center gap-2 rounded-xl border bg-muted/30 px-3.5 py-2.5">
                <span className={cn('size-2 rounded-full', line.dot)} />
                <span className={cn('text-[13px] font-medium', line.className)}>{line.text}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel
            title="Availability · next 14 days"
            description="Pick a day to see open time slots and book."
            icon={CalendarPlus}
          >
            {availability.isError ? (
              <ErrorState error={availability.error} retry={() => availability.refetch()} />
            ) : (
              <DateStrip
                days={availability.data}
                loading={availability.isLoading}
                value={null}
                onChange={(date) => navigate(`/student/book?doctorId=${d.id}&date=${date}`)}
              />
            )}
          </Panel>

          <Panel title="Weekly OPD timetable" description="Regular consultation hours at the health centre." icon={Clock} padded={false}>
            <ul className="divide-y">
              {WEEK_ORDER.map((weekday) => {
                const blocks = d.schedule
                  .filter((b) => b.weekday === weekday)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                const isToday = weekday === today;
                return (
                  <li
                    key={weekday}
                    className={cn('flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center', isToday && 'bg-teal-50/50')}
                  >
                    <span className="flex w-36 shrink-0 items-center gap-2 text-sm font-medium text-slate-800">
                      {WEEKDAY_LABELS[weekday]}
                      {isToday && (
                        <span className="rounded bg-primary px-1.5 py-px text-[10px] font-semibold text-white uppercase">
                          Today
                        </span>
                      )}
                    </span>
                    {blocks.length === 0 ? (
                      <span className="text-sm text-slate-400">No OPD</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {blocks.map((b) => (
                          <span
                            key={`${b.startTime}-${b.endTime}`}
                            className="rounded-md bg-white px-2.5 py-1 text-[13px] font-medium text-slate-700 tabular-nums ring-1 ring-border"
                          >
                            {formatTimeRange(b.startTime, b.endTime)}
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Planned leave" icon={CalendarOff}>
            {upcomingLeaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leave planned in the coming weeks.</p>
            ) : (
              <ul className="space-y-2.5">
                {upcomingLeaves.map((l) => (
                  <li key={l.id} className="rounded-lg border bg-amber-50/50 px-3 py-2">
                    <p className="text-sm font-medium text-slate-900">{formatDateLong(l.date)}</p>
                    {l.reason && <p className="text-xs text-muted-foreground">{l.reason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Before your visit" icon={ShieldCheck}>
            <ul className="space-y-2.5 text-[13px] leading-relaxed text-slate-600">
              <li>Carry your student ID card and your check-in pass.</li>
              <li>Mention allergies and current medicines — your profile shares them with the doctor.</li>
              <li>Arrive 5 minutes early; tokens are issued at check-in.</li>
              <li>
                For urgent help, use{' '}
                <Link to="/student/emergency" className="font-medium text-rose-600 hover:underline">
                  Emergency assistance
                </Link>
                .
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
