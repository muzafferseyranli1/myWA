import { Router } from 'express';
import { wahaService } from '../services/waha.service';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { prisma } from '../lib/prisma';
const router = Router();
router.use(requireAuth);
router.get('/sync', async (_req, res) => {
  try { res.json(await prisma.syncState.findUnique({where:{session:process.env.WAHA_SESSION_NAME || 'default'}})); }
  catch { res.status(503).json({error:'Eşitleme durumu alınamadı.'}); }
});
router.post('/sync', requireAdmin, async (_req, res) => {
  try {
    await prisma.syncState.upsert({where:{session:process.env.WAHA_SESSION_NAME || 'default'},create:{session:process.env.WAHA_SESSION_NAME || 'default'},update:{completedUntil:0,roundUntil:null,offset:0,lastError:null}});
    res.json({success:true});
  } catch { res.status(503).json({error:'Eşitleme başlatılamadı.'}); }
});
router.get('/status', (req, res) => {
  const status = wahaService.getStatus();
  res.json({ ...status, qr: (req as any).user.role === 'ADMIN' ? status.qr : null });
});
router.post('/connect', requireAdmin, async (_req, res) => {
  try { await wahaService.startSession(); res.json({ success: true, ...wahaService.getStatus() }); }
  catch { res.status(502).json({ error: 'WAHA bağlantısı kurulamadı; yapılandırma ve erişimi kontrol edin.' }); }
});
router.post('/disconnect', requireAdmin, async (_req, res) => {
  try { await wahaService.stopSession(); res.json({ success: true, status: 'disconnected' }); }
  catch { res.status(502).json({ error: 'Durdurma tercihi kaydedildi; WAHA erişildiğinde uygulanacak.' }); }
});
export default router;
