import type { Server, Socket } from 'socket.io';
import type { SessionUser } from '../middleware/auth';
import { getConversationRow, isParticipant, otherParticipantId } from '../services/chat';
import { emitToUser } from './io';

/** Chat socket handlers: typing indicators relayed to the other participant. */
export function registerChatHandlers(_io: Server, socket: Socket): void {
  const user = socket.data.user as SessionUser;

  socket.on('typing', (payload: unknown) => {
    const { conversationId, isTyping } = (payload ?? {}) as { conversationId?: unknown; isTyping?: unknown };
    const id = Number(conversationId);
    if (!Number.isInteger(id) || id <= 0) return;
    const conv = getConversationRow(id);
    if (!conv || !isParticipant(conv, user.id)) return;
    emitToUser(otherParticipantId(conv, user.id), 'typing', {
      conversationId: id,
      userId: user.id,
      isTyping: Boolean(isTyping),
    });
  });
}
