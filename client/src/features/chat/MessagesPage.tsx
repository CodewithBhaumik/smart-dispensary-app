import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Lock, MessageSquarePlus, MessagesSquare, Video } from 'lucide-react';
import { toast } from 'sonner';
import type { ChatMessage, Conversation } from '@shared/types';
import { ErrorState, PageHeader } from '@/components/app';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { getErrorMessage } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { cn } from '@/lib/utils';
import {
  applyMessageToConversations,
  conversationsKey,
  messagesKey,
  upsertMessage,
  useConversations,
  useMarkRead,
  useStartConversation,
} from './api';
import { ChatThread } from './ChatThread';
import { ConversationList } from './ConversationList';
import { NewConversationDialog } from './NewConversationDialog';

const TYPING_TTL_MS = 4500;

/**
 * Student ↔ doctor messaging. Used by /student/messages and /doctor/messages.
 * Query params: `?c=<conversationId>` selects a thread, `?with=<userId>` opens (or creates)
 * the conversation with that doctor/student.
 */
export default function MessagesPage() {
  const { user } = useAuth();
  const role: 'student' | 'doctor' = user.role === 'doctor' ? 'doctor' : 'student';
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get('c')) || null;
  const withUserId = Number(params.get('with')) || null;
  const conversations = useConversations();
  const start = useStartConversation();
  const markRead = useMarkRead();
  const [newOpen, setNewOpen] = useState(false);
  const [typing, setTyping] = useState<Record<number, number>>({});
  const typingTimers = useRef<Record<number, number>>({});

  const list = useMemo(() => conversations.data ?? [], [conversations.data]);
  const selected = list.find((c) => c.id === selectedId) ?? null;

  const select = useCallback(
    (id: number | null) => {
      setParams(id ? { c: String(id) } : {}, { replace: false });
    },
    [setParams],
  );

  // Deep link: /student/messages?with=<doctorId>
  const handledWith = useRef<number | null>(null);
  useEffect(() => {
    if (!withUserId || handledWith.current === withUserId) return;
    handledWith.current = withUserId;
    start.mutate(withUserId, {
      onSuccess: (conversation) => setParams({ c: String(conversation.id) }, { replace: true }),
      onError: (error) => {
        toast.error(getErrorMessage(error));
        setParams({}, { replace: true });
      },
    });
  }, [withUserId, start, setParams]);

  // A selected id missing from the cache: refetch once (it may be brand new), then fall back to the list.
  const refetchedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedId || selected || withUserId || start.isPending) return;
    if (!conversations.isSuccess || conversations.isFetching) return;
    if (refetchedFor.current !== selectedId) {
      refetchedFor.current = selectedId;
      void conversations.refetch();
      return;
    }
    setParams({}, { replace: true });
  }, [selectedId, selected, withUserId, start.isPending, conversations, setParams]);

  // ---------------------------------------------------------------------------
  // Realtime
  // ---------------------------------------------------------------------------
  useSocketEvent<ChatMessage>('message:new', (message) => {
    upsertMessage(qc, message);
    const viewing =
      message.conversationId === selectedId && document.visibilityState === 'visible' && document.hasFocus();
    const known = applyMessageToConversations(qc, message, { meId: user.id, isViewing: viewing });
    if (!known) qc.invalidateQueries({ queryKey: conversationsKey });
    const fromOther = message.senderId !== null && message.senderId !== user.id;
    if (fromOther) {
      clearTyping(message.conversationId);
      if (viewing) markRead.mutate(message.conversationId);
    }
  });

  useSocketEvent<{ conversationId: number; readerId: number; readAt: string }>('message:read', (evt) => {
    if (evt.readerId === user.id) {
      qc.setQueryData<Conversation[]>(conversationsKey, (prev) =>
        prev?.map((c) => (c.id === evt.conversationId ? { ...c, unreadCount: 0 } : c)),
      );
      return;
    }
    qc.setQueryData<ChatMessage[]>(messagesKey(evt.conversationId), (prev) =>
      prev?.map((m) => (m.senderId === user.id && !m.readAt && m.id > 0 ? { ...m, readAt: evt.readAt } : m)),
    );
  });

  useSocketEvent<{ conversationId: number; userId: number; isTyping: boolean }>('typing', (evt) => {
    if (evt.userId === user.id) return;
    if (!evt.isTyping) {
      clearTyping(evt.conversationId);
      return;
    }
    setTyping((prev) => ({ ...prev, [evt.conversationId]: Date.now() + TYPING_TTL_MS }));
    window.clearTimeout(typingTimers.current[evt.conversationId]);
    typingTimers.current[evt.conversationId] = window.setTimeout(
      () => clearTyping(evt.conversationId),
      TYPING_TTL_MS,
    );
  });

  useSocketEvent<{ userId: number; online: boolean }>('presence', (evt) => {
    qc.setQueryData<Conversation[]>(conversationsKey, (prev) =>
      prev?.map((c) => (c.otherParty.id === evt.userId ? { ...c, otherParty: { ...c.otherParty, online: evt.online } } : c)),
    );
  });

  function clearTyping(conversationId: number) {
    window.clearTimeout(typingTimers.current[conversationId]);
    setTyping((prev) => {
      if (!(conversationId in prev)) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  }

  useEffect(() => {
    const timers = typingTimers.current;
    return () => Object.values(timers).forEach((t) => window.clearTimeout(t));
  }, []);

  const typingIds = useMemo(
    () => new Set(Object.keys(typing).map(Number).filter((id) => typing[id] > Date.now())),
    [typing],
  );

  return (
    <>
      <PageHeader
        title="Messages"
        description={
          role === 'student'
            ? 'Chat with health-centre doctors about follow-ups, reports and prescriptions — or start a video call.'
            : 'Reply to your patients’ follow-up questions and start video consultations.'
        }
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <MessageSquarePlus /> New conversation
          </Button>
        }
      />

      {conversations.isError ? (
        <ErrorState error={conversations.error} retry={() => conversations.refetch()} />
      ) : (
        <div className="flex h-[calc(100dvh-17rem)] min-h-[440px] overflow-hidden rounded-xl border bg-card shadow-xs sm:h-[calc(100dvh-12.5rem)] sm:min-h-[520px] lg:h-[calc(100dvh-14.25rem)]">
          <aside
            className={cn(
              'w-full shrink-0 flex-col border-r border-border/70 md:flex md:w-[300px] lg:w-[340px]',
              selected ? 'hidden' : 'flex',
            )}
          >
            <ConversationList
              conversations={list}
              loading={conversations.isLoading}
              selectedId={selectedId}
              typingIds={typingIds}
              meId={user.id}
              onSelect={select}
              onNew={() => setNewOpen(true)}
            />
          </aside>
          <section className={cn('min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden md:flex')}>
            {selected ? (
              <ChatThread
                key={selected.id}
                conversation={selected}
                meId={user.id}
                meRole={role}
                typing={typingIds.has(selected.id)}
                onBack={() => select(null)}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 bg-[linear-gradient(180deg,#f8fafc,#f4f6f9)] px-8 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-teal-50 text-primary ring-1 ring-teal-600/15">
                  <MessagesSquare className="size-7" />
                </span>
                <div className="space-y-1.5">
                  <p className="font-display text-lg font-semibold text-slate-900">
                    {start.isPending ? 'Opening conversation…' : 'Select a conversation'}
                  </p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    {role === 'student'
                      ? 'Message your doctor between visits, or start a video consultation right from the chat.'
                      : 'Pick a patient on the left to reply, or start a video consultation from the chat header.'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" onClick={() => setNewOpen(true)}>
                    <MessageSquarePlus /> New conversation
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3.5" /> Visible only to you and your {role === 'student' ? 'doctor' : 'patient'}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Video className="size-3.5" /> Peer-to-peer video calls
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} role={role} onStarted={(id) => select(id)} />
    </>
  );
}
