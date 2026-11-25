import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  FileText,
  Info,
  MessageSquare,
  Package,
  Siren,
  Stethoscope,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { NotificationType } from '@shared/constants';
import type { Notification } from '@shared/types';
import { EmptyState } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

export const NOTIFICATION_ICON: Record<NotificationType, { icon: LucideIcon; className: string }> = {
  appointment: { icon: CalendarDays, className: 'bg-blue-50 text-blue-600' },
  consultation: { icon: Stethoscope, className: 'bg-teal-50 text-teal-600' },
  prescription: { icon: FileText, className: 'bg-violet-50 text-violet-600' },
  medicine_request: { icon: ClipboardList, className: 'bg-indigo-50 text-indigo-600' },
  inventory: { icon: Package, className: 'bg-amber-50 text-amber-600' },
  emergency: { icon: Siren, className: 'bg-rose-50 text-rose-600' },
  message: { icon: MessageSquare, className: 'bg-sky-50 text-sky-600' },
  call: { icon: Video, className: 'bg-emerald-50 text-emerald-600' },
  system: { icon: Info, className: 'bg-slate-100 text-slate-600' },
};

export function useNotificationActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const markRead = useMutation({
    mutationFn: (id: number) => api.patch(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({ mutationFn: () => api.patch('/notifications/read-all'), onSuccess: invalidate });
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/notifications/${id}`), onSuccess: invalidate });
  const clearRead = useMutation({
    mutationFn: () => api.del<{ deleted: number }>('/notifications', { scope: 'read' }),
    onSuccess: invalidate,
  });
  return { markRead, markAll, remove, clearRead };
}

export function NotificationItem({
  n,
  onOpen,
  compact = false,
}: {
  n: Notification;
  onOpen: (n: Notification) => void;
  compact?: boolean;
}) {
  const meta = NOTIFICATION_ICON[n.type] ?? NOTIFICATION_ICON.system;
  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        'flex w-full items-start gap-3 text-left transition-colors hover:bg-muted/60',
        compact ? 'px-4 py-3' : 'rounded-lg px-3 py-3',
        !n.isRead && 'bg-teal-50/40',
      )}
    >
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', meta.className)}>
        <meta.icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className={cn('text-[13px] leading-5 text-slate-900', !n.isRead ? 'font-semibold' : 'font-medium')}>
            {n.title}
          </span>
          {!n.isRead && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
        </span>
        <span className="line-clamp-2 block text-[13px] leading-5 text-slate-600">{n.body}</span>
        <span className="mt-0.5 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
      </span>
    </button>
  );
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { markRead, markAll } = useNotificationActions();

  const count = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
  const list = useQuery({
    queryKey: ['notifications', 'bell'],
    queryFn: () => api.get<Notification[]>('/notifications', { limit: 8 }),
    enabled: open,
  });
  const unread = count.data?.count ?? 0;

  const openNotification = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`} className="relative" data-testid="notification-bell">
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white tabular-nums">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-display text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread ? `${unread} unread` : 'You are all caught up'}</p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="xs" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <div className="scrollbar-thin max-h-[420px] divide-y overflow-y-auto">
          {list.data && list.data.length === 0 && (
            <EmptyState compact icon={Bell} title="No notifications yet" description="Updates about your activity appear here." />
          )}
          {list.data?.map((n) => <NotificationItem key={n.id} n={n} onOpen={openNotification} compact />)}
          {!list.data && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" size="sm" className="w-full" onClick={() => setOpen(false)}>
            <Link to={`/${user.role}/notifications`}>View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
