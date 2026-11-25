import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RequestStatus } from '@shared/constants';
import type { MedicineRequest, StaffDashboard } from '@shared/types';
import { api } from '@/lib/api';

/** Keys refreshed after a request status change (stock, dashboards, logs, notifications). */
export const REQUEST_INVALIDATE_KEYS = [
  'requests',
  'request',
  'medicines',
  'medicine',
  'movements',
  'dashboard',
  'activity',
  'notifications',
];

export function useStaffDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'staff'],
    queryFn: () => api.get<StaffDashboard>('/dashboard/staff'),
    refetchInterval: 30_000,
  });
}

/** Every request (filtered on the client so chips show live counts). */
export function useAllRequests() {
  return useQuery({
    queryKey: ['requests', 'all'],
    queryFn: () => api.get<MedicineRequest[]>('/medicine-requests'),
    refetchInterval: 20_000,
  });
}

export function useRequestDetail(id: number | null) {
  return useQuery({
    queryKey: ['request', id],
    queryFn: () => api.get<MedicineRequest>(`/medicine-requests/${id}`),
    enabled: id !== null,
  });
}

export interface RequestStatusUpdate {
  id: number;
  status: RequestStatus;
  note?: string | null;
  rejectionReason?: string | null;
}

export function useUpdateRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: RequestStatusUpdate) => api.patch<MedicineRequest>(`/medicine-requests/${id}/status`, body),
    onSuccess: (data) => {
      qc.setQueryData(['request', data.id], data);
      for (const key of REQUEST_INVALIDATE_KEYS) void qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
