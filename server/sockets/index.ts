import { Server, Socket } from 'socket.io';
import { authService } from '../services/auth.service';
import { whatsappService } from '../services/whatsapp.service';
import { messageService } from '../services/message.service';
import { prisma } from '../../src/lib/prisma';

let ioInstance: Server | null = null;

export const setupSockets = (io: Server) => {
  ioInstance = io;
  
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

    socket.on('join_chat', (chatId: string) => {
      socket.join(`chat_${chatId}`);
    });

    socket.on('leave_chat', (chatId: string) => {
      socket.leave(`chat_${chatId}`);
    });

    socket.on('send_message', async (data: { chatId: string, text: string }) => {
      try {
        const { chatId, text } = data;
        const result = await whatsappService.sendMessage(chatId, text);
        
        // WhatsApp doesn't send a full message object back immediately for our own messages in the same way,
        // but Baileys might emit it in messages.upsert.
        // If needed, we can proactively save it here, but typically it's better to wait for messages.upsert to handle it.
      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', 'Failed to send message');
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

export const broadcastNewMessage = (message: any) => {
  if (ioInstance) {
    ioInstance.to(`chat_${message.chatId}`).emit('new_message', message);
    ioInstance.emit('chat_updated', message.chatId);
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
    ioInstance.emit('whatsapp_status', status);
  }
};
