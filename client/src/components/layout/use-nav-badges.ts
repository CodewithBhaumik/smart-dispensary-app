import { useQuery } from '@tanstack/react-query';
import type { Role } from '@shared/constants';
import type { Conversation, Emergency, MedicineRequest } from '@shared/types';
import { api } from '@/lib/api';
import type { NavBadgeKey } from './nav';

/** Live counters shown next to sidebar items. */
export function useNavBadges(role: Role): Partial<Record<NavBadgeKey, number>> {
  const messages = useQuery({
    queryKey: ['conversations', 'badge'],
    queryFn: () => api.get<Conversation[]>('/conversations'),
    enabled: role === 'student' || role === 'doctor',
    refetchInterval: 60_000,
  });
  const requests = useQuery({
    queryKey: ['requests', 'badge'],
    queryFn: () => api.get<MedicineRequest[]>('/medicine-requests', { status: 'submitted' }),
    enabled: role === 'staff' || role === 'admin',
    refetchInterval: 60_000,
  });
  const emergencies = useQuery({
    queryKey: ['emergencies', 'active'],
    queryFn: () => api.get<Emergency[]>('/emergencies', { scope: 'active' }),
    enabled: role !== 'student',
    refetchInterval: 30_000,
  });
  return {
    unreadMessages: messages.data?.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0),
    pendingRequests: requests.data?.length,
    activeEmergencies: emergencies.data?.filter((e) => e.status !== 'resolved').length,
  };
}
