import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { SharedBoard } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { listTenants, runWithTenant, systemDb, Tenant, tenantForUser } from '../lib/tenant';
import { taskService } from './task.service';
import { enqueue } from './delivery.service';
import { contactResolver } from './contact-resolver.service';
import { PRIORITY_TR, STATUS_TR } from '../lib/labels';

/**
 * Shared group boards: the one deliberate exception to tenant isolation. A
 * board exposes the tasks of a single WhatsApp group, from every user's schema,
 * to anyone who has the board's password. Nothing outside that group is read.
 */

export const BOARD_NOTICE_DELAY_MS = 2 * 60 * 1000;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;

const include = { assignees: { include: { contact: true } } };
const nameOf = (c: any) => c?.displayName || c?.pushName || contactResolver.getDisplayNameSync(c?.id) || c?.phoneNumber || 'Kişi';

export function boardSlug(title: string) {
  const base = title.toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' } as Record<string, string>)[c])
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'pano';
  // The random part keeps board addresses from being guessed.
  return `${base}-${randomBytes(4).toString('hex')}`;
}

/** Tasks are addressed as "<tenant id>.<task id>" because they live in different schemas. */
const ref = (tenant: Tenant, taskId: string) => `${tenant.id}.${taskId}`;
function parseRef(value: string) {
  const [tenantId, taskId] = value.split('.');
  const tenant = tenantId ? tenantForUser(tenantId) : undefined;
  if (!tenant || !taskId) throw new Error('Görev bulunamadı');
  return { tenant, taskId };
}

async function ownerNames() {
  const users = await systemDb().user.findMany({ select: { id: true, displayName: true } });
  return new Map(users.map(u => [u.id, u.displayName]));
}

function row(tenant: Tenant, owner: string, t: any) {
  return {
    ref: ref(tenant, t.id),
    owner,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: t.status,
    dueDate: t.dueDate,
    assignees: t.assignees.map((a: any) => ({ contactId: a.contactId, name: nameOf(a.contact), completedAt: a.completedAt, committedDueDate: a.committedDueDate })),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    link: `/t/${t.id}`,
  };
}

