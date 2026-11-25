import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ChatMessage, Conversation } from '@shared/types';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/lib/socket';
import { conversationsKey } from './api';

/**
 * Toasts incoming chat messages while the user is elsewhere in the app
 * (the server only creates persistent notifications for offline recipients).
 */
export function ChatNotifier() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useSocketEvent<ChatMessage>('message:new', async (message) => {
    if (user.role !== 'student' && user.role !== 'doctor') return;
    if (message.kind !== 'text' || message.senderId === null || message.senderId === user.id) return;
    void qc.invalidateQueries({ queryKey: conversationsKey });
    if (location.pathname.endsWith('/messages')) return;

    let name = qc
      .getQueryData<Conversation[]>(conversationsKey)
      ?.find((c) => c.id === message.conversationId)?.otherParty.name;
    if (!name) {
      try {
        name = (await api.get<Conversation>(`/conversations/${message.conversationId}`)).otherParty.name;
      } catch {
        name = undefined;
      }
    }
    const preview = message.body.length > 90 ? `${message.body.slice(0, 87)}…` : message.body;
    toast(name ? `New message from ${name}` : 'New message', {
      description: preview,
      duration: 6000,
      action: {
        label: 'Reply',
        onClick: () => navigate(`/${user.role}/messages?c=${message.conversationId}`),
      },
    });
  });

  return null;
}
