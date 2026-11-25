import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Conversation, DayAvailability, DoctorDetail, DoctorListItem, Slot } from '@shared/types';
import { api } from '@/lib/api';

/** All active doctors (filtered client-side for instant search). */
export function useDoctors() {
  return useQuery({
    queryKey: ['doctors', 'list'],
    queryFn: () => api.get<DoctorListItem[]>('/doctors'),
    refetchInterval: 60_000,
  });
}

export function useDoctor(id: number | null | undefined) {
  return useQuery({
    queryKey: ['doctor', id],
    queryFn: () => api.get<DoctorDetail>(`/doctors/${id}`),
    enabled: Boolean(id),
  });
}

/** Free-slot counts per day for the booking window (starting today). */
export function useDoctorAvailability(id: number | null | undefined, days = 14) {
  return useQuery({
    queryKey: ['availability', id, days],
    queryFn: () => api.get<DayAvailability[]>(`/doctors/${id}/availability`, { days }),
    enabled: Boolean(id),
    refetchInterval: 60_000,
  });
}

export function useDoctorSlots(id: number | null | undefined, date: string | null | undefined) {
  return useQuery({
    queryKey: ['slots', id, date],
    queryFn: () => api.get<Slot[]>(`/doctors/${id}/slots`, { date }),
    enabled: Boolean(id && date),
    refetchInterval: 30_000,
  });
}

/** Opens (or creates) the chat thread with a doctor. */
export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantId: number) => api.post<Conversation>('/conversations', { participantId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}
