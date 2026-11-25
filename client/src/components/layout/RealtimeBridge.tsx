import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Notification } from '@shared/types';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';

let lastOwnMutationAt = 0;

/** Glue between Socket.IO events and React Query / toasts. Rendered once inside the shell. */
export function RealtimeBridge() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user, switchToAccount, logout } = useAuth();

  // Remember when this tab last performed a mutation so we don't double-toast our own events.
  useEffect(() => {
    return qc.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.mutation.state.status === 'success') lastOwnMutationAt = Date.now();
    });
  }, [qc]);

  useSocketEvent<{ keys: string[] }>('invalidate', ({ keys }) => {
    for (const key of keys) void qc.invalidateQueries({ queryKey: [key] });
  });

  useSocketEvent<Notification>('notification:new', (n) => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    if (Date.now() - lastOwnMutationAt < 2500) return;
    const show = n.type === 'emergency' ? toast.warning : toast;
    show(n.title, {
      description: n.body,
      duration: n.type === 'emergency' ? 10_000 : 6_000,
      action: n.link ? { label: 'View', onClick: () => navigate(n.link!) } : undefined,
    });
  });

  useSocketEvent('demo:reset', async () => {
    try {
      await api.get('/auth/me');
    } catch {
      try {
        await switchToAccount(user.id);
        navigate(`/${user.role}`);
        toast.info('Demo data was reset in another window');
      } catch {
        await logout();
      }
      return;
    }
    await qc.invalidateQueries();
  });

  return null;
}
