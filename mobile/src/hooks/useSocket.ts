import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getServerUrl } from '../api/client';
import { NotificationItem } from '../lib/types';
import { Handlers, SocketRegistry } from '../lib/socket-registry';

let globalSocket: Socket | null = null;
const registry = new SocketRegistry();
let generation = 0;
export const getSocket = () => globalSocket;
export function useSocketConnection(token: string | null) {
  useEffect(() => {
    const current = ++generation;
    globalSocket?.disconnect();
    globalSocket = null;
    if (!token) { registry.clearRooms(); return; }
    void getServerUrl().then(url => {
      if (current !== generation) return;
      const socket = io(url, { auth: { token }, transports: ['websocket', 'polling'], reconnectionDelay: 2000 });
      globalSocket = socket;
      const mapping: Record<string, keyof Handlers> = { message_updated: 'onMessageUpdated', whatsapp_status: 'onStatus', new_message: 'onNewMessage', chat_updated: 'onChatUpdated', task_created: 'onTaskCreated', task_updated: 'onTaskUpdated', task_deleted: 'onTaskDeleted', notification_updated: 'onNotificationUpdated' };
      for (const [event, key] of Object.entries(mapping)) socket.on(event, payload => {
        if (current === generation) registry.dispatch(key, payload);
      });
      socket.on('connect', () => {
        if (current === generation) registry.reconnect(socket);
      });
    });
    return () => { if (generation === current) { generation++; globalSocket?.disconnect(); globalSocket = null; } };
  }, [token]);
}
export const useSocket = (handlers?: Handlers) => {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => registry.subscribe(ref), []);
  return {
    joinChat: (id: string) => registry.join(id, globalSocket),
    leaveChat: (id: string) => registry.leave(id, globalSocket),
    sendMessage: (chatId: string, text: string, clientMessageId: string) => new Promise<NotificationItem>((resolve, reject) => {
      if (!globalSocket?.connected) return reject(new Error('Sunucu bağlantısı yok. Mesaj korunuyor; tekrar deneyin.'));
      globalSocket.timeout(15000).emit('send_message', { chatId, text, clientMessageId }, (error: any, result: any) => {
        if (error || !result?.success) reject(new Error(result?.error || 'Mesaj kaydı doğrulanamadı; aynı mesajı tekrar deneyin.'));
        else resolve(result.notification);
      });
    }),
  };
};