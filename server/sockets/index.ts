import { Server, Socket } from 'socket.io';
import { authService } from '../services/auth.service';
import { wahaService } from '../services/waha.service';
import { randomUUID } from 'node:crypto';
import { enqueue, notificationView } from '../services/delivery.service';
import { events } from '../lib/events';
import { prisma } from '../lib/prisma';
import { mediaView } from '../lib/media';
import { maybeTenant, runWithTenant, Tenant, tenantForUser } from '../lib/tenant';

let ioInstance: Server | null = null;

// Every socket joins only its own tenant's rooms. All broadcasts go to the room
// of the tenant active in the current context, never to every socket, so
// events of one WhatsApp account can never reach another user.
const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;
const chatRoom = (tenantId: string, chatId: string) => `tenant:${tenantId}:chat:${chatId}`;

function toTenant(event: string, payload?: unknown) {
  const tenant = maybeTenant();
  if (ioInstance && tenant) ioInstance.to(tenantRoom(tenant.id)).emit(event, payload);
}

export const setupSockets = (io: Server) => {
  ioInstance = io;
  // Emitted from inside a tenant context; each goes to that tenant's sockets only.
  events.on('new_message', broadcastNewMessage);
  events.on('message_updated', broadcastMessageUpdated);
  events.on('chat_updated', broadcastChatUpdated);
  events.on('notification_updated', view => toTenant('notification_updated', view));
  events.on('whatsapp_status', (tenantId: string, status: unknown) => io.to(tenantRoom(tenantId)).emit('whatsapp_status', status));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const user = authService.verifyToken(token);
      const tenant = tenantForUser(user.id);
      if (!tenant) return next(new Error('Authentication error'));
      (socket as any).user = user;
      (socket as any).tenant = tenant;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const tenant: Tenant = (socket as any).tenant;
    socket.join(tenantRoom(tenant.id));
    const inTenant = <A extends unknown[]>(handler: (...args: A) => unknown) => (...args: A) => runWithTenant(tenant, () => handler(...args));

    socket.emit('whatsapp_status', runWithTenant(tenant, () => wahaService.getStatus()));

    socket.on('join_chat', inTenant(async (chatId: unknown) => {
      if (typeof chatId !== 'string' || chatId.length >= 200) return;
      // The chat must exist in this user's own schema.
      if (await prisma.chat.findUnique({ where: { id: chatId }, select: { id: true } })) socket.join(chatRoom(tenant.id, chatId));
    }));

    socket.on('leave_chat', (chatId: unknown) => {
      if (typeof chatId === 'string') socket.leave(chatRoom(tenant.id, chatId));
    });

    socket.on('send_message', inTenant(async (data: { chatId: string, text?: string, body?: string, clientMessageId?: string }, ack?: (result: any) => void) => {
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
    }));
  });
};

export const broadcastNewMessage = (message: any) => {
  const tenant = maybeTenant();
  if (!ioInstance || !tenant) return;
  if (message?.chatId) ioInstance.to(chatRoom(tenant.id, message.chatId)).emit('new_message', mediaView(message));
  toTenant('chat_updated', message?.chatId);
  toTenant('message_arrived', { id: message.id, chatId: message.chatId, body: message.body, messageType: message.messageType, isFromMe: message.isFromMe, timestamp: message.timestamp });
};

export const broadcastMessageUpdated = (message: any) => {
  const tenant = maybeTenant();
  if (!ioInstance || !tenant) return;
  ioInstance.to(chatRoom(tenant.id, message.chatId)).emit('message_updated', { id: message.id, chatId: message.chatId, body: message.body, ack: message.ack, revoked: message.revoked, editedAt: message.editedAt });
  toTenant('chat_updated', message.chatId);
};

export const broadcastChatUpdated = () => toTenant('chat_updated');
export const broadcastTaskCreated = (task: any) => toTenant('task_created', task);
export const broadcastTaskUpdated = (task: any) => toTenant('task_updated', task);
export const broadcastTaskDeleted = (taskId: string) => toTenant('task_deleted', taskId);

/** Drops every live socket of a tenant, e.g. after the account was deactivated. */
export const disconnectTenant = (tenantId: string) => {
  ioInstance?.in(tenantRoom(tenantId)).disconnectSockets(true);
};
