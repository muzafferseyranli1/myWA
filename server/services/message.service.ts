import { prisma } from '../lib/prisma';
import type { MessageType } from '../../src/lib/types';
import { contactResolver } from './contact-resolver.service';

export const messageService = {
  async saveMessage(data: any) {
    const {
      id, chatId, chatName, isGroup, senderId, senderPhone, senderName,
      body, quotedText, quotedSender, messageType, mediaUrl, mediaName, mediaMime, isFromMe, timestamp
    } = data;

    // Only update chat name if it's provided and not a fallback JID or if current chat name is just a JID
    const existingChat = await prisma.chat.findUnique({ where: { id: chatId } });
    const shouldUpdateName = chatName && !chatName.includes('@') && (!existingChat || existingChat.name.includes('@'));

    await prisma.chat.upsert({
      where: { id: chatId },
      update: {
        name: shouldUpdateName ? chatName : existingChat?.name || chatName || chatId,
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
      if (senderName || contact.displayName || contact.pushName) {
        contactResolver.cacheContactName(contact.id, senderName || contact.displayName || contact.pushName || '');
      }
    }

    // Resolve quotedSender if it's an ID or phone number
    let resolvedQuotedSender = quotedSender;
    if (quotedSender) {
      const name = await contactResolver.resolveDisplayName(quotedSender);
      if (name && !name.includes('@')) {
        resolvedQuotedSender = name;
      }
    }

    // Determine message type
    let validMessageType: MessageType = 'TEXT';
    if (messageType && ['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'SYSTEM'].includes(messageType)) {
      validMessageType = messageType as MessageType;
    }

    // Create or update message record
    const message = await prisma.message.upsert({
      where: { id: id || `${Date.now()}_${Math.random()}` },
      update: {
        body: body || '',
        quotedText: quotedText || null,
        quotedSender: resolvedQuotedSender || null,
        messageType: validMessageType,
        mediaUrl: mediaUrl || null,
        mediaName: mediaName || null,
        mediaMime: mediaMime || null,
      },
      create: {
        id: id || `${Date.now()}_${Math.random()}`,
        chatId,
        senderId: isFromMe ? null : validSenderId,
        body: body || '',
        quotedText: quotedText || null,
        quotedSender: resolvedQuotedSender || null,
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

  async getMessagesByChat(chatId: string, page: number = 1, limit: number = 100) {
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
    
    const resolvedMessages = await Promise.all(messages.map(async (msg) => {
      let qSender = msg.quotedSender;
      if (qSender && (/^\d+$/.test(qSender) || qSender.includes('@'))) {
        const found = contactResolver.getDisplayNameSync(qSender);
        if (found) {
          qSender = found;
        } else {
          const resolved = await contactResolver.resolveDisplayName(qSender);
          if (resolved && !resolved.includes('@')) qSender = resolved;
        }
      }
      return {
        ...msg,
        quotedSender: qSender
      };
    }));

    return {
      messages: resolvedMessages.reverse(),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }
};
