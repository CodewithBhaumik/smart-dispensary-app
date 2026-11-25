import { Link } from 'react-router';
import { ArrowUpRight, Droplets, Phone } from 'lucide-react';
import type { PatientSummary } from '@shared/types';
import { UserAvatar } from '@/components/app';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AllergyAlert, ChipList, SectionLabel } from './clinic-bits';

function demographics(p: PatientSummary): string {
  return [p.age ? `${p.age} yrs` : null, p.gender].filter(Boolean).join(' · ');
}

/** Patient medical snapshot used in the appointment sheet, consultation workspace and dashboards. */
export function PatientSnapshot({
  patient,
  className,
  showLink = true,
  dense = false,
}: {
  patient: PatientSummary;
  className?: string;
  showLink?: boolean;
  dense?: boolean;
}) {
  const demo = demographics(patient);
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-start gap-3">
        <UserAvatar user={patient} size={dense ? 'md' : 'lg'} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold text-slate-900">{patient.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">
            {patient.rollNo} · {patient.program} {patient.department}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            {demo && <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{demo}</span>}
            {patient.year ? <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Year {patient.year}</span> : null}
            {patient.bloodGroup && (
              <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">
                <Droplets className="size-3" /> {patient.bloodGroup}
              </span>
            )}
          </div>
        </div>
        {showLink && (
          <Link
            to={`/doctor/patients/${patient.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-accent"
          >
            Record <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>

      <AllergyAlert allergies={patient.allergies} />

      <div className={cn('grid gap-4', dense ? 'grid-cols-1' : 'sm:grid-cols-2')}>
        <div className="space-y-1.5">
          <SectionLabel>Conditions</SectionLabel>
          <ChipList items={patient.conditions} tone="amber" />
        </div>
        <div className="space-y-1.5">
          <SectionLabel>Current medication</SectionLabel>
          <ChipList items={patient.medications} tone="blue" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-[13px]">
        <div>
          <p className="text-[11px] text-muted-foreground">Last visit</p>
          <p className="font-medium text-slate-800">{patient.lastVisit ? formatDate(patient.lastVisit) : 'First visit'}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">Total visits</p>
          <p className="font-medium text-slate-800 tabular-nums">{patient.totalVisits}</p>
        </div>
        {(patient.heightCm || patient.weightKg) && (
          <div>
            <p className="text-[11px] text-muted-foreground">Height · Weight</p>
            <p className="font-medium text-slate-800">
              {patient.heightCm ? `${patient.heightCm} cm` : '—'} · {patient.weightKg ? `${patient.weightKg} kg` : '—'}
            </p>
          </div>
        )}
        {patient.phone && (
          <div>
            <p className="text-[11px] text-muted-foreground">Phone</p>
            <a href={`tel:${patient.phone}`} className="inline-flex items-center gap-1 font-medium text-slate-800 hover:text-primary">
              <Phone className="size-3" /> {patient.phone}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
