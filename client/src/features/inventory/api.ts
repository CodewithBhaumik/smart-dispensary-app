import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Medicine, StockMovement } from '@shared/types';
import { api } from '@/lib/api';

/** Keys refreshed after any inventory change. */
export const INVENTORY_INVALIDATE_KEYS = ['medicines', 'medicine', 'movements', 'dashboard', 'activity', 'requests', 'request'];

/** Full inventory (including inactive items) — filtered/sorted on the client for instant chips & counts. */
export function useInventory() {
  return useQuery({
    queryKey: ['medicines', 'inventory'],
    queryFn: () => api.get<Medicine[]>('/medicines', { includeInactive: 1, sort: 'name' }),
    refetchInterval: 60_000,
  });
}

export function useMedicine(id: number | null) {
  return useQuery({
    queryKey: ['medicine', id],
    queryFn: () => api.get<Medicine>(`/medicines/${id}`),
    enabled: id !== null,
  });
}

export function useMovements(id: number | null) {
  return useQuery({
    queryKey: ['movements', id],
    queryFn: () => api.get<StockMovement[]>(`/medicines/${id}/movements`),
    enabled: id !== null,
  });
}

export interface MedicinePayload {
  name: string;
  genericName: string | null;
  category: string;
  form: string;
  strength: string | null;
  unit: string;
  description: string | null;
  usageInstructions: string | null;
  requiresPrescription: boolean;
  minStock: number;
  batchNo: string | null;
  expiryDate: string | null;
  manufacturer: string | null;
  unitPrice: number;
  isActive?: boolean;
  stockQuantity?: number;
}

export type AdjustType = 'restock' | 'adjustment' | 'expired_removal';

export interface AdjustPayload {
  type: AdjustType;
  quantity: number;
  reason: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
}

function useInvalidateInventory() {
  const qc = useQueryClient();
  return () => {
    for (const key of INVENTORY_INVALIDATE_KEYS) void qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useCreateMedicine() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: (body: MedicinePayload) => api.post<Medicine>('/medicines', body),
    onSuccess: invalidate,
  });
}

export function useUpdateMedicine() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<MedicinePayload> }) => api.put<Medicine>(`/medicines/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useAdjustStock() {
  const invalidate = useInvalidateInventory();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AdjustPayload }) =>
      api.post<{ medicine: Medicine; movement: StockMovement }>(`/medicines/${id}/adjust`, body),
    onSuccess: invalidate,
  });
}
