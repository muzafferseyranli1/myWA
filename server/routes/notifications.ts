import { Router } from 'express';
import { DeliveryStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { events } from '../lib/events';
import { requireAuth } from '../middleware/auth';
import { notificationView } from '../services/delivery.service';
const router = Router();
router.use(requireAuth);
router.get('/metrics', async (_req, res) => {
  try {
    const [outgoing, incoming, oldest, scheduler] = await Promise.all([
      prisma.outgoingJob.groupBy({ by: ['status'], _count: true }),
      prisma.incomingEvent.groupBy({ by: ['status'], _count: true }),
      prisma.outgoingJob.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      prisma.schedulerRun.findFirst({ orderBy: { day: 'desc' } }),
    ]);
    res.json({ outgoing, incoming, oldestPendingAt: oldest?.createdAt || null, lastSchedulerDay: scheduler?.day || null });
  } catch { res.status(503).json({ error: 'Kuyruk ölçümleri okunamadı' }); }
});
router.get('/', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  if (status && !Object.values(DeliveryStatus).includes(status as DeliveryStatus)) return res.status(400).json({ error: 'Invalid status' });
  const page = Math.max(1, Math.min(100000, Math.floor(Number(req.query.page) || 1)));
  const limit = Math.max(1, Math.min(100, Math.floor(Number(req.query.limit) || 30)));
  const where = { ...(typeof req.query.taskId === 'string' ? { taskId: req.query.taskId } : {}), ...(status ? { status: status as DeliveryStatus } : {}) };
  try {
    const [jobs, total] = await Promise.all([prisma.outgoingJob.findMany({ where, orderBy: { sequence: 'desc' }, skip: (page - 1) * limit, take: limit }), prisma.outgoingJob.count({ where })]);
    res.json({ items: jobs.map(notificationView), total, page, totalPages: Math.ceil(total / limit) });
  } catch { res.status(503).json({ error: 'Bildirimler okunamadı' }); }
});
router.post('/:id/:action', async (req, res) => {
  if (!['retry', 'cancel'].includes(String(req.params.action))) return res.sendStatus(404);
  try {
    const result = await prisma.$transaction(async tx => {
      const id = String(req.params.id);
      await tx.$queryRaw`SELECT id FROM outgoing_jobs WHERE id = ${id} FOR UPDATE`;
      const job = await tx.outgoingJob.findUnique({ where: { id } });
      if (!job) return { code: 404, error: 'Bildirim bulunamadı' };
      if (!['FAILED', 'UNKNOWN'].includes(job.status)) return { code: 409, error: 'Yalnızca başarısız veya belirsiz bildirim değiştirilebilir' };
      if (job.status === 'UNKNOWN' && req.params.action === 'retry' && req.body.confirmUnknown !== true) return { code: 409, error: 'Mesaj gönderilmiş olabilir. Tekrar gönderim açık onay gerektirir.' };
      const updated = await tx.outgoingJob.update({ where: { id }, data: { status: req.params.action === 'retry' ? 'PENDING' : 'CANCELLED', attempts: 0, nextAttemptAt: new Date(), lastError: null, lockedUntil: null, lockToken: null } });
      return { job: updated };
    });
    if ('error' in result) return res.status(result.code!).json({ error: result.error });
    const view = notificationView(result.job);
    events.emit('notification_updated', view);
    res.json(view);
  } catch { res.status(503).json({ error: 'Bildirim güncellenemedi' }); }
});
export default router;
