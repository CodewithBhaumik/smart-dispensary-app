import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FulfilmentMethod } from '@shared/constants';
import type { Medicine, MedicineRequest } from '@shared/types';
import { api } from '@/lib/api';

/** Full active catalog (≈50 items) — filtered client-side for instant search. */
export function useMedicines() {
  return useQuery({
    queryKey: ['medicines', 'catalog'],
    queryFn: () => api.get<Medicine[]>('/medicines', { sort: 'name' }),
  });
}

export function useMyRequests() {
  return useQuery({
    queryKey: ['requests', 'mine'],
    queryFn: () => api.get<MedicineRequest[]>('/medicine-requests'),
    refetchInterval: 20_000,
  });
}

export function useMedicineRequest(id: number | null) {
  return useQuery({
    queryKey: ['request', id],
    queryFn: () => api.get<MedicineRequest>(`/medicine-requests/${id}`),
    enabled: id !== null && Number.isFinite(id) && id > 0,
    refetchInterval: 20_000,
  });
}

export interface CreateRequestInput {
  items: { medicineId: number; quantity: number }[];
  prescriptionId?: number;
  fulfilment: FulfilmentMethod;
  deliveryLocation?: string;
  notes?: string;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['requests', 'request', 'medicines', 'prescriptions', 'prescription', 'dashboard']) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequestInput) => api.post<MedicineRequest>('/medicine-requests', input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useCancelRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api.patch<MedicineRequest>(`/medicine-requests/${id}/cancel`, { reason }),
    onSuccess: () => invalidateAll(qc),
  });
}
