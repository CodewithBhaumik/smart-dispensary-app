import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { getUserFromToken, type SessionUser } from '../middleware/auth';
import { registerCallHandlers } from './calls';
import { registerChatHandlers } from './chat';

let io: Server | null = null;
/** userId → connected socket ids (a user may have several tabs open). */
const online = new Map<number, Set<string>>();

export function initRealtime(httpServer: HttpServer): Server {
  io = new Server(httpServer, { path: '/socket.io', cors: { origin: true, credentials: true } });

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    const user = getUserFromToken(token);
    if (!user) return next(new Error('UNAUTHORIZED'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as SessionUser;
    socket.join(`user:${user.id}`);
    const sockets = online.get(user.id) ?? new Set<string>();
    const cameOnline = sockets.size === 0;
    sockets.add(socket.id);
    online.set(user.id, sockets);
    if (cameOnline) io?.emit('presence', { userId: user.id, online: true });

    registerChatHandlers(io!, socket);
    registerCallHandlers(io!, socket);

    socket.on('disconnect', () => {
      const set = online.get(user.id);
      if (!set) return;
      set.delete(socket.id);
      if (set.size === 0) {
        online.delete(user.id);
        io?.emit('presence', { userId: user.id, online: false });
      }
    });
  });

  return io;
}

export function getIO(): Server | null {
  return io;
}

const toArray = (ids: number | number[]) => (Array.isArray(ids) ? ids : [ids]);

export function emitToUser(userIds: number | number[], event: string, payload: unknown): void {
  if (!io) return;
  for (const id of new Set(toArray(userIds))) io.to(`user:${id}`).emit(event, payload);
}

export function emitToAll(event: string, payload: unknown): void {
  io?.emit(event, payload);
}

/**
 * Tells open clients to refetch React Query keys (e.g. ['appointments','dashboard']).
 * Omit `userIds` to broadcast to everyone.
 */
export function emitInvalidate(keys: string[], userIds?: number[]): void {
  if (!io) return;
  if (userIds) emitToUser(userIds, 'invalidate', { keys });
  else io.emit('invalidate', { keys });
}

export function isOnline(userId: number): boolean {
  return (online.get(userId)?.size ?? 0) > 0;
}

export function onlineUserIds(): number[] {
  return [...online.keys()];
}

/** Force-disconnects every socket of a user (e.g. after deactivation). */
export function disconnectUser(userId: number): void {
  io?.in(`user:${userId}`).disconnectSockets(true);
}
