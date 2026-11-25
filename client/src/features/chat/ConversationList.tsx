import { useMemo, useState } from 'react';
import { MessageSquarePlus, MessagesSquare, Video } from 'lucide-react';
import type { Conversation } from '@shared/types';
import { EmptyState, ListSkeleton, SearchInput, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { listTimeLabel, messagePreview } from './chat-utils';

export function ConversationList({
  conversations,
  loading,
  selectedId,
  typingIds,
  meId,
  onSelect,
  onNew,
}: {
  conversations: Conversation[];
  loading: boolean;
  selectedId: number | null;
  typingIds: Set<number>;
  meId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.otherParty.name.toLowerCase().includes(q) || (c.otherParty.subtitle ?? '').toLowerCase().includes(q),
    );
  }, [conversations, search]);
  const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-border/70 px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-slate-900">Conversations</h2>
            {unreadTotal > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white tabular-nums">
                {unreadTotal}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onNew} aria-label="New conversation" title="New conversation">
            <MessageSquarePlus />
          </Button>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search conversations" className="sm:w-full" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <ListSkeleton rows={6} className="p-4" />
        ) : conversations.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No conversations yet"
            description="Start a conversation to ask a follow-up question or share an update."
            action={
              <Button size="sm" onClick={onNew}>
                <MessageSquarePlus /> New conversation
              </Button>
            }
            compact
          />
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">No conversations match “{search}”.</p>
        ) : (
          <ul className="space-y-0.5 p-2">
            {filtered.map((c) => {
              const active = c.id === selectedId;
              const unread = c.unreadCount > 0;
              const typing = typingIds.has(c.id);
              const isCall = c.lastMessage?.kind === 'call';
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-teal-50 ring-1 ring-teal-600/15' : 'hover:bg-muted/70',
                    )}
                  >
                    <UserAvatar user={c.otherParty} size="md" online={c.otherParty.online} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-800',
                          )}
                        >
                          {c.otherParty.name}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[11px] tabular-nums',
                            unread ? 'font-semibold text-primary' : 'text-slate-400',
                          )}
                        >
                          {listTimeLabel(c.lastMessage?.createdAt ?? c.updatedAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'flex min-w-0 items-center gap-1 truncate text-[13px]',
                            typing ? 'text-primary' : unread ? 'text-slate-700' : 'text-muted-foreground',
                          )}
                        >
                          {typing ? (
                            'typing…'
                          ) : (
                            <>
                              {isCall && <Video className="size-3.5 shrink-0" />}
                              <span className="truncate">{messagePreview(c.lastMessage, meId)}</span>
                            </>
                          )}
                        </span>
                        {unread && (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-white tabular-nums">
                            {c.unreadCount}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
