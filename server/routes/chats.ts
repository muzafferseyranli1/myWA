import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { messageService } from '../services/message.service';
import { requireAuth } from '../middleware/auth';
import { contactResolver } from '../services/contact-resolver.service';

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
      let name = chat.name;
      if (!chat.isGroup) {
        const isSelf = chat.id.includes('905332760534') || chat.id === '31933115404296@lid';
        const resolved = contactResolver.getDisplayNameSync(chat.id);
        const rawId = chat.id.split('@')[0];
        if (resolved && resolved !== rawId && !resolved.includes('@') && !/^\d{10,16}$/.test(resolved)) {
          if (isSelf || resolved !== 'Muzaffer') {
            name = resolved;
          }
        }
        if (!isSelf && name === 'Muzaffer') {
          name = (resolved && resolved !== 'Muzaffer' && !/^\d{10,16}$/.test(resolved)) ? resolved : rawId;
        }
        if (/^90\d{10}$/.test(name)) {
          name = `+90 ${name.substring(2, 5)} ${name.substring(5, 8)} ${name.substring(8, 10)} ${name.substring(10, 12)}`;
        }
      }
      return { ...rest, name, lastMessage: messages[0] || null };
    });

    res.json(chatsWithLastMessage);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

router.get('/:chatId/messages', requireAuth, async (req, res) => {
  try {
    const chatId = req.params.chatId as string;
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
    const chatId = req.params.chatId as string;
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
    const chatId = req.params.chatId as string;
    
    // Try GroupParticipant first
    const participants = await prisma.groupParticipant.findMany({
      where: { chatId },
      include: { contact: true }
    });
    if (participants.length > 0) {
      return res.json(participants.map(p => {
        const c = p.contact;
        const mappedJid = c.id.endsWith('@lid') ? contactResolver.resolveToMentionJid(c.id) : null;
        const realPhone = mappedJid ? mappedJid.split('@')[0] : (!contactResolver.isLid(c.phoneNumber) ? c.phoneNumber : null);
        const name = c.displayName || c.pushName || contactResolver.getDisplayNameSync(c.id) || (mappedJid ? contactResolver.getDisplayNameSync(mappedJid) : null);

        return {
          id: c.id,
          lidId: c.lidId || (c.id.endsWith('@lid') ? c.id : null),
          phoneNumber: realPhone || c.phoneNumber,
          pushName: name || c.pushName,
          displayName: c.displayName || name,
          mappedJid: mappedJid || null,
          role: p.role
        };
      }));
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

    res.json(contacts.map(c => {
      const mappedJid = c.id.endsWith('@lid') ? contactResolver.resolveToMentionJid(c.id) : null;
      const realPhone = mappedJid ? mappedJid.split('@')[0] : (!contactResolver.isLid(c.phoneNumber) ? c.phoneNumber : null);
      const name = c.displayName || c.pushName || contactResolver.getDisplayNameSync(c.id) || (mappedJid ? contactResolver.getDisplayNameSync(mappedJid) : null);

      return {
        id: c.id,
        lidId: c.lidId || (c.id.endsWith('@lid') ? c.id : null),
        phoneNumber: realPhone || c.phoneNumber,
        pushName: name || c.pushName,
        displayName: c.displayName || name,
        mappedJid: mappedJid || null
      };
    }));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
});

export default router;
