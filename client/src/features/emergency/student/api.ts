import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EmergencySeverity } from '@shared/constants';
import type { Emergency } from '@shared/types';
import { api } from '@/lib/api';

export function useMyEmergencies() {
  return useQuery({
    queryKey: ['emergencies', 'mine'],
    queryFn: () => api.get<Emergency[]>('/emergencies', { scope: 'all' }),
    // Poll fast while an emergency is unresolved so status changes appear live.
    refetchInterval: (query) => (query.state.data?.some((e) => e.status !== 'resolved') ? 5_000 : 30_000),
  });
}

export interface CreateEmergencyInput {
  category: string;
  severity: EmergencySeverity;
  description: string;
  location: string;
  contactPhone: string;
  emergencyContact?: string;
  additionalInfo?: string;
}

export function useCreateEmergency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEmergencyInput) => api.post<Emergency>('/emergencies', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['emergencies'] });
      void qc.invalidateQueries({ queryKey: ['emergency'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
