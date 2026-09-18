import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(body: Buffer, signature: unknown, algorithm: unknown, key: string): boolean {
  if (!key || algorithm !== 'sha512' || typeof signature !== 'string' || !/^[a-f\d]{128}$/i.test(signature)) return false;
  return timingSafeEqual(createHmac('sha512', key).update(body).digest(), Buffer.from(signature, 'hex'));
}

export function eventKey(event: any): string {
  if (event.event?.startsWith('call.')) return event.session+':call:'+event.payload.id+':'+event.event;
  if (event.event === 'message' || event.event === 'message.any') {
    if (typeof event.payload?.id !== 'string' || !event.payload.id) throw new Error('Message ID required');
    return `${event.session}:message:${event.payload.id}`;
  }
  return `${event.session}:event:${event.id || createHash('sha256').update(JSON.stringify(event)).digest('hex')}`;
}

export function parseMessage(payload: any) {
  const chatId = payload.fromMe ? (payload.to || payload.from) : payload.from;
  if (typeof payload.id !== 'string' || typeof chatId !== 'string' || !chatId.includes('@')) throw new Error('Invalid message');
  const isGroup = chatId.endsWith('@g.us');
  const senderId = payload.fromMe ? 'me' : (isGroup ? payload.participant || payload.author || payload.from : payload.from);
  const mime = payload.media?.mimetype || '';
  const quote = payload.replyTo || payload.quotedMsg || payload._data?.quotedMsg;
  const ts = Number(payload.timestamp || Date.now());
  const timestamp = new Date(ts > 1e11 ? ts : ts * 1000);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Invalid message timestamp');
  const senderName = payload.notifyName || payload._data?.notifyName || payload._data?.pushName || payload._data?.pushname;
  const link=payload._data?.message?.extendedTextMessage || payload._data?.extendedTextMessage;
  let preview:any=undefined;
  if(link?.title||link?.jpegThumbnail) {
    const bytes=link.jpegThumbnail;
    const thumbnail=typeof bytes==='string'?bytes:Array.isArray(bytes?.data)&&bytes.data.length<=75000?Buffer.from(bytes.data).toString('base64'):null;
    const url=link.canonicalUrl || payload.body?.match(/https?:\/\/[^\s]+/)?.[0];
    if(typeof url==='string'&&/^https?:\/\//.test(url)) preview={url,title:String(link.title||'').slice(0,500),description:String(link.description||'').slice(0,2000),thumbnail:thumbnail&&thumbnail.length<=100000?thumbnail:null};
  }
  let text=typeof payload.body==='string'?payload.body:'';
  if(!text&&payload.location) text='Konum: https://maps.google.com/?q='+encodeURIComponent(payload.location.latitude+','+payload.location.longitude);
  if(!text&&Array.isArray(payload.vCards)&&payload.vCards.length)text=payload.vCards.join('\n\n').slice(0,20000);
  return {
    preview,
    id: payload.id, chatId, isGroup, senderId,
    senderName: typeof senderName === 'string' ? senderName : undefined,
    senderPhone: senderId === 'me' ? '' : senderId.split('@')[0],
    chatName: !payload.fromMe && !isGroup ? senderName : undefined,
    body: text,
    quotedText: quote?.body || quote?.caption || null,
    quotedSender: quote?.participant || quote?.author || null,
    messageType: payload.hasMedia || payload.media ? (mime.startsWith('image/') ? 'IMAGE' : mime.startsWith('video/') ? 'VIDEO' : mime.startsWith('audio/') ? 'AUDIO' : 'DOCUMENT') : 'TEXT',
    mediaUrl: payload.media?.url || null, mediaName: payload.media?.filename || null, mediaMime: mime || null,
    isFromMe: !!payload.fromMe, timestamp,
    ack: Number.isInteger(payload.ack) && payload.ack >= -1 && payload.ack <= 4 ? payload.ack : undefined,
  };
}

export function istanbulDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function reminderDue(date = new Date()): boolean {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(date)) >= 9;
}
export function retryDelay(attempt: number): number { return Math.min(900_000, 5000 * 2 ** Math.max(0, attempt - 1)); }
export function classifySendError(error: any): 'RETRY' | 'FAILED' | 'UNKNOWN' {
  if (error?.status === 429) return 'RETRY';
  if (error?.status >= 400 && error.status < 500) return 'FAILED';
  if (['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code)) return 'RETRY';
  return 'UNKNOWN';
}
