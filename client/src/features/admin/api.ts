import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role } from '@shared/constants';
import type {
  ActivityLog,
  AdminDashboard,
  Appointment,
  AppointmentDetail,
  DoctorListItem,
  Paginated,
  UserListItem,
} from '@shared/types';
import { api, type Query } from '@/lib/api';

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => api.get<AdminDashboard>('/dashboard/admin'),
    refetchInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
export function useUsers() {
  return useQuery({ queryKey: ['users', 'all'], queryFn: () => api.get<UserListItem[]>('/users') });
}

export interface UserPayload {
  role?: Role;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  password?: string;
  student?: Record<string, unknown>;
  doctor?: Record<string, unknown>;
  staff?: Record<string, unknown>;
}

const USER_KEYS = ['users', 'dashboard', 'activity', 'doctors', 'meta', 'patients'];

function useInvalidate(keys: string[]) {
  const qc = useQueryClient();
  return () => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: [key] });
  };
}

export function useCreateUser() {
  const invalidate = useInvalidate(USER_KEYS);
  return useMutation({ mutationFn: (body: UserPayload) => api.post<UserListItem>('/users', body), onSuccess: invalidate });
}

export function useUpdateUser() {
  const invalidate = useInvalidate(USER_KEYS);
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<UserPayload> }) => api.put<UserListItem>(`/users/${id}`, body),
    onSuccess: invalidate,
  });
}

export function useSetUserStatus() {
  const invalidate = useInvalidate(USER_KEYS);
  return useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => api.patch<UserListItem>(`/users/${id}/status`, { isActive }),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Appointments (admin view)
// ---------------------------------------------------------------------------
export function useAdminAppointments(query: Query) {
  return useQuery({
    queryKey: ['appointments', 'admin', query],
    queryFn: () => api.get<Appointment[]>('/appointments', query),
    placeholderData: keepPreviousData,
  });
}

export function useAppointmentDetail(id: number | null) {
  return useQuery({
    queryKey: ['appointment', id],
    queryFn: () => api.get<AppointmentDetail>(`/appointments/${id}`),
    enabled: id !== null,
  });
}

export function useCancelAppointment() {
  const invalidate = useInvalidate(['appointments', 'appointment', 'dashboard', 'slots', 'availability', 'doctors', 'activity']);
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string | null }) => api.patch<Appointment>(`/appointments/${id}/cancel`, { reason }),
    onSuccess: invalidate,
  });
}

export function useDoctorsList() {
  return useQuery({ queryKey: ['doctors', 'admin-filter'], queryFn: () => api.get<DoctorListItem[]>('/doctors'), staleTime: 5 * 60_000 });
}

// ---------------------------------------------------------------------------
// Activity log
// ---------------------------------------------------------------------------
export function useActivity(query: Query) {
  return useQuery({
    queryKey: ['activity', 'log', query],
    queryFn: () => api.get<Paginated<ActivityLog>>('/activity', query),
    placeholderData: keepPreviousData,
  });
}
