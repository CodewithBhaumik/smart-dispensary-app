import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Siren } from 'lucide-react';
import { EMERGENCY_SEVERITY_LABELS } from '@shared/constants';
import type { Emergency } from '@shared/types';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

/** Slim alert bar for responders whenever an emergency is unresolved. */
export function EmergencyBanner() {
  const { user } = useAuth();
  const enabled = user.role !== 'student';
  const { data } = useQuery({
    queryKey: ['emergencies', 'active'],
    queryFn: () => api.get<Emergency[]>('/emergencies', { scope: 'active' }),
    enabled,
    refetchInterval: 30_000,
  });
  const active = (data ?? []).filter((e) => e.status !== 'resolved');
  if (!enabled || active.length === 0) return null;
  const top = active[0];
  return (
    <div className="border-b border-rose-200 bg-gradient-to-r from-rose-50 to-white">
      <div className="mx-auto flex max-w-[1440px] items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-50" />
          <Siren className="relative size-4" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm text-rose-900">
          <span className="font-semibold">
            {active.length === 1 ? 'Active emergency' : `${active.length} active emergencies`}:
          </span>{' '}
          {top.category} · {EMERGENCY_SEVERITY_LABELS[top.severity]} · {top.location}{' '}
          <span className="text-rose-700/80">({timeAgo(top.createdAt)})</span>
        </p>
        <Link
          to={`/${user.role}/emergencies?open=${top.id}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-rose-700"
        >
          Respond <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
