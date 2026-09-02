'use client';

import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from './types';

export type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socketInstance: TypedSocket | null = null;

export function getSocket(): TypedSocket {
  if (!socketInstance) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('mywa_token') : null;
    socketInstance = io({
      autoConnect: false,
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as TypedSocket;
  }
  return socketInstance;
}

export const socket = typeof window !== 'undefined' ? getSocket() : ({} as TypedSocket);

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
