import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { ACTIVITY_CATEGORIES, ACTIVITY_CATEGORY_LABELS, ROLE_LABELS, ROLES } from '@shared/constants';
import type { ActivityLog } from '@shared/types';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, Panel, SearchInput, TONE_TILE, ToneBadge, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { formatClock, formatDate, formatDayLabel, toDateStr } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ACTIVITY_META } from './activity-ui';
import { useActivity, useDebounced } from './api';

const PAGE_SIZE = 25;
const STAFF_CATEGORIES = ['inventory', 'medicine_request', 'emergency'] as const;

export default function ActivityLogPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounced(search);

  useEffect(() => setPage(0), [debouncedSearch, category, role]);

  const query = useActivity({
    search: debouncedSearch || undefined,
    category: category === 'all' ? undefined : category,
    role: role === 'all' ? undefined : role,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityLog[]>();
    for (const item of items) {
      const day = toDateStr(new Date(item.createdAt));
      map.set(day, [...(map.get(day) ?? []), item]);
    }
    return [...map.entries()];
  }, [items]);

  const categories = user.role === 'admin' ? ACTIVITY_CATEGORIES : STAFF_CATEGORIES;

  return (
    <>
      <PageHeader
        title="Activity log"
        description="An audit trail of every meaningful action — bookings, consultations, prescriptions, dispensing, inventory and emergencies."
      />
      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:px-5 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search descriptions…" className="lg:w-80" />
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger size="sm" className="w-[190px]" aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ACTIVITY_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger size="sm" className="w-[170px]" aria-label="Performed by role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {query.isError ? (
          <div className="p-5">
            <ErrorState error={query.error} retry={() => query.refetch()} />
          </div>
        ) : query.isLoading ? (
          <div className="p-5">
            <ListSkeleton rows={8} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={History} title="No activity found" description="Try a different search or filter." />
        ) : (
          <div className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
            {groups.map(([day, entries]) => (
              <section key={day}>
                <h2 className="sticky top-16 z-[1] border-y bg-muted/70 px-5 py-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase backdrop-blur first:border-t-0">
                  {formatDayLabel(day)}
                  {['Today', 'Yesterday'].includes(formatDayLabel(day)) && (
                    <span className="ml-2 font-normal tracking-normal normal-case">{formatDate(day)}</span>
                  )}
                </h2>
                <ul className="divide-y">
                  {entries.map((a) => {
                    const meta = ACTIVITY_META[a.category] ?? ACTIVITY_META.system;
                    return (
                      <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                        <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1', TONE_TILE[meta.tone])}>
                          <meta.icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-5 text-slate-800">{a.description}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {a.actor ? (
                              <span className="inline-flex items-center gap-1.5">
                                <UserAvatar user={a.actor} size="xs" />
                                <span className="font-medium text-slate-600">{a.actor.name}</span>
                                <span>· {ROLE_LABELS[a.actor.role]}</span>
                              </span>
                            ) : (
                              <span>System</span>
                            )}
                            <ToneBadge tone={meta.tone} className="h-5 px-2 text-[11px]">
                              {ACTIVITY_CATEGORY_LABELS[a.category] ?? a.category}
                            </ToneBadge>
                          </div>
                        </div>
                        <time dateTime={a.createdAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatClock(a.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {total > 0 ? (
              <>
                Showing <span className="font-medium text-slate-700">{from}–{to}</span> of{' '}
                <span className="font-medium text-slate-700">{total.toLocaleString('en-IN')}</span> events
              </>
            ) : (
              'No events'
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              <ChevronLeft /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= lastPage || query.isFetching}
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
            >
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      </Panel>
    </>
  );
}
