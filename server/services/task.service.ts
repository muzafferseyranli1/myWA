import { prisma } from '../../src/lib/prisma';
import type { CreateTaskRequest, UpdateTaskRequest } from '../../src/lib/types';

export const taskService = {
  async createTask(data: CreateTaskRequest & { createdBy?: string }) {
    return await prisma.task.create({
      data: {
        title: data.title,
        description: data.description || null,
        chatId: data.chatId,
        sourceMessageId: data.sourceMessageId || null,
        status: 'TODO',
        priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        createdBy: data.createdBy || null,
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
  },

  async updateTask(id: string, data: UpdateTaskRequest) {
    const updateData: any = { ...data };
    delete updateData.assigneeIds;
    
    if (updateData.dueDate !== undefined) {
      updateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
    }

    return await prisma.$transaction(async (tx) => {
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
