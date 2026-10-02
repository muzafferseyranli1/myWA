import { RequestHandler, Router } from 'express';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { attachmentService, MAX_ATTACHMENT_BYTES } from '../services/attachment.service';
import { taskService } from '../services/task.service';
import { reminderService } from '../services/reminder.service';
import { broadcastTaskCreated, broadcastTaskUpdated, broadcastTaskDeleted } from '../sockets';
import { requireAuth } from '../middleware/auth';
import { listTenants, maybeTenant, runWithTenant, Tenant } from '../lib/tenant';

const router = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Task links (/t/:id) are opened without logging in, by people who received
 * them on WhatsApp. The task id is a random UUID, so it is unique across all
 * schemas; the owning tenant is the one whose schema contains it.
 */
async function tenantOfTask(taskId: string): Promise<Tenant | undefined> {
  if (!UUID.test(taskId)) return undefined;
  for (const tenant of listTenants()) {
    if (await tenant.db.task.findUnique({ where: { id: taskId }, select: { id: true } })) return tenant;
  }
  return undefined;
}
const publicTask = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  const tenant = await tenantOfTask(String(req.params.id)).catch(() => undefined);
  if (!tenant) return res.status(404).json({ error: 'Görev bulunamadı' });
  return runWithTenant(tenant, () => handler(req, res, next));
};

const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 3 } }).single('file');

// Images are uploaded first and attached to the task when it is created.
router.post('/attachments', requireAuth, (req, res) => {
  // multer finishes from stream events, outside the request's tenant context: carry it over.
  const tenant = maybeTenant();
  imageUpload(req, res, error => {
    if (error) return res.status(413).json({ error: 'Görsel yüklenemedi veya 10 MB sınırını aşıyor' });
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Görsel gerekli' });
    if (!tenant) return res.status(500).json({ error: 'Oturum bağlamı bulunamadı' });
    void runWithTenant(tenant, async () => {
    try {
      // Uploads that never became part of a task are capped so they cannot pile up.
      const waiting = await prisma.taskAttachment.count({ where: { taskId: null, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
      if (waiting >= 30) return res.status(429).json({ error: 'Çok fazla bekleyen görsel var; önce görevleri kaydedin' });
      const row = await attachmentService.save(file.buffer, file.originalname);
      res.json({ id: row.id, fileName: row.fileName, mimeType: row.mimeType, size: row.size });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
    });
  });
});

router.delete('/attachments/:id', requireAuth, async (req, res) => {
  try {
    await attachmentService.discard(String(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/kanban', requireAuth, async (req, res) => {
  try {
    const { chatId, assigneeId, status, priority } = req.query;
    const data = await taskService.getKanbanData({
      chatId: typeof chatId === 'string' ? chatId : undefined,
      assigneeId: typeof assigneeId === 'string' ? assigneeId : undefined,
      status: typeof status === 'string' ? status : undefined,
      priority: typeof priority === 'string' ? priority : undefined
    });
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/overdue', requireAuth, async (req, res) => {
  try {
    const tasks = await taskService.getOverdueTasks();
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireAuth, async (req: any, res) => {
  try {
    const task = await taskService.createTask({ ...req.body, createdBy: req.user?.id });
    broadcastTaskCreated(task);
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', requireAuth, async (req: any, res) => {
  try {
    const taskId = String(req.params.id);
    const actor = req.user?.displayName || req.user?.email || 'Yönetici';
    const task = await taskService.updateTask(taskId, {
      ...req.body,
      completedBy: req.body.completedBy || actor,
      reactivatedBy: req.body.reactivatedBy || actor,
    });
    broadcastTaskUpdated(task);
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const taskId = String(req.params.id);
    await taskService.deleteTask(taskId);
    broadcastTaskDeleted(taskId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/remind', requireAuth, async (req, res) => {
  try {
    const { scope, chatId } = req.body;
    const result = await reminderService.sendBulkReminders(scope || 'all_pending', chatId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/remind', requireAuth, async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const result = await reminderService.sendReminder(taskId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/public', publicTask(async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Görev bulunamadı' });
    }
    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}));

// Opened from the task link by people who are not logged in, like the task page itself.
router.get('/:id/attachments/:attId', publicTask(async (req, res) => {
  try {
    const row = await prisma.taskAttachment.findFirst({ where: { id: String(req.params.attId), taskId: String(req.params.id) } });
    const bytes = row ? await attachmentService.read(row.id) : null;
    if (!row || !bytes) return res.status(404).json({ error: 'Görsel bulunamadı' });
    res.setHeader('Content-Type', row.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(bytes);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}));

router.post('/:id/close', publicTask(async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const { completionNote, completedBy, assigneeId } = req.body;

    if (typeof completionNote !== 'string' || !completionNote.trim() || completionNote.length > 20000) {
      return res.status(400).json({ error: 'Görev bitirme notu zorunludur' });
    }

    const task = await taskService.closeTask(taskId, {
      completionNote: completionNote.trim(),
      completedBy: completedBy ? String(completedBy).trim() : undefined,
      assigneeId: typeof assigneeId === 'string' ? assigneeId : undefined
    });

    broadcastTaskUpdated(task);
    res.json({ success: true, task });
  } catch (error: any) {
    res.status(error.message === 'Görevi kapatan kişi seçilmelidir' ? 400 : 500).json({ error: error.message });
  }
}));

export default router;
