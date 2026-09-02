import { prisma } from '../../src/lib/prisma';
import type { MessageType } from '../../src/lib/types';

export const messageService = {
  async saveMessage(data: any) {
    const {
      id, chatId, chatName, isGroup, senderId, senderPhone, senderName,
      body, messageType, mediaUrl, mediaName, mediaMime, isFromMe, timestamp
    } = data;

    // Upsert chat
    await prisma.chat.upsert({
      where: { id: chatId },
      update: {
        name: chatName || chatId,
        isGroup: !!isGroup,
        updatedAt: timestamp ? new Date(timestamp) : new Date()
      },
      create: {
        id: chatId,
        name: chatName || chatId,
        isGroup: !!isGroup,
        updatedAt: timestamp ? new Date(timestamp) : new Date()
      }
    });

    // Upsert contact (sender) if available
    let validSenderId: string | null = null;
    if (senderId && senderId !== 'me') {
      const contact = await prisma.contact.upsert({
        where: { id: senderId },
        update: {
          pushName: senderName || undefined,
          phoneNumber: senderPhone || senderId.split('@')[0],
        },
        create: {
          id: senderId,
          pushName: senderName || null,
          displayName: senderName || null,
          phoneNumber: senderPhone || senderId.split('@')[0],
        }
      });
      validSenderId = contact.id;
    }

    // Determine message type
    let validMessageType: MessageType = 'TEXT';
    if (messageType && ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'SYSTEM'].includes(messageType)) {
      validMessageType = messageType as MessageType;
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        id: id || `${Date.now()}_${Math.random()}`,
        chatId,
        senderId: isFromMe ? null : validSenderId,
        body: body || '',
        messageType: validMessageType,
        mediaUrl: mediaUrl || null,
        mediaName: mediaName || null,
        mediaMime: mediaMime || null,
        isFromMe: !!isFromMe,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      },
      include: {
        sender: true
      }
    });

    return message;
  },

  async getMessagesByChat(chatId: string, page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit,
      include: {
        sender: true,
        task: {
          include: {
            assignees: {
              include: {
                contact: true
              }
            }
          }
        }
      }
    });
    
    const total = await prisma.message.count({ where: { chatId } });
    
    return {
      messages: messages.reverse(),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }
};
