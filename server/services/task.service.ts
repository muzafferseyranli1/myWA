import { prisma } from '../../src/lib/prisma';
import type { CreateTaskRequest, UpdateTaskRequest } from '../../src/lib/types';
import { whatsappService } from './whatsapp.service';
import { contactResolver } from './contact-resolver.service';

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
        
        const assigneeNames = assigneeContacts.map(a => a.contact.pushName || a.contact.phoneNumber).join(', ');
        const mentions = contactResolver.resolveMentions(assigneeContacts.map(a => a.contactId));
        
        const priorityEmoji: Record<string, string> = { LOW: '🟢', MEDIUM: '🟡', HIGH: '🟠', URGENT: '🔴' };
        const dueDateStr = task.dueDate ? new Date(task.dueDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Belirtilmedi';
        
        let message = `📌 *Yeni Görev Oluşturuldu!*\n\n`;
        message += `📋 *${task.title}*\n`;
        if (task.description) message += `📝 ${task.description}\n`;
        message += `⚡ Öncelik: ${priorityEmoji[task.priority] || '🟡'} ${task.priority}\n`;
        message += `📅 Bitiş: ${dueDateStr}\n`;
        if (assigneeNames) message += `👤 Görevliler: ${assigneeNames}\n`;
        
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
        const mentions = contactResolver.resolveMentions(assignees.map(a => a.contactId));
        const message = `✅ *Görev Tamamlandı!*\n\n📋 *${updatedTask.title}*\nDurum: ✅ Tamamlandı`;
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
  }
};
