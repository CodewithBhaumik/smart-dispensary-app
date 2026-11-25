import { useQuery } from '@tanstack/react-query';
import type { StudentDashboard } from '@shared/types';
import { api } from '@/lib/api';

export function useStudentDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'student'],
    queryFn: () => api.get<StudentDashboard>('/dashboard/student'),
    refetchInterval: 60_000,
  });
}
