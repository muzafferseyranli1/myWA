import { RequestHandler, Router } from 'express';
import { taskService } from '../services/task.service';
import { reminderService } from '../services/reminder.service';
import { broadcastTaskCreated, broadcastTaskUpdated, broadcastTaskDeleted } from '../sockets';
import { requireAuth } from '../middleware/auth';
import { listTenants, runWithTenant, Tenant } from '../lib/tenant';

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

router.post('/:id/close', publicTask(async (req, res) => {
  try {
    const taskId = String(req.params.id);
    const { completionNote, completedBy } = req.body;

    if (typeof completionNote !== 'string' || !completionNote.trim() || completionNote.length > 20000) {
      return res.status(400).json({ error: 'Görev bitirme notu zorunludur' });
    }

    const task = await taskService.closeTask(taskId, {
      completionNote: completionNote.trim(),
      completedBy: completedBy ? String(completedBy).trim() : undefined
    });

    broadcastTaskUpdated(task);
    res.json({ success: true, task });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}));

export default router;
