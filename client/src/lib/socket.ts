import { useEffect, useRef, useSyncExternalStore } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let socketToken: string | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const l of listeners) l();
}

/** Connects (or reconnects when the signed-in account changes) the realtime socket. */
export function connectSocket(token: string): Socket {
  if (socket && socketToken === token) return socket;
  socket?.disconnect();
  socketToken = token;
  socket = io({ path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'] });
  emitChange();
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  socketToken = null;
  emitChange();
}

export function getSocket(): Socket | null {
  return socket;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current socket (re-renders when it is replaced after an account switch). */
export function useSocket(): Socket | null {
  return useSyncExternalStore(subscribe, getSocket, () => null);
}

/** Subscribes to a server event for the lifetime of the component. */
export function useSocketEvent<T = unknown>(event: string, handler: (payload: T) => void): void {
  const s = useSocket();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!s) return;
    const fn = (payload: T) => ref.current(payload);
    s.on(event, fn);
    return () => {
      s.off(event, fn);
    };
  }, [s, event]);
}
