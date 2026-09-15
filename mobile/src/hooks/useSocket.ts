import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth.store';
import { getServerUrl } from '../api/client';
import { WAStatus, MessageItem, TaskItem } from '../lib/types';

let globalSocket: Socket | null = null;

export const getSocket = () => globalSocket;

export const useSocket = (handlers?: {
  onStatus?: (status: WAStatus) => void;
  onNewMessage?: (msg: MessageItem) => void;
  onChatUpdated?: (chatId?: string) => void;
  onTaskCreated?: (task: TaskItem) => void;
  onTaskUpdated?: (task: TaskItem) => void;
  onTaskDeleted?: (taskId: string) => void;
}) => {
  const token = useAuthStore((s) => s.token);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) {
      if (globalSocket) {
        globalSocket.disconnect();
        globalSocket = null;
      }
      return;
    }

    let isMounted = true;

    const initSocket = async () => {
      const url = await getServerUrl();
      if (!isMounted) return;

      if (globalSocket && globalSocket.connected) {
        return;
      }

      globalSocket = io(url, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 2000,
      });

      globalSocket.on('whatsapp_status', (status: WAStatus) => {
        handlersRef.current?.onStatus?.(status);
      });

      globalSocket.on('new_message', (msg: MessageItem) => {
        handlersRef.current?.onNewMessage?.(msg);
      });

      globalSocket.on('chat_updated', (chatId?: string) => {
        handlersRef.current?.onChatUpdated?.(chatId);
      });

      globalSocket.on('task_created', (task: TaskItem) => {
        handlersRef.current?.onTaskCreated?.(task);
      });

      globalSocket.on('task_updated', (task: TaskItem) => {
        handlersRef.current?.onTaskUpdated?.(task);
      });

      globalSocket.on('task_deleted', (taskId: string) => {
        handlersRef.current?.onTaskDeleted?.(taskId);
      });
    };

    initSocket();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return {
    socket: globalSocket,
    joinChat: (chatId: string) => globalSocket?.emit('join_chat', chatId),
    leaveChat: (chatId: string) => globalSocket?.emit('leave_chat', chatId),
    sendMessage: (chatId: string, text: string) => globalSocket?.emit('send_message', { chatId, text }),
  };
};
