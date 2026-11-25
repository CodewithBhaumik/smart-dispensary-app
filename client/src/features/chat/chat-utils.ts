import { format, isToday, isYesterday, parseISO, differenceInCalendarDays } from 'date-fns';
import type { ChatMessage } from '@shared/types';
import { formatDayLabel, toDateStr } from '@/lib/format';

/** Conversation list timestamp: "2:35 PM", "Yesterday", "Mon", "23 Nov". */
export function listTimeLabel(iso: string): string {
  const d = parseISO(iso);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, 'EEE');
  return format(d, 'd MMM');
}

export const bubbleTime = (iso: string) => format(parseISO(iso), 'h:mm a');

/** Label for a call summary message from the viewer's point of view. */
export function callLabel(message: ChatMessage, meId: number): { text: string; tone: 'ok' | 'missed' | 'muted' } {
  const status = message.meta?.callStatus;
  const outgoing = message.senderId === meId;
  switch (status) {
    case 'completed':
      return { text: message.body, tone: 'ok' };
    case 'missed':
      return outgoing ? { text: 'Video call · No answer', tone: 'muted' } : { text: 'Missed video call', tone: 'missed' };
    case 'declined':
      return outgoing ? { text: 'Video call · Declined', tone: 'muted' } : { text: 'You declined a video call', tone: 'muted' };
    case 'cancelled':
      return outgoing ? { text: 'Video call · Cancelled', tone: 'muted' } : { text: 'Missed video call', tone: 'missed' };
    default:
      return { text: message.body, tone: 'muted' };
  }
}

export function messagePreview(message: ChatMessage | null, meId: number): string {
  if (!message) return 'No messages yet — say hello';
  if (message.kind === 'call') return callLabel(message, meId).text;
  if (message.kind === 'system') return message.body;
  return message.senderId === meId ? `You: ${message.body}` : message.body;
}

export type ThreadItem =
  | { type: 'day'; key: string; label: string }
  | { type: 'message'; key: string; message: ChatMessage; first: boolean; last: boolean };

const GROUP_GAP_MS = 5 * 60 * 1000;

/** Adds day separators and marks the first/last bubble of each sender group. */
export function buildThread(messages: ChatMessage[]): ThreadItem[] {
  const items: ThreadItem[] = [];
  let lastDay = '';
  messages.forEach((m, i) => {
    const day = toDateStr(parseISO(m.createdAt));
    if (day !== lastDay) {
      items.push({ type: 'day', key: `day-${day}`, label: formatDayLabel(day) });
      lastDay = day;
    }
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const sameGroup = (a?: ChatMessage, b?: ChatMessage) =>
      !!a &&
      !!b &&
      a.kind === 'text' &&
      b.kind === 'text' &&
      a.senderId === b.senderId &&
      toDateStr(parseISO(a.createdAt)) === toDateStr(parseISO(b.createdAt)) &&
      Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) < GROUP_GAP_MS;
    items.push({
      type: 'message',
      key: `m-${m.id}`,
      message: m,
      first: !sameGroup(prev, m),
      last: !sameGroup(m, next),
    });
  });
  return items;
}
