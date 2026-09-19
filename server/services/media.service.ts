import { mkdir, stat, unlink, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { prisma } from '../lib/prisma';
import { providerFileUrl } from '../lib/media';
import { wahaService } from './waha.service';

const dir = resolve(process.env.MEDIA_DIR || './data/media');
const pending = new Map<string, Promise<string>>();
const MAX = Number(process.env.MEDIA_MAX_MB || 100) * 1024 * 1024;
const QUOTA = Number(process.env.MEDIA_QUOTA_MB || 10240) * 1024 * 1024;
let used = 0;
let reserved = 0;
let usage: Promise<void> | null = null;

async function reserve() {
  if (!usage) {
    usage = (async () => {
      await mkdir(dir, { recursive: true });
      for (const name of await readdir(dir)) {
        if (!/^[a-f0-9]{64}$/.test(name)) continue;
        used += (await stat(join(dir, name))).size;
      }
    })();
  }
  await usage;
  if (used + reserved + MAX > QUOTA) throw new Error('Media storage quota exceeded');
  reserved += MAX;
}

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export class MediaService {
  private static instance: MediaService;

  public static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  public getMediaDir(): string {
    return dir;
  }

  public async getLocalPath(id: string): Promise<string | null> {
    const dest = join(dir, createHash('sha256').update(id).digest('hex'));
    if (await exists(dest)) return dest;
    return null;
  }

  /**
   * Downloads media for a given message ID and saves it to the persistent media directory.
   * If already downloaded, returns existing file path immediately.
   */
  public async downloadMedia(id: string): Promise<string> {
    if (pending.has(id)) {
      return pending.get(id)!;
    }
    const promise = this._download(id).finally(() => {
      pending.delete(id);
    });
    pending.set(id, promise);
    return promise;
  }

  private async _download(id: string): Promise<string> {
    await mkdir(dir, { recursive: true });
    const dest = join(dir, createHash('sha256').update(id).digest('hex'));
    if (await exists(dest)) return dest;

    let message = await prisma.message.findUniqueOrThrow({ where: { id } });
    if (message.revoked) throw new Error('Revoked media');

    const headers = { 'X-Api-Key': process.env.WAHA_API_KEY || '' };
    let response: Response | null = null;

    if (message.mediaUrl) {
      try {
        response = await fetch(providerFileUrl(message.mediaUrl), {
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(15000)
        });
      } catch (err) {
        console.warn(`[MediaService] Direct fetch failed for ${id}:`, err);
      }
    }

    if (!response?.ok) {
      try {
        const restored = await wahaService.getMessage(message.chatId, id);
        if (!restored?.media?.url) {
          throw new Error(`Provider media unavailable: ${JSON.stringify(restored?.media || restored)}`);
        }
        const url = providerFileUrl(restored.media.url);
        message = await prisma.message.update({
          where: { id },
          data: {
            mediaUrl: restored.media.url,
            mediaMime: restored.media.mimetype || message.mediaMime,
            mediaName: restored.media.filename || message.mediaName
          }
        });
        response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(60000) });
      } catch (fallbackErr: any) {
        console.warn(`[MediaService] Fallback getMessage failed for ${id}:`, fallbackErr?.message || fallbackErr);
        throw fallbackErr;
      }
    }

    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > MAX) {
      throw new Error('Provider media unavailable or too large');
    }

    await reserve();
    const temp = `${dest}.${randomUUID()}.partial`;
    let size = 0;
    try {
      await pipeline(
        Readable.fromWeb(response.body as any),
        new Transform({
          transform(chunk, _encoding, next) {
            size += chunk.length;
            next(size > MAX ? new Error('Media size limit') : null, chunk);
          }
        }),
        createWriteStream(temp, { flags: 'wx' })
      );
      const { rename } = await import('node:fs/promises');
      await rename(temp, dest);
      used += size;
      return dest;
    } finally {
      reserved -= MAX;
      await unlink(temp).catch(() => {});
    }
  }
}

export const mediaService = MediaService.getInstance();
