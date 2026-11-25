import { Check, CheckCheck, Clock3, PhoneMissed, PhoneOff, PhoneOutgoing, Video } from 'lucide-react';
import type { ChatMessage } from '@shared/types';
import { cn } from '@/lib/utils';
import { bubbleTime, callLabel } from './chat-utils';

export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-slate-500">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function CallChip({ message, meId }: { message: ChatMessage; meId: number }) {
  const { text, tone } = callLabel(message, meId);
  const status = message.meta?.callStatus;
  const Icon =
    status === 'completed'
      ? Video
      : tone === 'missed'
        ? PhoneMissed
        : status === 'missed' && message.senderId === meId
          ? PhoneOutgoing
          : PhoneOff;
  return (
    <div className="flex justify-center py-1.5">
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium shadow-xs',
          tone === 'missed'
            ? 'border-rose-200 bg-rose-50 text-rose-700'
            : tone === 'ok'
              ? 'border-teal-200 bg-teal-50 text-teal-800'
              : 'border-slate-200 bg-white text-slate-600',
        )}
      >
        <Icon className="size-3.5" />
        <span>{text}</span>
        <span className="text-[11px] font-normal opacity-60">{bubbleTime(message.createdAt)}</span>
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  meId,
  first,
  last,
}: {
  message: ChatMessage;
  meId: number;
  first: boolean;
  last: boolean;
}) {
  if (message.kind === 'call') return <CallChip message={message} meId={meId} />;
  if (message.kind === 'system') {
    return <p className="py-1.5 text-center text-xs text-muted-foreground">{message.body}</p>;
  }

  const own = message.senderId === meId;
  const pending = message.id < 0;
  return (
    <div className={cn('flex', own ? 'justify-end' : 'justify-start', first ? 'mt-2.5' : 'mt-0.5')}>
      <div
        className={cn(
          'relative max-w-[78%] px-3.5 py-2 text-sm leading-relaxed shadow-xs sm:max-w-[68%]',
          own ? 'bg-primary text-white' : 'border border-border/80 bg-white text-slate-800',
          'rounded-2xl',
          own && !first && 'rounded-tr-md',
          own && !last && 'rounded-br-md',
          own && last && 'rounded-br-sm',
          !own && !first && 'rounded-tl-md',
          !own && !last && 'rounded-bl-md',
          !own && last && 'rounded-bl-sm',
          pending && 'opacity-75',
        )}
      >
        <p className="break-words whitespace-pre-wrap">{message.body}</p>
        <span
          className={cn(
            'mt-0.5 flex items-center justify-end gap-1 text-[10.5px] tabular-nums',
            own ? 'text-teal-50/80' : 'text-slate-400',
          )}
        >
          {bubbleTime(message.createdAt)}
          {own &&
            (pending ? (
              <Clock3 className="size-3" aria-label="Sending" />
            ) : message.readAt ? (
              <CheckCheck className="size-3.5 text-white" aria-label="Read" />
            ) : (
              <Check className="size-3.5" aria-label="Delivered" />
            ))}
        </span>
      </div>
    </div>
  );
}

export function TypingBubble({ name }: { name: string }) {
  return (
    <div className="mt-2.5 flex items-end gap-2" aria-live="polite">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-border/80 bg-white px-3.5 py-3 shadow-xs">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-slate-400"
            style={{ animationDelay: `${i * 140}ms`, animationDuration: '1s' }}
          />
        ))}
      </div>
      <span className="sr-only">{name} is typing</span>
    </div>
  );
}
