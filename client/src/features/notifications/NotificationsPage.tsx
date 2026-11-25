import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { isToday, isYesterday, parseISO } from 'date-fns';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Notification } from '@shared/types';
import { EmptyState, ErrorState, FilterChips, ListSkeleton, PageHeader, Panel } from '@/components/app';
import { NotificationItem, useNotificationActions } from '@/components/layout/NotificationBell';
import { Button } from '@/components/ui/button';
import { api, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';

type Filter = 'all' | 'unread';

function groupLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return formatDate(d);
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const { markRead, markAll, remove, clearRead } = useNotificationActions();

  const query = useQuery({
    queryKey: ['notifications', 'page'],
    queryFn: () => api.get<Notification[]>('/notifications', { limit: 200 }),
  });

  const all = query.data ?? [];
  const unreadCount = all.filter((n) => !n.isRead).length;
  const visible = filter === 'unread' ? all.filter((n) => !n.isRead) : all;

  const groups = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of visible) {
      const key = groupLabel(n.createdAt);
      map.set(key, [...(map.get(key) ?? []), n]);
    }
    return [...map.entries()];
  }, [visible]);

  const open = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about appointments, prescriptions, medicine requests, messages and emergencies."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={unreadCount === 0 || markAll.isPending}
              onClick={() =>
                markAll.mutate(undefined, {
                  onSuccess: () => toast.success('All notifications marked as read'),
                  onError: (e) => toast.error(getErrorMessage(e)),
                })
              }
            >
              <CheckCheck /> Mark all read
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={all.filter((n) => n.isRead).length === 0 || clearRead.isPending}
              onClick={() =>
                clearRead.mutate(undefined, {
                  onSuccess: (r) => toast.success(`Cleared ${r?.deleted ?? 0} read notifications`),
                  onError: (e) => toast.error(getErrorMessage(e)),
                })
              }
            >
              <Trash2 /> Clear read
            </Button>
          </>
        }
      />
      <Panel padded={false}>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <FilterChips<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: all.length },
              { value: 'unread', label: 'Unread', count: unreadCount },
            ]}
          />
        </div>
        <div className="p-2 sm:p-3">
          {query.isLoading && <ListSkeleton rows={6} className="p-3" />}
          {query.isError && <ErrorState error={query.error} retry={() => query.refetch()} className="m-3" />}
          {query.data && visible.length === 0 && (
            <EmptyState
              icon={Bell}
              title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              description="When something changes — a booking, a prescription, a request update — it shows up here."
            />
          )}
          {groups.map(([label, items]) => (
            <section key={label} className="mb-2 last:mb-0">
              <h3 className="px-3 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {label}
              </h3>
              <ul className="space-y-0.5">
                {items.map((n) => (
                  <li key={n.id} className="group relative">
                    <NotificationItem n={n} onOpen={open} />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Dismiss notification"
                      className="absolute top-3 right-3 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove.mutate(n.id, { onError: (err) => toast.error(getErrorMessage(err)) });
                      }}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Panel>
    </>
  );
}
