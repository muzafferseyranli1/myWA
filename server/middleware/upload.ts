import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream';
import multer from 'multer';
import { Router } from 'express';
import { requireAuth } from './auth';
export async function createUploadRouter() {
  const dir = path.resolve(process.env.UPLOAD_DIR || 'public/uploads');
  const max = Number(process.env.MAX_FILE_SIZE || 50) * 1024 ** 2;
  const quota = Number(process.env.UPLOAD_QUOTA_MB || 5120) * 1024 ** 2;
  if (!(max > 0 && quota >= max)) throw new Error('Invalid upload limits');
  await mkdir(dir, { recursive: true });
  let used = 0;
  for (const name of await readdir(dir)) used += (await stat(path.join(dir, name))).size;
  let reserved = 0;
  const storage: multer.StorageEngine = {
    _handleFile(_req, file, cb) {
      if (used + reserved + max > quota) return cb(new Error('UPLOAD_QUOTA'));
      reserved += max;
      const filename = randomUUID();
      const target = path.join(dir, filename);
      let size = 0;
      file.stream.on('data', chunk => { size += chunk.length; });
      pipeline(file.stream, createWriteStream(target, { flags: 'wx' }), error => {
        reserved -= max;
        if (error) { void unlink(target).catch(() => {}); return cb(error); }
        used += size;
        cb(null, { path: target, filename, size });
      });
    },
    _removeFile(_req, file, cb) {
      unlink(file.path).then(() => { used = Math.max(0, used - file.size); cb(null); }, cb);
    },
  };
  const uploads = multer({ storage, limits: { fileSize: max, files: 1, fields: 5 } }).single('file');
  const rates = new Map<string, { start: number; count: number }>();
  const router = Router();
  router.post('/', requireAuth, (req, res) => {
    const now = Date.now();
    for (const [id, rate] of rates) if (now - rate.start >= 60000) rates.delete(id);
    const id = (req as any).user.id;
    const rate = rates.get(id) || { start: now, count: 0 };
    if (rate.count >= 10) return res.status(429).json({ error: 'Dakikada en fazla 10 yükleme yapabilirsiniz' });
    rate.count++; rates.set(id, rate);
    uploads(req, res, error => {
      if (error) return res.status(error.message === 'UPLOAD_QUOTA' ? 507 : 413).json({ error: error.message === 'UPLOAD_QUOTA' ? 'Yükleme kotası dolu' : 'Dosya yüklenemedi veya boyut sınırını aşıyor' });
      if (!req.file) return res.status(400).json({ error: 'Dosya gerekli' });
      res.json({ url: `/uploads/${req.file.filename}` });
    });
  });
  return { router, dir };
}
