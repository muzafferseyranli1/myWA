import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { CreateTaskRequest, UpdateTaskRequest } from '../../src/lib/types';
import { enqueue, taskPayload, notificationView, pendingAssignees } from './delivery.service';
import { contactResolver } from './contact-resolver.service';
import { attachmentService, planImages } from './attachment.service';

const include = { assignees: { include: { contact: true } }, chat: true, sourceMessage: true, attachments: { orderBy: { createdAt: 'asc' as const } } };
/**
 * Queues a "new task" notice for one chat. The first picture carries the text as
 * its caption; the others (or all of them, for a long text) follow as their own
 * messages, one job each so a retry never repeats a picture.
 */
async function enqueueWithImages(tx: Prisma.TransactionClient, task: any, args: { operationKey: string; chatId: string; kind: string; payload: any }) {
  const { captioned, rest } = planImages((task.attachments || []).map((a: any) => a.id), String(args.payload.text || '').length);
  await enqueue(tx, { ...args, taskId: task.id, payload: { ...args.payload, ...(captioned ? { imageId: captioned } : {}) } });
  for (const imageId of rest) {
    await enqueue(tx, { operationKey: `TASK_IMAGE:${task.id}:${args.chatId}:${imageId}`, chatId: args.chatId, taskId: task.id, kind: 'TASK_IMAGE', payload: { imageId } });
  }
}
async function attachNotification<T extends { id: string }>(task: T) {
  const job = await prisma.outgoingJob.findFirst({ where: { taskId: task.id }, orderBy: { sequence: 'desc' } });
  return { ...task, notification: job ? notificationView(job) : null };
}
async function queueTask(
  tx: Prisma.TransactionClient,
  task: any,
  kind: 'TASK_CREATED' | 'TASK_COMPLETED' | 'TASK_REACTIVATED',
  extra?: { reason?: string; by?: string; completedAssignee?: string; assigneeId?: string }
) {
  const timestamp = kind === 'TASK_COMPLETED'
    ? (task.completedAt ? new Date(task.completedAt).toISOString() : new Date().toISOString())
    : kind === 'TASK_REACTIVATED'
    ? new Date().toISOString()
    : '';
  // A partial completion is one notification per assignee close, not per task.
  const operationKey = extra?.completedAssignee
    ? `TASK_PARTIAL:${task.id}:${extra.assigneeId}:${new Date().toISOString()}`
    : timestamp ? `${kind}:${task.id}:${timestamp}` : `${kind}:${task.id}`;
  const payload = taskPayload(task, kind, extra);
  if (kind === 'TASK_CREATED') await enqueueWithImages(tx, task, { operationKey, chatId: task.chatId, kind, payload });
  else await enqueue(tx, { operationKey, chatId: task.chatId, taskId: task.id, kind, payload });

  // If notifyAssigneesDirectly is true and this is a TASK_CREATED notification,
  // also send a personalized direct message (DM) to each assigned person.
  if (kind === 'TASK_CREATED' && task.notifyAssigneesDirectly && Array.isArray(task.assignees)) {
    for (const a of task.assignees) {
      const dmChatId = contactResolver.resolveDirectChatId(a.contact);
      if (dmChatId && dmChatId !== task.chatId) {
        const dmOpKey = `TASK_CREATED_DM:${task.id}:${dmChatId}`;
        await enqueueWithImages(tx, task, {
          operationKey: dmOpKey,
          chatId: dmChatId,
          kind: 'TASK_CREATED_DM',
          payload: taskPayload(task, 'TASK_CREATED_DM', {
            groupName: task.chat?.name || undefined,
            recipientName: a.contact?.displayName || a.contact?.pushName || undefined,
            assigneeId: a.id,
          }),
        });
      }
    }
  }
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
  async createTask(data: CreateTaskRequest & { createdBy?: string; notifyOnCreate?: boolean; notifyAssigneesDirectly?: boolean; clientRequestId?: string; attachmentIds?: string[] }) {
    validate(data, true);
    const requestKey = `${data.createdBy}:${data.clientRequestId || randomUUID()}`;
    const task = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestKey}, 0))`;
      const existing = await tx.task.findUnique({ where: { requestKey }, include });
      if (existing) return existing;
      const cleanTitle = contactResolver.formatMentionsToNamesSync(data.title.trim());
      const cleanDesc = data.description ? contactResolver.formatMentionsToNamesSync(data.description) : null;
      const created = await tx.task.create({ data: {
        requestKey, title: cleanTitle, description: cleanDesc, chatId: data.chatId,
        sourceMessageId: data.sourceMessageId || null, priority: data.priority || 'MEDIUM',
        dueDate: data.dueDate ? new Date(data.dueDate) : null, createdBy: data.createdBy || null,
        notifyOnCreate: data.notifyOnCreate !== false,
        notifyAssigneesDirectly: Boolean(data.notifyAssigneesDirectly),
        assignees: { create: [...new Set(data.assigneeIds || [])].map(contactId => ({ contactId })) },
      }, include });
      if (data.attachmentIds?.length) await attachmentService.link(tx, created.id, data.attachmentIds);
      const withFiles = data.attachmentIds?.length ? await tx.task.findUniqueOrThrow({ where: { id: created.id }, include }) : created;
      if (withFiles.notifyOnCreate) await queueTask(tx, withFiles, 'TASK_CREATED');
      return withFiles;
    });
    return attachNotification(task);
  },
  async updateTask(id: string, data: UpdateTaskRequest) {
    validate(data);
    const task = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${id} FOR UPDATE`;
      const previous = await tx.task.findUniqueOrThrow({ where: { id }, include });
      if (data.assigneeIds !== undefined) {
        // Keep each remaining assignee's own completion state.
        const ids = [...new Set(data.assigneeIds)];
        await tx.taskAssignee.deleteMany({ where: { taskId: id, contactId: { notIn: ids } } });
        await tx.taskAssignee.createMany({ data: ids.map(contactId => ({ taskId: id, contactId })), skipDuplicates: true });
      }

      const isCompleting = data.status === 'DONE' && previous.status !== 'DONE';
      const isReactivating = previous.status === 'DONE' && data.status && data.status !== 'DONE';

      if (isCompleting) {
        await tx.taskAssignee.updateMany({ where: { taskId: id, completedAt: null }, data: {
          completedAt: new Date(),
          completedBy: data.completedBy?.trim() || 'Yönetici',
          completionNote: data.completionNote?.trim() || 'Admin tarafından tamamlandı'
        } });
      } else if (isReactivating) {
        await tx.taskAssignee.updateMany({ where: { taskId: id }, data: { completedAt: null, completedBy: null, completionNote: null } });
      }

      const updated = await tx.task.update({ where: { id }, data: {
        ...(data.title !== undefined ? { title: contactResolver.formatMentionsToNamesSync(data.title.trim()) } : {}),
        ...(data.description !== undefined ? { description: data.description ? contactResolver.formatMentionsToNamesSync(data.description) : null } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate ? new Date(data.dueDate) : null } : {}),
        ...(data.notifyAssigneesDirectly !== undefined ? { notifyAssigneesDirectly: Boolean(data.notifyAssigneesDirectly) } : {}),
        ...(isCompleting ? {
          completedAt: new Date(),
          completionNote: data.completionNote?.trim() || 'Admin tarafından tamamlandı',
          completedBy: data.completedBy?.trim() || 'Yönetici'
        } : {}),
        ...(isReactivating ? {
          completedAt: null,
          completionNote: null,
          completedBy: null
        } : {}),
        ...(data.status === 'DONE' && !isCompleting && data.completionNote !== undefined ? {
          completionNote: data.completionNote ? data.completionNote.trim() : null
        } : {}),
      }, include });

      if (isCompleting) {
        await queueTask(tx, updated, 'TASK_COMPLETED');
      } else if (isReactivating) {
        await queueTask(tx, updated, 'TASK_REACTIVATED', {
          reason: data.reactivateReason?.trim() || 'Yeniden işleme alındı',
          by: data.reactivatedBy?.trim() || 'Yönetici'
        });
      }

      return updated;
    });
    return attachNotification(task);
  },
  /**
   * Closes the task for one assignee. With several assignees the task only
   * becomes DONE once every one of them has closed their own part.
   */
  async closeTask(id: string, data: { completionNote: string; completedBy?: string; assigneeId?: string }) {
    const task = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${id} FOR UPDATE`;
      const previous = await tx.task.findUniqueOrThrow({ where: { id }, include });
      if (previous.status === 'DONE') return previous;
      if (previous.assignees.length) {
        const pending = pendingAssignees(previous);
        const me = data.assigneeId ? previous.assignees.find(a => a.id === data.assigneeId) : pending.length === 1 ? pending[0] : undefined;
        if (!me) throw new Error('Görevi kapatan kişi seçilmelidir');
        if (me.completedAt) return previous;
        const name = me.contact?.displayName || me.contact?.pushName || contactResolver.getDisplayNameSync(me.contact?.id) || me.contact?.phoneNumber || 'Görevli';
        const closer = data.completedBy?.trim() || name;
        await tx.taskAssignee.update({ where: { id: me.id }, data: { completedAt: new Date(), completedBy: closer, completionNote: data.completionNote } });
        const refreshed = await tx.task.findUniqueOrThrow({ where: { id }, include });
        if (!pendingAssignees(refreshed).length) {
          const done = await tx.task.update({ where: { id }, data: { status: 'DONE', completionNote: data.completionNote, completedBy: closer, completedAt: new Date() }, include });
          await queueTask(tx, done, 'TASK_COMPLETED');
          return done;
        }
        await queueTask(tx, { ...refreshed, completionNote: data.completionNote }, 'TASK_COMPLETED', { completedAssignee: closer, assigneeId: me.id });
        return refreshed;
      }
      const updated = await tx.task.update({ where: { id }, data: { status: 'DONE', completionNote: data.completionNote, completedBy: data.completedBy || null, completedAt: new Date() }, include });
      await queueTask(tx, updated, 'TASK_COMPLETED');
      return updated;
    });
    return attachNotification(task);
  },
  async deleteTask(id: string) {
    const files = await prisma.taskAttachment.findMany({ where: { taskId: id }, select: { id: true } });
    const deleted = await prisma.$transaction(async tx => {
      await tx.outgoingJob.updateMany({ where: { taskId: id, status: 'PENDING' }, data: { status: 'CANCELLED' } });
      return tx.task.delete({ where: { id } });
    });
    await attachmentService.removeFiles(files.map(f => f.id));
    return deleted;
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
