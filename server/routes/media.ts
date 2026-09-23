import { Response, Router } from 'express';
import { prisma } from '../lib/prisma';
import { verifyMediaToken } from '../lib/media';
import { mediaService } from '../services/media.service';
import { runWithTenant, tenantForUser } from '../lib/tenant';

const router = Router();

router.get('/:id', async (req, res) => {
  const id = req.params.id as string;
  let tenantId: string | null = null;
  try {
    if (typeof req.query.token === 'string') tenantId = verifyMediaToken(req.query.token, id);
  } catch {
    return res.sendStatus(401);
  }
  // The token names the tenant, so the message is looked up only in that tenant's schema.
  const tenant = tenantId ? tenantForUser(tenantId) : undefined;
  if (!tenant) return res.sendStatus(401);
  return runWithTenant(tenant, () => serve(id, res));
});

async function serve(id: string, res: Response) {
  try {
    const message = await prisma.message.findUnique({ where: { id } });
    if (!message || message.revoked) return res.sendStatus(404);
    const path = await mediaService.downloadMedia(id);
    const allowedMime = /^(image\/(jpeg|png|gif|webp)|video\/mp4|audio\/(mpeg|ogg|mp4|wav|webm))$/i;
    const latest = await prisma.message.findUniqueOrThrow({ where: { id } });
    const mime = latest.mediaMime || 'application/octet-stream';
    res.setHeader('Content-Type', allowedMime.test(mime) ? mime : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (!allowedMime.test(mime)) res.attachment(message.mediaName || 'attachment');
    res.sendFile(path, (error?: Error) => {
      if (error && !res.headersSent) res.sendStatus(502);
    });
  } catch (err: any) {
    console.warn(`[MediaRoute] Failed to serve media ${id}:`, err?.message || err);
    res.status(502).json({ error: 'Medya şu anda alınamadı; yeniden deneyin.' });
  }
}

export default router;
