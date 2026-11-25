import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MessagesSquare, SendHorizontal, Siren, UserRound, Video } from 'lucide-react';
import { toast } from 'sonner';
import type { Conversation } from '@shared/types';
import { EmptyState, ErrorState, ListSkeleton, UserAvatar } from '@/components/app';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCall } from '@/features/calls/CallProvider';
import { getErrorMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { PAGE_SIZE, loadEarlierMessages, useMarkRead, useMessages, useSendMessage } from './api';
import { buildThread } from './chat-utils';
import { DaySeparator, MessageBubble, TypingBubble } from './MessageBubble';

const MAX_LENGTH = 2000;
const TYPING_THROTTLE_MS = 2500;
const TYPING_IDLE_MS = 3000;

export function ChatThread({
  conversation,
  meId,
  meRole,
  typing,
  onBack,
}: {
  conversation: Conversation;
  meId: number;
  meRole: 'student' | 'doctor';
  typing: boolean;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const call = useCall();
  const messages = useMessages(conversation.id);
  const send = useSendMessage(conversation.id, meId);
  const markRead = useMarkRead();
  const [draft, setDraft] = useState('');
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const lastTypingSent = useRef(0);
  const typingIdleTimer = useRef<number | null>(null);
  const preserveFrom = useRef<number | null>(null);

  const other = conversation.otherParty;
  const list = useMemo(() => messages.data ?? [], [messages.data]);
  const items = useMemo(() => buildThread(list), [list]);

  // Reset per-conversation UI state.
  useEffect(() => {
    setDraft('');
    atBottom.current = true;
    textareaRef.current?.focus();
  }, [conversation.id]);

  useEffect(() => {
    if (messages.isSuccess) setHasEarlier((messages.data?.length ?? 0) >= PAGE_SIZE);
    // only on first load of this conversation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id, messages.isSuccess]);

  // Keep the newest message in view (unless the user scrolled up to read history).
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (preserveFrom.current !== null) {
      el.scrollTop = el.scrollHeight - preserveFrom.current;
      preserveFrom.current = null;
      return;
    }
    const last = list[list.length - 1];
    if (atBottom.current || (last && last.senderId === meId)) el.scrollTop = el.scrollHeight;
  }, [list, typing, meId]);

  // Mark the other participant's messages as read while the thread is visible.
  const markIfVisible = useCallback(() => {
    if (conversation.unreadCount > 0 && document.visibilityState === 'visible' && !markRead.isPending) {
      markRead.mutate(conversation.id);
    }
  }, [conversation.id, conversation.unreadCount, markRead]);

  useEffect(() => {
    markIfVisible();
  }, [markIfVisible]);

  useEffect(() => {
    window.addEventListener('focus', markIfVisible);
    document.addEventListener('visibilitychange', markIfVisible);
    return () => {
      window.removeEventListener('focus', markIfVisible);
      document.removeEventListener('visibilitychange', markIfVisible);
    };
  }, [markIfVisible]);

  const emitTyping = useCallback(
    (isTyping: boolean) => {
      getSocket()?.emit('typing', { conversationId: conversation.id, isTyping });
    },
    [conversation.id],
  );

  useEffect(
    () => () => {
      if (typingIdleTimer.current) window.clearTimeout(typingIdleTimer.current);
    },
    [],
  );

  const onDraftChange = (value: string) => {
    setDraft(value.slice(0, MAX_LENGTH));
    const now = Date.now();
    if (value.trim() && now - lastTypingSent.current > TYPING_THROTTLE_MS) {
      lastTypingSent.current = now;
      emitTyping(true);
    }
    if (typingIdleTimer.current) window.clearTimeout(typingIdleTimer.current);
    typingIdleTimer.current = window.setTimeout(() => {
      lastTypingSent.current = 0;
      emitTyping(false);
    }, TYPING_IDLE_MS);
  };

  // Auto-grow the composer.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [draft]);

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    setDraft('');
    atBottom.current = true;
    if (typingIdleTimer.current) window.clearTimeout(typingIdleTimer.current);
    lastTypingSent.current = 0;
    emitTyping(false);
    send.mutate(body, {
      onError: (error) => {
        toast.error(getErrorMessage(error));
        setDraft((current) => current || body);
      },
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const loadEarlier = async () => {
    const first = list.find((m) => m.id > 0);
    if (!first || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const el = scrollRef.current;
      preserveFrom.current = el ? el.scrollHeight - el.scrollTop : null;
      const count = await loadEarlierMessages(qc, conversation.id, first.id);
      if (count < PAGE_SIZE) setHasEarlier(false);
      if (count === 0) preserveFrom.current = null;
    } catch (error) {
      preserveFrom.current = null;
      toast.error(getErrorMessage(error));
    } finally {
      setLoadingEarlier(false);
    }
  };

  const profileLink = meRole === 'student' ? `/student/doctors/${other.id}` : `/doctor/patients/${other.id}`;
  const callBusy = call.status !== 'idle';

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border/70 px-3 py-3 sm:px-5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft />
        </Button>
        <UserAvatar user={other} size="md" online={other.online} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-slate-900">{other.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {typing ? (
              <span className="font-medium text-primary">typing…</span>
            ) : (
              <>
                <span className={other.online ? 'font-medium text-emerald-600' : undefined}>
                  {other.online ? 'Online' : 'Offline'}
                </span>
                {other.subtitle && <> · {other.subtitle}</>}
              </>
            )}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" aria-label="View profile">
              <Link to={profileLink}>
                <UserRound />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{meRole === 'student' ? 'Doctor profile' : 'Patient record'}</TooltipContent>
        </Tooltip>
        <Button
          variant="soft"
          size="sm"
          onClick={() => call.startCall(other)}
          disabled={callBusy}
          aria-label={`Start a video call with ${other.name}`}
        >
          <Video /> <span className="hidden sm:inline">Video call</span>
        </Button>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,#f8fafc,#f4f6f9)] px-3 py-3 sm:px-6"
      >
        {messages.isLoading ? (
          <ListSkeleton rows={5} className="py-4" />
        ) : messages.isError ? (
          <ErrorState error={messages.error} retry={() => messages.refetch()} className="my-6" />
        ) : list.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title={`Start your conversation with ${other.name}`}
            description={
              meRole === 'student'
                ? 'Ask about follow-ups, reports or how to take your medicines. Doctors reply during OPD hours.'
                : 'Send your patient follow-up advice or check on their recovery.'
            }
            compact
          />
        ) : (
          <>
            {hasEarlier && (
              <div className="flex justify-center py-2">
                <Button variant="outline" size="xs" onClick={loadEarlier} disabled={loadingEarlier}>
                  {loadingEarlier && <Loader2 className="animate-spin" />} Load earlier messages
                </Button>
              </div>
            )}
            {items.map((item) =>
              item.type === 'day' ? (
                <DaySeparator key={item.key} label={item.label} />
              ) : (
                <MessageBubble key={item.key} message={item.message} meId={meId} first={item.first} last={item.last} />
              ),
            )}
          </>
        )}
        {typing && <TypingBubble name={other.name} />}
      </div>

      {/* Composer */}
      <div className="border-t border-border/70 bg-card px-3 pt-3 pb-2.5 sm:px-5">
        <div className="flex items-end gap-2 rounded-xl border border-input bg-white px-3 py-2 shadow-xs transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={`Message ${other.name}…`}
            aria-label="Message"
            className="max-h-36 min-h-6 flex-1 resize-none bg-transparent py-1 text-sm leading-6 outline-none placeholder:text-slate-400"
          />
          <Button size="icon-sm" onClick={submit} disabled={!draft.trim() || send.isPending} aria-label="Send message">
            {send.isPending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          </Button>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
          {meRole === 'student' ? (
            <span className="flex items-center gap-1">
              <Siren className="size-3 text-rose-500" />
              Not for emergencies —{' '}
              <Link to="/student/emergency" className="font-medium text-rose-600 hover:underline">
                request emergency help
              </Link>
            </span>
          ) : (
            <span>Enter to send · Shift + Enter for a new line</span>
          )}
          <span className={cn('tabular-nums', draft.length > MAX_LENGTH - 200 ? 'text-amber-600' : 'invisible')}>
            {draft.length}/{MAX_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
}
