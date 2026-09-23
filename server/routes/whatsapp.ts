import { Router } from 'express';
import { wahaService } from '../services/waha.service';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { currentTenant } from '../lib/tenant';
const router = Router();
// Every user manages only their own WhatsApp session (their own tenant).
router.use(requireAuth);
router.get('/sync', async (_req, res) => {
  try { res.json(await prisma.syncState.findUnique({where:{session:currentTenant().session}})); }
  catch { res.status(503).json({error:'Eşitleme durumu alınamadı.'}); }
});
router.post('/sync', async (_req, res) => {
  try {
    const session = currentTenant().session;
    await prisma.syncState.upsert({where:{session},create:{session},update:{completedUntil:0,roundUntil:null,offset:0,lastError:null}});
    res.json({success:true});
  } catch { res.status(503).json({error:'Eşitleme başlatılamadı.'}); }
});
router.get('/status', (_req, res) => {
  res.json(wahaService.getStatus());
});
router.post('/connect', async (_req, res) => {
  try { await wahaService.startSession(); res.json({ success: true, ...wahaService.getStatus() }); }
  catch { res.status(502).json({ error: 'WAHA bağlantısı kurulamadı; yapılandırma ve erişimi kontrol edin.' }); }
});
router.post('/pairing-code', async (req, res) => {
  const phoneNumber = String(req.body?.phoneNumber || '').replace(/\D/g, '');
  if (!/^\d{10,15}$/.test(phoneNumber)) return res.status(400).json({ error: 'Telefon numarasını ülke koduyla girin (ör. 905xxxxxxxxx)' });
  if (wahaService.getStatus().status !== 'qr') return res.status(409).json({ error: 'Önce bağlantıyı başlatın; kod yalnızca QR beklenirken alınabilir' });
  try { res.json({ code: await wahaService.requestPairingCode(phoneNumber) }); }
  catch { res.status(502).json({ error: 'Eşleştirme kodu alınamadı; birkaç saniye sonra tekrar deneyin' }); }
});
router.post('/disconnect', async (_req, res) => {
  try { await wahaService.stopSession(); res.json({ success: true, status: 'disconnected' }); }
  catch { res.status(502).json({ error: 'Durdurma tercihi kaydedildi; WAHA erişildiğinde uygulanacak.' }); }
});
export default router;
