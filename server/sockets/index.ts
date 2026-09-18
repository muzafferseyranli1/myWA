import { Server, Socket } from 'socket.io';
import { authService } from '../services/auth.service';
import { whatsappService } from '../services/whatsapp.service';
import { randomUUID } from 'node:crypto';
import { enqueue, notificationView } from '../services/delivery.service';
import { events } from '../lib/events';
import { prisma } from '../lib/prisma';
import { mediaView } from '../lib/media';

let ioInstance: Server | null = null;

export const setupSockets = (io: Server) => {
  ioInstance = io;
  events.on('notification_updated', view => io.emit('notification_updated', view));
  
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        const user = authService.verifyToken(token);
        (socket as any).user = user;
        next();
      } catch (err) {
        next(new Error('Authentication error'));
      }
    } else {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Emit current WhatsApp status & QR immediately upon connection
    const status = whatsappService.getStatus();
    socket.emit('whatsapp_status', { ...status, qr: (socket as any).user.role === 'ADMIN' ? status.qr : null });

    socket.on('join_chat', (chatId: string) => {
      if (typeof chatId === 'string' && chatId.length < 200) socket.join(`chat_${chatId}`);
    });

    socket.on('leave_chat', (chatId: string) => {
      socket.leave(`chat_${chatId}`);
    });

    socket.on('send_message', async (data: { chatId: string, text?: string, body?: string, clientMessageId?: string }, ack?: (result: any) => void) => {
      try {
        const { chatId } = data;
        const text = data.text || data.body || '';
        if (typeof chatId !== 'string' || !chatId.includes('@') || typeof text !== 'string' || !text.trim() || text.length > 20000 || (data.clientMessageId !== undefined && (typeof data.clientMessageId !== 'string' || !data.clientMessageId || data.clientMessageId.length > 128))) throw new Error('Invalid message');
        const job = await enqueue(prisma, { operationKey: `chat:${(socket as any).user.id}:${data.clientMessageId || randomUUID()}`, chatId, kind: 'CHAT', payload: { text, mentions: [] } });
        if (typeof ack === 'function') ack({ success: true, notification: notificationView(job) });
        events.emit('notification_updated', notificationView(job));
      } catch (error) {
        console.error('Send message error:', error);
        if (typeof ack === 'function') ack({ success: false, error: 'Mesaj kaydedilemedi' });
        socket.emit('error', 'Failed to queue message');
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

export const broadcastNewMessage = (message: any) => {
  if (ioInstance) {
    // Emit to the specific chat room so only clients that joined that chat receive it
    if (message?.chatId) {
      ioInstance.to(`chat_${message.chatId}`).emit('new_message', mediaView(message));
    }
    // Always broadcast chat list update to all clients (sidebar refresh)
    ioInstance.emit('chat_updated', message?.chatId);
    ioInstance.emit('message_arrived', {id:message.id,chatId:message.chatId,body:message.body,messageType:message.messageType,isFromMe:message.isFromMe,timestamp:message.timestamp});
  }
};

export const broadcastTaskCreated = (task: any) => {
  if (ioInstance) {
    ioInstance.emit('task_created', task);
  }
};

export const broadcastTaskUpdated = (task: any) => {
  if (ioInstance) {
    ioInstance.emit('task_updated', task);
  }
};

export const broadcastTaskDeleted = (taskId: string) => {
  if (ioInstance) {
    ioInstance.emit('task_deleted', taskId);
  }
};

export const broadcastWhatsAppStatus = (status: any) => {
  if (ioInstance) {
    for (const socket of ioInstance.sockets.sockets.values()) socket.emit('whatsapp_status', { ...status, qr: (socket as any).user.role === 'ADMIN' ? status.qr : null });
  }
};
