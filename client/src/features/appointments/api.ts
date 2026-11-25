import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppointmentMode } from '@shared/constants';
import type { Appointment, AppointmentDetail } from '@shared/types';
import { api } from '@/lib/api';

const AFFECTED_KEYS = ['appointments', 'appointment', 'dashboard', 'slots', 'availability', 'doctors', 'doctor'];

export function invalidateAppointmentData(qc: QueryClient) {
  return Promise.all(AFFECTED_KEYS.map((key) => qc.invalidateQueries({ queryKey: [key] })));
}

/** Every appointment of the signed-in student (partitioned client-side into tabs). */
export function useMyAppointments() {
  return useQuery({
    queryKey: ['appointments', 'mine', 'all'],
    queryFn: () => api.get<Appointment[]>('/appointments', { scope: 'all' }),
  });
}

export function useAppointmentDetail(id: number | null) {
  return useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api.get<AppointmentDetail>(`/appointments/${id}`),
    enabled: Boolean(id),
  });
}

export interface BookAppointmentInput {
  doctorId: number;
  date: string;
  startTime: string;
  mode: AppointmentMode;
  reason: string;
  notes?: string | null;
}

export function useBookAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BookAppointmentInput) => api.post<Appointment>('/appointments', input),
    onSettled: () => invalidateAppointmentData(qc),
  });
}

export function useRescheduleAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, startTime }: { id: number; date: string; startTime: string }) =>
      api.patch<Appointment>(`/appointments/${id}/reschedule`, { date, startTime }),
    onSettled: () => invalidateAppointmentData(qc),
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api.patch<Appointment>(`/appointments/${id}/cancel`, { reason: reason?.trim() || undefined }),
    onSettled: () => invalidateAppointmentData(qc),
  });
}
