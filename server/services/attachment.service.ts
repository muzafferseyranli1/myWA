import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { currentTenant } from '../lib/tenant';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_TASK = 5;
/** WhatsApp shows long captions poorly, so longer notices go as their own message. */
export const MAX_CAPTION_LENGTH = 900;

// Lives inside the persistent media volume; the media cache only counts its own hash-named files.
const root = () => resolve(process.env.MEDIA_DIR || './data/media', 'task-attachments');
const fileOf = (id: string) => join(root(), currentTenant().id, id);

/** Detects the image type from its first bytes; the client-supplied type is never trusted. */
export function detectImageType(bytes: Buffer): { mime: string; ext: string } | null {
  if (bytes.length > 12 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/**
 * Which images ride along as the caption's photo and which follow as their own
 * messages: the notice text becomes the first image's caption unless it is long.
 */
export function planImages(imageIds: string[], textLength: number) {
  const captioned = imageIds.length > 0 && textLength <= MAX_CAPTION_LENGTH;
  return { captioned: captioned ? imageIds[0] : undefined, rest: captioned ? imageIds.slice(1) : imageIds };
}

export const attachmentService = {
  async save(bytes: Buffer, originalName: string) {
    if (bytes.length > MAX_ATTACHMENT_BYTES) throw new Error('Görsel en fazla 10 MB olabilir');
    const type = detectImageType(bytes);
    if (!type) throw new Error('Yalnızca JPEG, PNG veya WebP görsel yüklenebilir');
    const fileName = (originalName || 'gorsel').replace(/[^\w.\- ]+/g, '_').slice(0, 100).replace(/\.[A-Za-z0-9]+$/, '') + '.' + type.ext;
    const row = await prisma.taskAttachment.create({ data: { fileName, mimeType: type.mime, size: bytes.length } });
    await mkdir(join(root(), currentTenant().id), { recursive: true });
    await writeFile(fileOf(row.id), bytes);
    return row;
  },
  /** Attaches uploaded images to a task. Only unattached uploads can be claimed. */
  async link(tx: Prisma.TransactionClient, taskId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return;
    if (unique.length > MAX_ATTACHMENTS_PER_TASK) throw new Error(`En fazla ${MAX_ATTACHMENTS_PER_TASK} görsel eklenebilir`);
    const claimed = await tx.taskAttachment.updateMany({ where: { id: { in: unique }, taskId: null }, data: { taskId } });
    if (claimed.count !== unique.length) throw new Error('Görsel bulunamadı; yeniden yükleyin');
  },
  async read(id: string): Promise<Buffer | null> {
    return readFile(fileOf(id)).catch(() => null);
  },
  async removeFiles(ids: string[]) {
    await Promise.all(ids.map(id => unlink(fileOf(id)).catch(() => {})));
  },
  /** Deletes an upload that was never attached to a task. */
  async discard(id: string) {
    const result = await prisma.taskAttachment.deleteMany({ where: { id, taskId: null } });
    if (result.count) await this.removeFiles([id]);
    return result.count > 0;
  },
  /** Uploads that were never attached (the form was abandoned) go after a day. */
  async cleanupOrphans() {
    const stale = await prisma.taskAttachment.findMany({ where: { taskId: null, createdAt: { lt: new Date(Date.now() - 86_400_000) } }, select: { id: true } });
    if (!stale.length) return;
    await prisma.taskAttachment.deleteMany({ where: { id: { in: stale.map(s => s.id) } } });
    await this.removeFiles(stale.map(s => s.id));
  },
};
