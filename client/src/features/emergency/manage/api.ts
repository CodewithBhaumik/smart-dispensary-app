import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmergencyStatus } from '@shared/constants';
import type { Emergency, Responder } from '@shared/types';
import { api } from '@/lib/api';

const INVALIDATE = ['emergencies', 'emergency', 'dashboard', 'activity', 'notifications'];

/** All emergencies (active first, as ordered by the server); filtered on the client. */
export function useAllEmergencies() {
  return useQuery({
    queryKey: ['emergencies', 'manage'],
    queryFn: () => api.get<Emergency[]>('/emergencies', { scope: 'all' }),
    refetchInterval: 10_000,
  });
}

export function useEmergencyDetail(id: number | null) {
  return useQuery({
    queryKey: ['emergency', id],
    queryFn: () => api.get<Emergency>(`/emergencies/${id}`),
    enabled: id !== null,
    refetchInterval: 10_000,
  });
}

export function useResponders(enabled = true) {
  return useQuery({
    queryKey: ['responders'],
    queryFn: () => api.get<Responder[]>('/emergencies/responders'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export interface EmergencyUpdate {
  id: number;
  status: EmergencyStatus;
  responderName?: string | null;
  responderPhone?: string | null;
  note?: string | null;
  resolutionNotes?: string | null;
}

export function useUpdateEmergency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: EmergencyUpdate) => api.patch<Emergency>(`/emergencies/${id}/status`, body),
    onSuccess: (data) => {
      qc.setQueryData(['emergency', data.id], data);
      for (const key of INVALIDATE) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
