import { Router } from 'express';
import { mkdir, stat, unlink, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { prisma } from '../lib/prisma';
import { providerFileUrl, verifyMediaToken } from '../lib/media';
import { wahaService } from '../services/waha.service';
const router = Router();
const dir = resolve(process.env.MEDIA_DIR || './data/media');
const pending = new Map<string, Promise<string>>();
const MAX = Number(process.env.MEDIA_MAX_MB || 100) * 1024 * 1024;
let used=0,reserved=0;
const QUOTA=Number(process.env.MEDIA_QUOTA_MB || 10240)*1024*1024;
let usage:Promise<void>|null=null;
async function reserve(){
 if(!usage) usage=(async()=>{await mkdir(dir,{recursive:true});for(const name of await readdir(dir)){if(!/^[a-f0-9]{64}$/.test(name))continue;used+=(await stat(join(dir,name))).size;}})();
 await usage;
 if(used+reserved+MAX>QUOTA)throw new Error('Media storage quota exceeded');
 reserved+=MAX;
}
async function exists(path: string) { try { return (await stat(path)).isFile(); } catch { return false; } }
async function download(id: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  const dest = join(dir, createHash('sha256').update(id).digest('hex'));
  if (await exists(dest)) return dest;
  let message = await prisma.message.findUniqueOrThrow({ where: { id } });
  if (message.revoked) throw new Error('Revoked media');
  const headers = { 'X-Api-Key': process.env.WAHA_API_KEY || '' };
  let response: Response | null = null;
  if (message.mediaUrl) response = await fetch(providerFileUrl(message.mediaUrl), { headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response?.ok) {
    const restored = await wahaService.getMessage(message.chatId, id);
    if (!restored.media?.url) throw new Error('Provider media unavailable');
    const url = providerFileUrl(restored.media.url);
    message = await prisma.message.update({ where: { id }, data: { mediaUrl: restored.media.url, mediaMime: restored.media.mimetype || message.mediaMime, mediaName: restored.media.filename || message.mediaName } });
    response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(60000) });
  }
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX) throw new Error('Provider media unavailable or too large');
  await reserve();
  const temp = `${dest}.${randomUUID()}.partial`;
  let size = 0;
  try {
    await pipeline(Readable.fromWeb(response.body as any), new Transform({ transform(chunk, _encoding, next) { size += chunk.length; next(size > MAX ? new Error('Media size limit') : null, chunk); } }), createWriteStream(temp, { flags: 'wx' }));
    const { rename } = await import('node:fs/promises');
    await rename(temp, dest);
    used+=size;
    return dest;
  } finally { reserved-=MAX; await unlink(temp).catch(() => {}); }
}
router.get('/:id', async (req, res) => {
  const id = req.params.id as string;
  try { if (typeof req.query.token !== 'string' || !verifyMediaToken(req.query.token, id)) return res.sendStatus(401); }
  catch { return res.sendStatus(401); }
  try {
    const message = await prisma.message.findUnique({ where: { id } });
    if (!message || message.revoked) return res.sendStatus(404);
    if (!pending.has(id)) pending.set(id, download(id).finally(() => pending.delete(id)));
    const path = await pending.get(id)!;
    const allowedMime = /^(image\/(jpeg|png|gif|webp)|video\/mp4|audio\/(mpeg|ogg|mp4|wav|webm))$/i;
    const latest=await prisma.message.findUniqueOrThrow({where:{id}});
    const mime = latest.mediaMime || 'application/octet-stream';
    res.setHeader('Content-Type', allowedMime.test(mime) ? mime : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (!allowedMime.test(mime)) res.attachment(message.mediaName || 'attachment');
    res.sendFile(path, error => { if (error && !res.headersSent) res.sendStatus(502); });
  } catch { res.status(502).json({ error: 'Medya şu anda alınamadı; yeniden deneyin.' }); }
});
export default router;
