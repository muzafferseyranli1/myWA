import { Router } from 'express';
import { prisma } from '../../src/lib/prisma';
import { messageService } from '../services/message.service';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { tasks: true }
        },
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    });

    const chatsWithLastMessage = chats.map((chat) => {
      const { messages, ...rest } = chat as any;
      return { ...rest, lastMessage: messages[0] || null };
    });

    res.json(chatsWithLastMessage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

router.get('/:chatId/messages', requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await messageService.getMessagesByChat(chatId, page, limit);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.get('/:chatId/tasks', requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const tasks = await prisma.task.findMany({
      where: { chatId },
      include: {
        assignees: {
          include: {
            contact: true
          }
        },
        chat: true,
        sourceMessage: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

router.get('/:chatId/contacts', requireAuth, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Try GroupParticipant first
    const participants = await prisma.groupParticipant.findMany({
      where: { chatId },
      include: { contact: true }
    });
    if (participants.length > 0) {
      return res.json(participants.map(p => ({
        id: p.contact.id,
        phoneNumber: p.contact.phoneNumber,
        pushName: p.contact.pushName,
        displayName: p.contact.displayName,
        role: p.role
      })));
    }
    
    // Fallback: unique message senders
    const senders = await prisma.message.findMany({
      where: { chatId, senderId: { not: null } },
      select: { senderId: true },
      distinct: ['senderId']
    });

    const contacts = await prisma.contact.findMany({
      where: { id: { in: senders.map(s => s.senderId!).filter(Boolean) } }
    });

    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

export default router;
