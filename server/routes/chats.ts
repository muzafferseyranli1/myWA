import { Router } from 'express';
import { prisma } from '../../src/lib/prisma';
import { messageService } from '../services/message.service';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { tasks: true }
        }
      }
    });

    const chatsWithLastMessage = await Promise.all(chats.map(async (chat) => {
      const lastMessage = await prisma.message.findFirst({
        where: { chatId: chat.id },
        orderBy: { timestamp: 'desc' }
      });
      return { ...chat, lastMessage };
    }));

    res.json(chatsWithLastMessage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

router.get('/:chatId/messages', async (req, res) => {
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

router.get('/:chatId/tasks', async (req, res) => {
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

router.get('/:chatId/contacts', async (req, res) => {
  try {
    const { chatId } = req.params;
    
    // Get unique sender IDs from messages in this chat
    const messages = await prisma.message.findMany({
      where: { chatId, senderId: { not: null } },
      select: { senderId: true },
      distinct: ['senderId']
    });

    const senderIds = messages
      .map(m => m.senderId)
      .filter((id): id is string => Boolean(id));

    const contacts = await prisma.contact.findMany({
      where: { id: { in: senderIds } }
    });

    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

export default router;
