import { Droplet, Info, MapPin, Phone, ShieldCheck, UserRoundCheck, Users } from 'lucide-react';
import { EMERGENCY_STATUSES, EMERGENCY_STATUS_LABELS } from '@shared/constants';
import {
  ErrorState,
  KeyValueGrid,
  ProgressSteps,
  StatusBadge,
  Timeline,
  ToneBadge,
  UserAvatar,
} from '@/components/app';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useEmergencyDetail } from './api';
import { EmergencyActions } from './EmergencyActions';

const STEPS = EMERGENCY_STATUSES.map((s) => ({ key: s, label: EMERGENCY_STATUS_LABELS[s] }));

export function EmergencyDetailSheet({ emergencyId, onOpenChange }: { emergencyId: number | null; onOpenChange: (open: boolean) => void }) {
  const query = useEmergencyDetail(emergencyId);
  const e = query.data;

  return (
    <Sheet open={emergencyId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 bg-card p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-6 py-5 pr-12">
          {e ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge kind="emergency" status={e.status} />
                <StatusBadge kind="severity" status={e.severity} noDot />
                <span className="text-xs text-muted-foreground">Reported {timeAgo(e.createdAt)}</span>
              </div>
              <SheetTitle className="font-display text-xl">{e.category}</SheetTitle>
              <SheetDescription className="font-mono">{e.code}</SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="sr-only">Emergency</SheetTitle>
              <SheetDescription className="sr-only">Loading emergency</SheetDescription>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-7 w-56" />
            </>
          )}
        </SheetHeader>

        <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} />}
          {!e && query.isLoading && <Skeleton className="h-64 w-full" />}
          {e && (
            <>
              <ProgressSteps steps={STEPS} current={e.status} />

              <section className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
                <p className="text-sm text-slate-800">{e.description}</p>
                <div className="mt-3 grid gap-2 text-[13px] text-slate-700 sm:grid-cols-2">
                  <span className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-rose-400" /> {e.location}
                  </span>
                  <a href={`tel:${e.contactPhone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 font-medium hover:text-primary">
                    <Phone className="size-3.5 text-rose-400" /> {e.contactPhone}
                  </a>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-900">Student</h3>
                <div className="flex items-start gap-3 rounded-xl border p-4">
                  <UserAvatar user={e.student} size="md" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="font-medium text-slate-900">{e.student.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.student.rollNo} · {e.student.department} · Year {e.student.year}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {e.student.bloodGroup && (
                        <ToneBadge tone="rose" icon={<Droplet />}>
                          {e.student.bloodGroup}
                        </ToneBadge>
                      )}
                      {e.student.allergies.map((a) => (
                        <ToneBadge key={a} tone="rose">
                          Allergy: {a}
                        </ToneBadge>
                      ))}
                      {e.student.conditions.map((c) => (
                        <ToneBadge key={c} tone="amber">
                          {c}
                        </ToneBadge>
                      ))}
                      {!e.student.bloodGroup && e.student.allergies.length === 0 && e.student.conditions.length === 0 && (
                        <span className="text-xs text-muted-foreground">No medical alerts on file</span>
                      )}
                    </div>
                  </div>
                </div>
                <KeyValueGrid
                  items={[
                    {
                      label: 'Residence',
                      value: [e.student.hostel, e.student.room && `Room ${e.student.room}`].filter(Boolean).join(', ') || '—',
                    },
                    {
                      label: 'Emergency contact',
                      value: e.emergencyContact ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="size-3.5 text-slate-400" /> {e.emergencyContact}
                        </span>
                      ) : (
                        '—'
                      ),
                    },
                    ...(e.additionalInfo ? [{ label: 'Additional information', value: e.additionalInfo, full: true }] : []),
                  ]}
                />
              </section>

              {(e.responderName || e.resolutionNotes) && (
                <section className="grid gap-3 sm:grid-cols-2">
                  {e.responderName && (
                    <div className="rounded-xl border p-4">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <UserRoundCheck className="size-3.5 text-blue-500" /> Responder
                      </p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{e.responderName}</p>
                      {e.responderPhone && (
                        <a href={`tel:${e.responderPhone.replace(/\s/g, '')}`} className="text-[13px] text-slate-600 hover:text-primary">
                          {e.responderPhone}
                        </a>
                      )}
                      {e.assignedAt && <p className="mt-1 text-[11px] text-muted-foreground">Assigned {formatDateTime(e.assignedAt)}</p>}
                    </div>
                  )}
                  {e.resolutionNotes && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                        <ShieldCheck className="size-3.5" /> Resolution
                      </p>
                      <p className="mt-1 text-sm text-emerald-950">{e.resolutionNotes}</p>
                      {e.resolvedAt && <p className="mt-1 text-[11px] text-emerald-700/80">Resolved {formatDateTime(e.resolvedAt)}</p>}
                    </div>
                  )}
                </section>
              )}

              <section>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Response timeline</h3>
                <Timeline events={e.timeline} labels={EMERGENCY_STATUS_LABELS} />
              </section>

              <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-slate-600">
                <Info className="mt-px size-3.5 shrink-0 text-slate-400" />
                This is the campus response workflow. Updating the status notifies the student; it does not dispatch an ambulance
                automatically. For life-threatening cases call 108 immediately.
              </p>
            </>
          )}
        </div>

        {e && e.status !== 'resolved' && (
          <div className="flex justify-end border-t bg-muted/30 px-6 py-4">
            <EmergencyActions emergency={e} size="default" className="justify-end" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
