import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Notification } from '@shared/types';
import { useSocketEvent } from '@/lib/socket';

let lastOwnMutationAt = 0;

/** Glue between Socket.IO events and React Query / toasts. Rendered once inside the shell. */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // Remember when this tab last performed a mutation so we don't double-toast our own events.
  useEffect(() => {
    return qc.getMutationCache().subscribe((event) => {
      if (event.type !== 'added' && event.type !== 'updated') return;
      const status = event.mutation.state.status;
      if (status === 'pending' || status === 'success') lastOwnMutationAt = Date.now();
    });
  }, [qc]);

  useSocketEvent<{ keys: string[] }>('invalidate', ({ keys }) => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: [key] });
  });

  useSocketEvent<Notification>('notification:new', (n) => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    // Skip toasts caused by this tab's own action (the page already confirmed it).
    if (qc.isMutating() > 0 || Date.now() - lastOwnMutationAt < 2500) return;
    const show = n.type === 'emergency' ? toast.warning : toast;
    show(n.title, {
      description: n.body,
      duration: n.type === 'emergency' ? 10_000 : 6_000,
      action: n.link ? { label: 'View', onClick: () => navigate(n.link!) } : undefined,
    });
  });

  // Data was reseeded (possibly from another window). Stale sessions re-authenticate
  // automatically in AuthProvider; here we only refresh every cached query.
  useSocketEvent('demo:reset', () => {
    void qc.invalidateQueries();
  });

  return null;
}
