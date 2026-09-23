import jwt from 'jsonwebtoken';
import { currentTenant } from './tenant';

export function mediaView<T extends { id: string; messageType: string; mediaUrl?: string | null }>(message: T): T & {mediaUrl?:string|null} {
  if (!message.mediaUrl && !['IMAGE','VIDEO','AUDIO','DOCUMENT','STICKER'].includes(message.messageType)) return message;
  const token = jwt.sign({ purpose: 'message-media', messageId: message.id, tenant: currentTenant().id, exp: (Math.floor(Date.now()/3600000)+2)*3600 }, process.env.JWT_SECRET!, { noTimestamp: true });
  return { ...message, mediaUrl: `/api/media/${encodeURIComponent(message.id)}?token=${encodeURIComponent(token)}` };
}
/** Returns the tenant the token was issued for, or null when it does not grant this message. */
export function verifyMediaToken(token: string, id: string): string | null {
  const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  return decoded.purpose === 'message-media' && decoded.messageId === id && typeof decoded.tenant === 'string' ? decoded.tenant : null;
}
// Provider URLs can contain localhost or container names. Only the documented
// file path is used; the request always goes to the configured WAHA server.
export function providerFileUrl(value: string, base = process.env.WAHA_API_URL || 'http://localhost:3000') {
  const url = new URL(value, base);
  const path = decodeURIComponent(url.pathname);
  if (!path.startsWith('/api/files/') || path.includes('..') || /[\\\x00-\x1f]/.test(path)) throw new Error('Invalid provider media path');
  return new URL(url.pathname + url.search, base).href;
}
