import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { verifyMediaToken } from '../lib/media';
import { mediaService } from '../services/media.service';

const router = Router();

router.get('/:id', async (req, res) => {
  const id = req.params.id as string;
  try {
    if (typeof req.query.token !== 'string' || !verifyMediaToken(req.query.token, id)) return res.sendStatus(401);
  } catch {
    return res.sendStatus(401);
  }
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
    res.sendFile(path, error => {
      if (error && !res.headersSent) res.sendStatus(502);
    });
  } catch (err: any) {
    console.warn(`[MediaRoute] Failed to serve media ${id}:`, err?.message || err);
    res.status(502).json({ error: 'Medya şu anda alınamadı; yeniden deneyin.' });
  }
});

export default router;
