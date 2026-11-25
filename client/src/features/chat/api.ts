import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { ChatMessage, Conversation, DoctorListItem, PatientSummary } from '@shared/types';
import { api } from '@/lib/api';

export const PAGE_SIZE = 60;
export const conversationsKey = ['conversations'] as const;
export const messagesKey = (conversationId: number) => ['messages', conversationId] as const;

const byTime = (a: ChatMessage, b: ChatMessage) =>
  a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1;

export function useConversations() {
  return useQuery({
    queryKey: conversationsKey,
    queryFn: () => api.get<Conversation[]>('/conversations'),
    staleTime: 10_000,
  });
}

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: messagesKey(conversationId ?? 0),
    queryFn: () => api.get<ChatMessage[]>(`/conversations/${conversationId}/messages`, { limit: PAGE_SIZE }),
    enabled: conversationId !== null,
    staleTime: 30_000,
  });
}

/** Inserts or replaces a message in its thread cache (optionally dropping an optimistic temp message). */
export function upsertMessage(qc: QueryClient, message: ChatMessage, replaceTempId?: number): void {
  qc.setQueryData<ChatMessage[]>(messagesKey(message.conversationId), (prev) => {
    if (!prev) return prev;
    const list = replaceTempId !== undefined ? prev.filter((m) => m.id !== replaceTempId) : prev;
    if (list.some((m) => m.id === message.id)) return list.map((m) => (m.id === message.id ? message : m));
    return [...list, message].sort(byTime);
  });
}

/** Updates the conversation list after a message arrives. Returns false when the conversation is unknown. */
export function applyMessageToConversations(
  qc: QueryClient,
  message: ChatMessage,
  opts: { meId: number; isViewing: boolean },
): boolean {
  let found = false;
  qc.setQueryData<Conversation[]>(conversationsKey, (prev) => {
    if (!prev) return prev;
    const next = prev.map((c) => {
      if (c.id !== message.conversationId) return c;
      found = true;
      const alreadyCounted = c.lastMessage !== null && c.lastMessage.id >= message.id;
      const fromOther = message.senderId !== null && message.senderId !== opts.meId;
      return {
        ...c,
        lastMessage: alreadyCounted ? c.lastMessage : message,
        updatedAt: alreadyCounted ? c.updatedAt : message.createdAt,
        unreadCount: fromOther && !opts.isViewing && !alreadyCounted ? c.unreadCount + 1 : c.unreadCount,
      };
    });
    return [...next].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : b.id - a.id));
  });
  return found;
}

export function useSendMessage(conversationId: number, meId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<ChatMessage>(`/conversations/${conversationId}/messages`, { body }),
    onMutate: (body) => {
      const temp: ChatMessage = {
        id: -Date.now(),
        conversationId,
        senderId: meId,
        kind: 'text',
        body,
        meta: null,
        createdAt: new Date().toISOString(),
        readAt: null,
      };
      qc.setQueryData<ChatMessage[]>(messagesKey(conversationId), (prev) => [...(prev ?? []), temp]);
      return { tempId: temp.id };
    },
    onSuccess: (message, _body, ctx) => {
      upsertMessage(qc, message, ctx?.tempId);
      applyMessageToConversations(qc, message, { meId, isViewing: true });
    },
    onError: (_error, _body, ctx) => {
      if (!ctx) return;
      qc.setQueryData<ChatMessage[]>(messagesKey(conversationId), (prev) => prev?.filter((m) => m.id !== ctx.tempId));
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: number) => api.patch<{ ok: true }>(`/conversations/${conversationId}/read`),
    onMutate: (conversationId) => {
      qc.setQueryData<Conversation[]>(conversationsKey, (prev) =>
        prev?.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c)),
      );
    },
  });
}

export function useStartConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantId: number) => api.post<Conversation>('/conversations', { participantId }),
    onSuccess: (conversation) => {
      qc.setQueryData<Conversation[]>(conversationsKey, (prev) => {
        if (!prev) return [conversation];
        return prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev];
      });
    },
  });
}

/** Fetches an older page and prepends it to the thread. Returns how many messages were loaded. */
export async function loadEarlierMessages(qc: QueryClient, conversationId: number, beforeId: number): Promise<number> {
  const older = await api.get<ChatMessage[]>(`/conversations/${conversationId}/messages`, {
    before: beforeId,
    limit: PAGE_SIZE,
  });
  qc.setQueryData<ChatMessage[]>(messagesKey(conversationId), (prev) => {
    const existing = prev ?? [];
    const ids = new Set(existing.map((m) => m.id));
    return [...older.filter((m) => !ids.has(m.id)), ...existing].sort(byTime);
  });
  return older.length;
}

export function useChatDirectory(role: 'student' | 'doctor', enabled: boolean) {
  const doctors = useQuery({
    queryKey: ['doctors', 'chat-directory'],
    queryFn: () => api.get<DoctorListItem[]>('/doctors'),
    enabled: enabled && role === 'student',
    staleTime: 60_000,
  });
  const patients = useQuery({
    queryKey: ['patients', 'chat-directory'],
    queryFn: () => api.get<PatientSummary[]>('/patients'),
    enabled: enabled && role === 'doctor',
    staleTime: 60_000,
  });
  return role === 'student' ? doctors : patients;
}
