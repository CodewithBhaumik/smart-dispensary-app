import { useQuery } from '@tanstack/react-query';
import type { Prescription } from '@shared/types';
import { api } from '@/lib/api';

export function usePrescriptions() {
  return useQuery({
    queryKey: ['prescriptions', 'mine'],
    queryFn: () => api.get<Prescription[]>('/prescriptions'),
  });
}

export function usePrescription(id: number | null) {
  return useQuery({
    queryKey: ['prescription', id],
    queryFn: () => api.get<Prescription>(`/prescriptions/${id}`),
    enabled: id !== null && Number.isFinite(id) && id > 0,
  });
}