export const boardService = {
  async listTasks(board: SharedBoard) {
    const owners = await ownerNames();
    const rows: ReturnType<typeof row>[] = [];
    for (const tenant of listTenants()) {
      await runWithTenant(tenant, async () => {
        const tasks = await prisma.task.findMany({ where: { chatId: board.chatId }, include, orderBy: { createdAt: 'desc' } });
        for (const t of tasks) rows.push(row(tenant, owners.get(tenant.id) || tenant.username, t));
      });
    }
    return rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  },

  /** Group members from every schema that has the group, for the assignee picker. */
  async members(board: SharedBoard) {
    const members = new Map<string, { contactId: string; name: string }>();
    for (const tenant of listTenants()) {
      await runWithTenant(tenant, async () => {
        const rows = await prisma.groupParticipant.findMany({ where: { chatId: board.chatId }, include: { contact: true } });
        for (const p of rows) if (!members.has(p.contactId)) members.set(p.contactId, { contactId: p.contactId, name: nameOf(p.contact) });
      });
    }
    return [...members.values()].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  },

  async createTask(board: SharedBoard, by: string, data: { title: string; description?: string; assigneeIds?: string[]; priority?: string; dueDate?: string | null }) {
    const owner = tenantForUser(board.ownerId);
    if (!owner) throw new Error('Pano sahibi hesabı etkin değil');
    const assigneeIds = await this.ensureContacts(owner, data.assigneeIds || []);
    const task = await runWithTenant(owner, () => taskService.createTask({
      chatId: board.chatId, title: data.title, description: data.description || undefined,
      priority: (PRIORITIES as readonly string[]).includes(data.priority || '') ? data.priority as any : 'MEDIUM',
      dueDate: data.dueDate || undefined, assigneeIds, createdBy: owner.id,
      notifyOnCreate: true, notifyAssigneesDirectly: true, announceBy: by,
    }));
    const owners = await ownerNames();
    return runWithTenant(owner, () => row(owner, owners.get(owner.id) || owner.username, task));
  },

  /**
   * Edits a task of the board's group in whichever schema holds it. Changes
   * are announced in the group through a notice that waits two minutes and
   * absorbs further edits, so a burst of cell edits becomes one message.
   */
  async updateTask(board: SharedBoard, by: string, taskRef: string, data: { title?: string; assigneeIds?: string[]; priority?: string; dueDate?: string | null; status?: string }) {
    const { tenant, taskId } = parseRef(taskRef);
    if (data.priority !== undefined && !(PRIORITIES as readonly string[]).includes(data.priority)) throw new Error('Geçersiz öncelik');
    if (data.status !== undefined && !(STATUSES as readonly string[]).includes(data.status)) throw new Error('Geçersiz durum');
    return runWithTenant(tenant, async () => {
      const before = await prisma.task.findUnique({ where: { id: taskId }, include });
      if (!before || before.chatId !== board.chatId) throw new Error('Görev bulunamadı');
      const assigneeIds = data.assigneeIds ? await this.ensureContacts(tenant, data.assigneeIds) : undefined;
      const updated = await taskService.updateTask(taskId, {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.priority !== undefined ? { priority: data.priority as any } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
        ...(data.status !== undefined ? { status: data.status as any, completedBy: by, completionNote: `Panodan ${by} tamamladı`, reactivatedBy: by, reactivateReason: 'Panodan yeniden açıldı' } : {}),
        ...(assigneeIds ? { assigneeIds } : {}),
      });
      await this.queueNotice(before, by);
      const owners = await ownerNames();
      return row(tenant, owners.get(tenant.id) || tenant.username, updated);
    });
  },

  /** Contacts must exist in the schema that holds the task before they can be assigned. */
  async ensureContacts(tenant: Tenant, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return unique;
    const known = new Map<string, any>();
    for (const t of listTenants()) {
      await runWithTenant(t, async () => {
        for (const c of await prisma.contact.findMany({ where: { id: { in: unique } } })) if (!known.has(c.id)) known.set(c.id, c);
      });
    }
    if (unique.some(id => !known.has(id))) throw new Error('Görevli bu grupta bulunamadı');
    await runWithTenant(tenant, async () => {
      for (const c of known.values()) {
        await prisma.contact.upsert({ where: { id: c.id }, update: {}, create: { id: c.id, phoneNumber: c.phoneNumber, pushName: c.pushName, displayName: c.displayName } });
      }
    });
    return unique;
  },

  /**
   * One pending group notice per task. The first edit stores what the task
   * looked like; when the notice is sent it lists only what differs now.
   */
  async queueNotice(before: any, by: string) {
    const pending = await prisma.outgoingJob.findFirst({ where: { taskId: before.id, kind: 'TASK_BOARD_UPDATE', status: 'PENDING' } });
    if (pending) {
      const payload = pending.payload as any;
      const editors = [...new Set([...(payload.by || []), by])];
      const changed = await prisma.outgoingJob.updateMany({ where: { id: pending.id, status: 'PENDING', lockToken: null }, data: { payload: { ...payload, by: editors } } });
      if (changed.count) return;
    }
    const snapshot = {
      title: before.title, priority: before.priority, status: before.status,
      dueDate: before.dueDate ? before.dueDate.toISOString() : null,
      assignees: before.assignees.map((a: any) => ({ contactId: a.contactId, name: nameOf(a.contact) })),
    };
    const job = await enqueue(prisma, {
      operationKey: `TASK_BOARD_UPDATE:${before.id}:${Date.now()}`, chatId: before.chatId, taskId: before.id,
      kind: 'TASK_BOARD_UPDATE', payload: { before: snapshot, by: [by] },
    });
    await prisma.outgoingJob.updateMany({ where: { id: job.id, status: 'PENDING' }, data: { nextAttemptAt: new Date(Math.max(job.nextAttemptAt.getTime(), Date.now() + BOARD_NOTICE_DELAY_MS)) } });
  },

  async exportXlsx(board: SharedBoard) {
    const rows = await this.listTasks(board);
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Görevler', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'Görev', key: 'title', width: 50 },
      { header: 'Açıklama', key: 'description', width: 40 },
      { header: 'Görevliler', key: 'assignees', width: 36 },
      { header: 'Öncelik', key: 'priority', width: 10 },
      { header: 'Bitiş', key: 'dueDate', width: 12 },
      { header: 'Durum', key: 'status', width: 14 },
      { header: 'Oluşturan', key: 'owner', width: 18 },
      { header: 'Oluşturulma', key: 'createdAt', width: 18 },
      { header: 'Bağlantı', key: 'link', width: 40 },
    ];
    const base = process.env.APP_URL || '';
    for (const r of rows) {
      sheet.addRow({
        ...r,
        assignees: r.assignees.map((a: { name: string; completedAt: Date | null }) => a.name + (a.completedAt ? ' ✓' : '')).join(', '),
        priority: PRIORITY_TR[r.priority] || r.priority,
        status: STATUS_TR[r.status] || r.status,
        dueDate: r.dueDate ? new Date(r.dueDate) : null,
        createdAt: new Date(r.createdAt),
        link: { text: 'Aç', hyperlink: base + r.link },
      });
    }
    sheet.getColumn('dueDate').numFmt = 'dd.mm.yyyy';
    sheet.getColumn('createdAt').numFmt = 'dd.mm.yyyy hh:mm';
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: 'A1', to: 'I1' };
    return Buffer.from(await book.xlsx.writeBuffer());
  },
};
