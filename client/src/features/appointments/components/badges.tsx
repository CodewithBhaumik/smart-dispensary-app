import { Building2, Video } from 'lucide-react';
import type { AppointmentMode } from '@shared/constants';
import type { Appointment } from '@shared/types';
import { StatusBadge, ToneBadge } from '@/components/app';
import { isMissed } from '../utils';

export function ModeBadge({ mode, className }: { mode: AppointmentMode; className?: string }) {
  return mode === 'video' ? (
    <ToneBadge tone="violet" icon={<Video />} className={className}>
      Video
    </ToneBadge>
  ) : (
    <ToneBadge tone="slate" icon={<Building2 />} className={className}>
      In-person
    </ToneBadge>
  );
}

/** Status pill that shows "Missed" for scheduled visits whose day has passed. */
export function AppointmentStatusBadge({ appointment }: { appointment: Pick<Appointment, 'status' | 'date'> }) {
  if (isMissed(appointment)) {
    return (
      <ToneBadge tone="slate" dot>
        Missed
      </ToneBadge>
    );
  }
  return <StatusBadge kind="appointment" status={appointment.status} />;
}
