import { prisma } from '../lib/prisma';
import type { CreateTaskRequest, UpdateTaskRequest } from '../../src/lib/types';
import { whatsappService } from './whatsapp.service';
import { contactResolver } from './contact-resolver.service';
import { urlShortenerService } from './url-shortener.service';

export const taskService = {
  async createTask(data: CreateTaskRequest & { createdBy?: string, notifyOnCreate?: boolean }) {
    const task = await prisma.task.create({
      data: {
        title: data.title,
        description: data.description || null,
        chatId: data.chatId,
        sourceMessageId: data.sourceMessageId || null,
        status: 'TODO',
        priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        createdBy: data.createdBy || null,
        notifyOnCreate: data.notifyOnCreate !== false,
        assignees: {
          create: (data.assigneeIds || []).map(contactId => ({
            contactId
          }))
        }
      },
      include: {
        assignees: {
          include: {
            contact: true
          }
        },
        chat: true,
        sourceMessage: true
      }
    });

    if (data.notifyOnCreate !== false && task.chatId) {
      try {
        const assigneeContacts = await prisma.taskAssignee.findMany({
          where: { taskId: task.id },
          include: { contact: true }
        });
        
        const priorityEmoji: Record<string, string> = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', URGENT: '🔴' };
        const priorityLabel: Record<string, string> = { LOW: 'Düşük', MEDIUM: 'Orta', HIGH: 'Yüksek', URGENT: 'Acil' };
        const dueDateStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Belirtilmedi';

        // Build assignee mention tags: @905332760534 (virgülsüz, boşlukla ayrılmış)
        const mentionJids: string[] = [];
        const assigneeTags = assigneeContacts.map(a => {
          const { tag, jid } = contactResolver.resolveAssigneeMention(a.contact);
          if (jid) mentionJids.push(jid);
          return tag;
        }).filter(Boolean).join(' ');
        
        const mentions = [...new Set(mentionJids)];
        
        let message = `📌 *Yeni Görev Oluşturuldu!*\n\n`;
        message += `📋 *${task.title}*\n`;
        if (task.description) message += `📝 ${task.description}\n`;
        message += `⚡ Öncelik: ${priorityEmoji[task.priority] || '🟡'} ${priorityLabel[task.priority] || task.priority}\n`;
        message += `📅 Bitiş: ${dueDateStr}\n`;
        if (assigneeTags) message += `👤 Görevliler: ${assigneeTags}\n`;
        
        // Include full source message text with resolved readable names
        const sourceBody = (data as any).sourceMessageBody || task.sourceMessage?.body;
        if (sourceBody) {
          const readableSourceBody = await contactResolver.formatMentionsToNames(sourceBody);
          message += `\n💬 _Kaynak mesaj:_\n_"${readableSourceBody}"_`;
        }

        const baseUrl = process.env.APP_URL!;
        const taskUrl = await urlShortenerService.shortenUrl(`${baseUrl}/t/${task.id}`);
        message += `\n\n🔗 *Görevi İncele & Kapat:*\n${taskUrl}`;
        
        await whatsappService.sendMessage(task.chatId, message, mentions);
      } catch (e) {
        console.error('Task WA notification error:', e);
      }
    }

    return task;
  },

  async updateTask(id: string, data: UpdateTaskRequest) {
    const updateData: any = { ...data };
    delete updateData.assigneeIds;
    
    if (updateData.dueDate !== undefined) {
      updateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
    }

    const updatedTask = await prisma.$transaction(async (tx) => {
      if (data.assigneeIds !== undefined) {
        await tx.taskAssignee.deleteMany({
          where: { taskId: id }
        });
        
        if (data.assigneeIds.length > 0) {
          await tx.taskAssignee.createMany({
            data: data.assigneeIds.map(contactId => ({
              taskId: id,
              contactId
            }))
          });
        }
      }

      return await tx.task.update({
        where: { id },
        data: updateData,
        include: {
          assignees: {
            include: {
              contact: true
            }
          },
          chat: true,
          sourceMessage: true
        }
      });
    });

    if (data.status === 'DONE' && updatedTask.chatId) {
      try {
        const assignees = await prisma.taskAssignee.findMany({
          where: { taskId: id },
          include: { contact: true }
        });
        const mentionJids: string[] = [];
        const assigneeTags = assignees.map(a => {
          const { tag, jid } = contactResolver.resolveAssigneeMention(a.contact);
          if (jid) mentionJids.push(jid);
          return tag;
        }).filter(Boolean).join(' ');
        const mentions = [...new Set(mentionJids)];
        let message = `✅ *Görev Tamamlandı!*\n\n📋 *${updatedTask.title}*\n`;
        if (assigneeTags) message += `👤 Görevliler: ${assigneeTags}\n`;
        message += `Durum: ✅ Tamamlandı`;
        await whatsappService.sendMessage(updatedTask.chatId, message, mentions);
      } catch (e) {
        console.error('Task completion WA notification error:', e);
      }
    }

    return updatedTask;
  },

  async deleteTask(id: string) {
    return await prisma.task.delete({
      where: { id }
    });
  },

  async getTasksByChat(chatId: string) {
    return await prisma.task.findMany({
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
  },

  async getKanbanData(filters: any = {}) {
    const where: any = {};
    if (filters.chatId) where.chatId = filters.chatId;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) {
      where.assignees = {
        some: {
          contactId: filters.assigneeId
        }
      };
    }

    const tasks = await prisma.task.findMany({
      where,
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

    const now = new Date();
    
    return {
      tasks,
      stats: {
        total: tasks.length,
        todo: tasks.filter(t => t.status === 'TODO').length,
        inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
        done: tasks.filter(t => t.status === 'DONE').length,
        overdue: tasks.filter(t => t.dueDate && t.dueDate < now && t.status !== 'DONE').length
      }
    };
  },

  async getOverdueTasks() {
    const now = new Date();
    return await prisma.task.findMany({
      where: {
        dueDate: {
          lt: now
        },
        status: {
          not: 'DONE'
        }
      },
      include: {
        assignees: {
          include: {
            contact: true
          }
        },
        chat: true,
        sourceMessage: true
      }
    });
  },

  async getTaskById(id: string) {
    return await prisma.task.findUnique({
      where: { id },
      include: {
        assignees: {
          include: {
            contact: true
          }
        },
        chat: true,
        sourceMessage: true
      }
    });
  },

  async closeTask(id: string, data: { completionNote: string; completedBy?: string }) {
    const existingTask = await prisma.task.findUnique({
      where: { id },
      include: {
        assignees: { include: { contact: true } },
        chat: true,
        sourceMessage: true
      }
    });

    if (!existingTask) {
      throw new Error('Görev bulunamadı');
    }

    if (existingTask.status === 'DONE') {
      return existingTask;
    }

    const completedAt = new Date();
    const updatedTask = await prisma.task.update({
      where: { id },
      data: {
        status: 'DONE',
        completionNote: data.completionNote,
        completedBy: data.completedBy || null,
        completedAt
      },
      include: {
        assignees: { include: { contact: true } },
        chat: true,
        sourceMessage: true
      }
    });

    // WhatsApp grubuna detaylı kapanış bildirimi gönder
    if (updatedTask.chatId) {
      try {
        const mentionJids: string[] = [];
        const assigneeTags = updatedTask.assignees.map(a => {
          const { tag, jid } = contactResolver.resolveAssigneeMention(a.contact);
          if (jid) mentionJids.push(jid);
          return tag;
        }).filter(Boolean).join(' ');
        const mentions = [...new Set(mentionJids)];

        const formattedDate = completedAt.toLocaleString('tr-TR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        let message = `✅ *Görev Tamamlandı ve Kapatıldı!*\n\n`;
        message += `📋 *${updatedTask.title}*\n`;
        if (assigneeTags) message += `👤 Görevliler: ${assigneeTags}\n`;
        if (data.completedBy) message += `✍️ Kapatan: *${data.completedBy}*\n`;
        message += `📝 *Kapanış Notu:*\n"${data.completionNote}"\n\n`;
        message += `⏰ ${formattedDate}`;

        await whatsappService.sendMessage(updatedTask.chatId, message, mentions);
      } catch (e) {
        console.error('Task close WA notification error:', e);
      }
    }

    return updatedTask;
  }
};
