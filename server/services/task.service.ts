import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { CreateTaskRequest, UpdateTaskRequest } from '../../src/lib/types';
import { enqueue, taskPayload, notificationView } from './delivery.service';

const include = { assignees: { include: { contact: true } }, chat: true, sourceMessage: true };
async function attachNotification<T extends { id: string }>(task: T) {
  const job = await prisma.outgoingJob.findFirst({ where: { taskId: task.id }, orderBy: { sequence: 'desc' } });
  return { ...task, notification: job ? notificationView(job) : null };
}
async function queueTask(tx: Prisma.TransactionClient, task: any, kind: 'TASK_CREATED' | 'TASK_COMPLETED') {
  await enqueue(tx, { operationKey: `${kind}:${task.id}:${kind === 'TASK_COMPLETED' ? task.completedAt.toISOString() : ''}`, chatId: task.chatId, taskId: task.id, kind, payload: taskPayload(task, kind) });
}
function validate(data: any, creating = false) {
  if (creating && (typeof data.title !== 'string' || !data.title.trim() || typeof data.chatId !== 'string')) throw new Error('Başlık ve sohbet zorunludur');
  if (data.title !== undefined && (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 500)) throw new Error('Geçersiz başlık');
  if (data.status !== undefined && !['TODO', 'IN_PROGRESS', 'DONE'].includes(data.status)) throw new Error('Geçersiz durum');
  if (data.priority !== undefined && !['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(data.priority)) throw new Error('Geçersiz öncelik');
  if (data.dueDate && !Number.isFinite(new Date(data.dueDate).getTime())) throw new Error('Geçersiz tarih');
  if (data.assigneeIds !== undefined && (!Array.isArray(data.assigneeIds) || data.assigneeIds.some((id: any) => typeof id !== 'string'))) throw new Error('Geçersiz görevliler');
  if (data.clientRequestId !== undefined && (typeof data.clientRequestId !== 'string' || !data.clientRequestId || data.clientRequestId.length > 128)) throw new Error('Geçersiz işlem kimliği');
}
export const taskService = {
  async createTask(data: CreateTaskRequest & { createdBy?: string; notifyOnCreate?: boolean; clientRequestId?: string }) {
    validate(data, true);
    const requestKey = `${data.createdBy}:${data.clientRequestId || randomUUID()}`;
    const task = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestKey}, 0))`;
      const existing = await tx.task.findUnique({ where: { requestKey }, include });
      if (existing) return existing;
      const created = await tx.task.create({ data: {
        requestKey, title: data.title.trim(), description: data.description || null, chatId: data.chatId,
        sourceMessageId: data.sourceMessageId || null, priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate ? new Date(data.dueDate) : null, createdBy: data.createdBy || null,
        notifyOnCreate: data.notifyOnCreate !== false,
        assignees: { create: [...new Set(data.assigneeIds || [])].map(contactId => ({ contactId })) },
      }, include });
      if (created.notifyOnCreate) await queueTask(tx, created, 'TASK_CREATED');
      return created;
    });
    return attachNotification(task);
  },
  async updateTask(id: string, data: UpdateTaskRequest) {
    validate(data);
    const task = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${id} FOR UPDATE`;
      const previous = await tx.task.findUniqueOrThrow({ where: { id } });
      if (data.assigneeIds !== undefined) {
        await tx.taskAssignee.deleteMany({ where: { taskId: id } });
        await tx.taskAssignee.createMany({ data: [...new Set(data.assigneeIds)].map(contactId => ({ taskId: id, contactId })) });
      }
      const updated = await tx.task.update({ where: { id }, data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(data.status === 'DONE' && previous.status !== 'DONE' ? { completedAt: new Date() } : {}),
        ...(data.status && data.status !== 'DONE' && previous.status === 'DONE' ? { completedAt: null, completionNote: null, completedBy: null } : {}),
      }, include });
      if (data.status === 'DONE' && previous.status !== 'DONE') await queueTask(tx, updated, 'TASK_COMPLETED');
      return updated;
    });
    return attachNotification(task);
  },
  async closeTask(id: string, data: { completionNote: string; completedBy?: string }) {
    const task = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${id} FOR UPDATE`;
      const previous = await tx.task.findUniqueOrThrow({ where: { id }, include });
      if (previous.status === 'DONE') return previous;
      const updated = await tx.task.update({ where: { id }, data: { status: 'DONE', completionNote: data.completionNote, completedBy: data.completedBy || null, completedAt: new Date() }, include });
      await queueTask(tx, updated, 'TASK_COMPLETED');
      return updated;
    });
    return attachNotification(task);
  },
  async deleteTask(id: string) {
    return prisma.$transaction(async tx => {
      await tx.outgoingJob.updateMany({ where: { taskId: id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      return tx.task.delete({ where: { id } });
    });
  },
  async getTasksByChat(chatId: string) {
    return Promise.all((await prisma.task.findMany({ where: { chatId }, include, orderBy: { createdAt: 'desc' } })).map(attachNotification));
  },
  async getKanbanData(filters: any = {}) {
    const where: Prisma.TaskWhereInput = {};
    if (filters.chatId) where.chatId = filters.chatId;
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.assigneeId) where.assignees = { some: { contactId: filters.assigneeId } };
    const tasks = await Promise.all((await prisma.task.findMany({ where, include, orderBy: { createdAt: 'desc' } })).map(attachNotification));
    return { tasks, stats: { total: tasks.length, todo: tasks.filter(t => t.status === 'TODO').length, inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length, done: tasks.filter(t => t.status === 'DONE').length, overdue: tasks.filter(t => t.dueDate && t.dueDate < new Date() && t.status !== 'DONE').length } };
  },
  async getOverdueTasks() {
    return prisma.task.findMany({ where: { dueDate: { lt: new Date() }, status: { not: 'DONE' } }, include });
  },
  async getTaskById(id: string) {
    const task = await prisma.task.findUnique({ where: { id }, include });
    return task ? attachNotification(task) : null;
  },
};
