import { CalendarPlus } from 'lucide-react';
import type { Appointment } from '@shared/types';
import { QRPass } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { formatDateShort, formatTimeRange } from '@/lib/format';
import { downloadAppointmentIcs } from '../ics';

export function appointmentPassDetails(a: Appointment) {
  return [
    { label: 'Doctor', value: a.doctor.name },
    { label: 'Date', value: formatDateShort(a.date) },
    { label: 'Time', value: formatTimeRange(a.startTime, a.endTime) },
    { label: a.mode === 'video' ? 'Mode' : 'Room', value: a.mode === 'video' ? 'Video consultation' : (a.doctor.room ?? 'Health Centre') },
  ];
}

export function AppointmentPass({ appointment, className }: { appointment: Appointment; className?: string }) {
  return (
    <QRPass
      className={className}
      value={appointment.code}
      title={appointment.mode === 'video' ? 'Video consultation pass' : 'Appointment check-in pass'}
      subtitle={`${appointment.doctor.name} · ${appointment.doctor.specialty}`}
      code={appointment.code}
      details={appointmentPassDetails(appointment)}
      footnote={
        appointment.mode === 'video'
          ? 'Join the video call from the app at your appointment time.'
          : 'Show this pass at the health-centre reception to check in.'
      }
    />
  );
}

export function AppointmentPassDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-0 bg-transparent p-0 shadow-none sm:max-w-sm [&>button]:top-3 [&>button]:right-3 [&>button]:text-white">
        <DialogTitle className="sr-only">Appointment pass</DialogTitle>
        <DialogDescription className="sr-only">QR code and reference for your appointment</DialogDescription>
        {appointment && (
          <div className="space-y-3">
            <AppointmentPass appointment={appointment} />
            <Button variant="outline" className="w-full bg-white" onClick={() => downloadAppointmentIcs(appointment)}>
              <CalendarPlus /> Add to calendar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
