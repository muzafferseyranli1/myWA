import { randomUUID } from 'node:crypto';
import { Prisma, OutgoingJob } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { events } from '../lib/events';
import { wahaService } from './waha.service';
import { messageService } from './message.service';
import { contactResolver } from './contact-resolver.service';
import { urlShortenerService } from './url-shortener.service';
import { mediaService } from './media.service';
import { classifySendError, eventKey, istanbulDay, parseMessage, reminderDue, retryDelay } from '../lib/reliability';

type DB = Prisma.TransactionClient;
export const notificationView = (job: OutgoingJob) => ({
  id: job.id, taskId: job.taskId, chatId: job.chatId, kind: job.kind, status: job.status,
  attempts: job.attempts, lastError: job.lastError, createdAt: job.createdAt, updatedAt: job.updatedAt,
});
export async function enqueue(db: DB, data: { operationKey: string; chatId: string; taskId?: string; kind: string; payload: Prisma.InputJsonValue }) {
  const rows = await db.$queryRaw<{ id: string }[]>`INSERT INTO outgoing_jobs
    (id,operation_key,chat_id,task_id,kind,payload,updated_at)
    VALUES (${randomUUID()},${data.operationKey},${data.chatId},${data.taskId || null},${data.kind},${JSON.stringify(data.payload)}::jsonb,NOW())
    ON CONFLICT (operation_key) DO UPDATE SET operation_key = EXCLUDED.operation_key RETURNING id`;
  return db.outgoingJob.findUniqueOrThrow({ where: { id: rows[0].id } });
}
export function taskPayload(
  task: any,
  kind: 'TASK_CREATED' | 'TASK_COMPLETED' | 'TASK_REACTIVATED',
  extra?: { reason?: string; by?: string }
) {
  const mentions: string[] = [];
  const tags = task.assignees.map((a: any) => {
    const resolved = contactResolver.resolveAssigneeMention(a.contact);
    if (resolved.jid) mentions.push(resolved.jid);
    return resolved.tag;
  }).filter(Boolean).join(' ');
  const date = task.dueDate ? new Date(task.dueDate).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) : 'Belirtilmedi';
  const taskUrl = `${process.env.APP_URL || 'http://localhost:3000'}/t/${task.id}`;

  const cleanTitle = contactResolver.formatMentionsToNamesSync(task.title || '');
  const cleanDescription = task.description ? contactResolver.formatMentionsToNamesSync(task.description) : '';

  let text = '';
  if (kind === 'TASK_CREATED') {
    text = `📌 *Yeni Görev*\n\n*${cleanTitle}*\n`;
    if (cleanDescription) text += `${cleanDescription}\n`;
    text += `Öncelik: ${task.priority}\nBitiş: ${date}\nGörevliler: ${tags}\n`;
    // If sourceMessageId exists, native WhatsApp reply_to will be used.
    // Only append plain text if sourceMessageId is not present, but sourceMessage.body is.
    if (!task.sourceMessageId && task.sourceMessage?.body) {
      const cleanSource = contactResolver.formatMentionsToNamesSync(task.sourceMessage.body);
      text += `\nKaynak mesaj: ${cleanSource}\n`;
    }
    text += `\n🔗 Görevi incele: ${taskUrl}`;
    return { text, mentions: [...new Set(mentions)], url: taskUrl, replyTo: task.sourceMessageId || undefined };
  }

  if (kind === 'TASK_COMPLETED') {
    text = `✅ *Görev Tamamlandı!*\n\n*${cleanTitle}*\n`;
    if (cleanDescription) text += `${cleanDescription}\n`;
    text += `Öncelik: ${task.priority}\nBitiş: ${date}\nGörevliler: ${tags}\n`;
    if (task.completionNote) text += `\n📝 *Kapanış notu:* ${task.completionNote}\n`;
    if (task.completedBy) text += `✍️ *Kapatan:* ${task.completedBy}\n`;
    // Kullanıcı kuralı: Görev tamamlandı bildirimine link koyulmaz
    return { text: text.trim(), mentions: [...new Set(mentions)], replyTo: task.sourceMessageId || undefined };
  }

  if (kind === 'TASK_REACTIVATED') {
    text = `🔄 *Görev Tekrar Aktifleştirildi!*\n\n*${cleanTitle}*\n`;
    if (cleanDescription) text += `${cleanDescription}\n`;
    text += `Öncelik: ${task.priority}\n📅 *Yeni Bitiş:* ${date}\n👥 *Görevliler:* ${tags}\n✍️ *Aktifleştiren:* ${extra?.by || 'Yönetici'}\n`;
    if (extra?.reason) text += `\n📝 *Aktifleştirme Nedeni:*\n"${extra.reason}"\n`;
    text += `\n🔗 Görevi incele: ${taskUrl}`;
    return { text, mentions: [...new Set(mentions)], url: taskUrl, replyTo: task.sourceMessageId || undefined };
  }

  return { text: cleanTitle, mentions: [] };
}
export async function acceptEvent(body: any) {
  const key = eventKey(body);
  return prisma.$queryRaw`INSERT INTO incoming_events (id,event_key,payload,updated_at)
    VALUES (${randomUUID()},${key},${JSON.stringify(body)}::jsonb,NOW())
    ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key RETURNING id`;
}
export async function processInbox() {
  const token = randomUUID();
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    WITH candidate AS (
      SELECT id FROM incoming_events WHERE
        (status = 'PENDING' AND next_attempt_at <= NOW()) OR (status = 'PROCESSING' AND locked_until < NOW())
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE incoming_events SET status = 'PROCESSING', attempts = attempts + 1,
      locked_until = NOW() + INTERVAL '60 seconds', lock_token = ${token}, updated_at = NOW()
      WHERE id IN (SELECT id FROM candidate) RETURNING id`;
  if (!rows.length) return;
  const id = rows[0].id;
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM incoming_events WHERE id = ${id} FOR UPDATE`;
      const item = await tx.incomingEvent.findUniqueOrThrow({ where: { id } });
      if (item.lockToken !== token || item.status !== 'PROCESSING') return null;
      const body = item.payload as any;
      let message = null;
      let updatedMessage = null;
      if (['message', 'message.any'].includes(body.event)) {
        const data = parseMessage(body.payload);
        const existing = await tx.message.findUnique({ where: { id: data.id } });
        if (!existing) message = await messageService.saveMessage(data, tx);
      }
      if(body.event?.startsWith('call.')) {
        const p=body.payload;
        const messageId='call:'+p.id+':'+body.event;
        if(!await tx.message.findUnique({where:{id:messageId}})) message=await messageService.saveMessage({id:messageId,chatId:p.from,isGroup:!!p.isGroup,senderId:p.from,body:(p.isVideo?'Görüntülü arama':'Sesli arama')+': '+(body.event==='call.received'?'Gelen arama — yanıtlamak için telefonunuzu kullanın.':body.event==='call.accepted'?'Başka cihazda yanıtlandı.':'Sonlandı veya reddedildi.'),messageType:'SYSTEM',timestamp:new Date(Number(p.timestamp)*1000),isFromMe:false},tx);
      }
      if(body.event==='message.ack') {
 const p=body.payload;
 if(!Number.isInteger(p.ack)||p.ack < -1||p.ack>4) throw new Error('Invalid ACK');
 await tx.message.updateMany({where:{id:p.id,OR:[{ack:null},{ack:{lt:p.ack}}]},data:{ack:p.ack}});
 updatedMessage=await tx.message.findUnique({where:{id:p.id}});
 if(!updatedMessage) throw new Error('ACK message not stored yet');
}
if(body.event==='message.edited'||body.event==='message.revoked') {
 const p=body.payload.after||body.payload;
 const messageId=p.id||body.payload.before?.id;
 updatedMessage=await tx.message.update({where:{id:messageId},data:body.event==='message.revoked'?{revoked:true,body:'',mediaUrl:null}:{body:p.body||'',editedAt:new Date()}});
}
if(body.event==='message.reaction') {
 const p=body.payload, senderId=p.fromMe?'me':p.participant||p.from;
 const timestamp=new Date(Number(p.timestamp)*1000);
 const previous=await tx.messageReaction.findUnique({where:{messageId_senderId:{messageId:p.reaction.messageId,senderId}}});
 if(!previous||previous.timestamp<=timestamp) await tx.messageReaction.upsert({where:{messageId_senderId:{messageId:p.reaction.messageId,senderId}},create:{messageId:p.reaction.messageId,senderId,text:p.reaction.text,timestamp},update:{text:p.reaction.text,timestamp}});
 updatedMessage=await tx.message.findUnique({where:{id:p.reaction.messageId}});
 if(!updatedMessage) throw new Error('Reaction message not stored yet');
}
await tx.incomingEvent.update({ where: { id }, data: { status: 'COMPLETED', lockedUntil: null, lockToken: null, lastError: null } });
      return { message, updatedMessage, statusEvent: body.event === 'session.status' || body.event === 'state.change' };
    }, { timeout: 20_000 });
    if (result?.message) {
      const msg = result.message;
      events.emit('new_message', msg);
      if (msg.mediaUrl && msg.messageType !== 'TEXT') {
        void mediaService.downloadMedia(msg.id).catch(err => {
          console.warn(`[EagerMedia] Could not eagerly download media for ${msg.id}:`, err?.message || err);
        });
      }
    }
    if (result?.updatedMessage) events.emit('message_updated', result.updatedMessage);
    if (result?.statusEvent) void wahaService.reconcile().catch(() => {});
  } catch (error: any) {
    const item = await prisma.incomingEvent.findUnique({ where: { id } });
    await prisma.incomingEvent.updateMany({ where: { id, lockToken: token }, data: {
      status: (item?.attempts || 0) >= 10 ? 'FAILED' : 'PENDING', lockedUntil: null, lockToken: null,
      nextAttemptAt: new Date(Date.now() + retryDelay(item?.attempts || 1)), lastError: String(error.message).slice(0, 500),
    } });
  }
}

async function renderJob(job: OutgoingJob): Promise<{ text: string; mentions: string[]; replyTo?: string } | null> {
  const payload = job.payload as any;
  if (job.kind === 'REMINDER') {
    if (payload.day && payload.day !== istanbulDay()) return null;
    const tasks = await prisma.task.findMany({ where: { id: { in: payload.taskIds }, status: { not: 'DONE' } }, include: { assignees: { include: { contact: true } } } });
    if (!tasks.length) return null;
    const mentions = new Set<string>();
    const textList = await Promise.all(tasks.map(async task => {
      const tags = task.assignees.map(a => {
        const resolved = contactResolver.resolveAssigneeMention(a.contact);
        if (resolved.jid) mentions.add(resolved.jid);
        return resolved.tag;
      }).join(' ');
      const rawUrl = `${process.env.APP_URL || 'http://localhost:3000'}/t/${task.id}`;
      const shortLink = await urlShortenerService.shortenUrl(rawUrl);
      return `📋 *${task.title}*\n${tags}\n🔗 ${shortLink}`;
    }));
    return { text: `🔔 *Görev Hatırlatması*\n\n${textList.join('\n\n')}`, mentions: [...mentions] };
  }

  let text = payload.text || '';
  if (payload.url) {
    const shortLink = await urlShortenerService.shortenUrl(payload.url);
    if (shortLink && shortLink !== payload.url) {
      text = text.replace(payload.url, shortLink);
    }
  }
  return { text, mentions: payload.mentions || [], replyTo: payload.replyTo || undefined };
}

export async function processOutbox() {
  const expired = await prisma.outgoingJob.findMany({ where: { status: 'PROCESSING', lockedUntil: { lt: new Date() } } });
  for (const job of expired) {
    const changed = await prisma.outgoingJob.updateMany({ where: { id: job.id, status: 'PROCESSING', lockToken: job.lockToken }, data: { status: 'UNKNOWN', lockedUntil: null, lockToken: null, lastError: 'Gönderim sırasında işlem kesildi; yeniden göndermeden önce kontrol edin.' } });
    if (changed.count) events.emit('notification_updated', notificationView({ ...job, status: 'UNKNOWN' }));
  }
  if (!wahaService.isConnected()) return;
  const token = randomUUID();
  const job = await prisma.$transaction(async tx => {
    const session = process.env.WAHA_SESSION_NAME || 'default';
    const gate = await tx.$queryRaw<{ session: string }[]>`UPDATE connection_preferences SET last_dispatch_at = NOW()
      WHERE session = ${session} AND enabled = true AND (last_dispatch_at IS NULL OR last_dispatch_at <= NOW() - INTERVAL '1 second') RETURNING session`;
    if (!gate.length) return null;
    const rows = await tx.$queryRaw<{ id: string }[]>`WITH candidate AS (
      SELECT j.id FROM outgoing_jobs j WHERE j.status = 'PENDING' AND j.next_attempt_at <= NOW()
      AND NOT EXISTS (SELECT 1 FROM outgoing_jobs older WHERE older.chat_id = j.chat_id AND older.sequence < j.sequence AND older.status IN ('PENDING', 'PROCESSING', 'UNKNOWN', 'FAILED'))
      ORDER BY j.sequence FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE outgoing_jobs SET status = 'PROCESSING', attempts = attempts + 1, lock_token = ${token},
      locked_until = NOW() + INTERVAL '60 seconds', updated_at = NOW() WHERE id IN (SELECT id FROM candidate) RETURNING id`;
    return rows.length ? tx.outgoingJob.findUniqueOrThrow({ where: { id: rows[0].id } }) : null;
  });
  if (!job) return;
  let status: 'ACCEPTED' | 'PENDING' | 'UNKNOWN' | 'FAILED' | 'CANCELLED' = 'ACCEPTED';
  let providerId: string | undefined;
  let lastError: string | null = null;
  let sending = false;
  try {
    const rendered = await renderJob(job);
    if (!rendered) status = 'CANCELLED';
    else {
      // A stalled preparation must not dispatch after another worker expired its lease.
      const owned = await prisma.outgoingJob.findFirst({ where: { id: job.id, status: 'PROCESSING', lockToken: token, lockedUntil: { gt: new Date(Date.now() + 20000) } } });
      if (!owned) return;
      const preference = await prisma.connectionPreference.findUnique({ where: { session: process.env.WAHA_SESSION_NAME || 'default' } });
      if (!preference?.enabled || !wahaService.isConnected()) {
        status = 'PENDING';
      } else {
      sending = true;
      const response = await wahaService.sendMessage(job.chatId, rendered.text, rendered.mentions, rendered.replyTo);
      providerId = typeof response?.id === 'string' ? response.id : undefined;
      }
    }
  } catch (error: any) {
    const classification = sending ? classifySendError(error) : 'RETRY';
    status = classification === 'RETRY' ? (job.attempts >= 10 ? 'FAILED' : 'PENDING') : classification;
    lastError = sending ? (error.status ? `WAHA HTTP ${error.status}` : 'WAHA gönderim sonucu doğrulanamadı') : 'Bildirim hazırlanamadı';
  }
  const changed = await prisma.outgoingJob.updateMany({ where: { id: job.id, lockToken: token, status: 'PROCESSING' }, data: {
    status, providerId, lastError, lockedUntil: null, lockToken: null,
    nextAttemptAt: new Date(Date.now() + retryDelay(job.attempts)),
  } });
  if (changed.count) {
    const updated = await prisma.outgoingJob.findUniqueOrThrow({ where: { id: job.id } });
    events.emit('notification_updated', notificationView(updated));
  }
}

export async function queueReminders(db: DB, scope: string, chatId?: string, day?: string, taskId?: string) {
  const now = new Date();
  const tasks = await db.task.findMany({ where: {
    status: { not: 'DONE' }, ...(chatId ? { chatId } : {}), ...(taskId ? { id: taskId } : {}),
    ...(scope === 'overdue' ? { dueDate: { lt: now } } : scope === 'due_soon' ? { dueDate: { gte: now, lte: new Date(now.getTime() + 3 * 86400000) } } : {}),
  } });
  const groups = new Map<string, string[]>();
  for (const task of tasks) groups.set(task.chatId, [...(groups.get(task.chatId) || []), task.id]);
  for (const [chat, taskIds] of groups) await enqueue(db, {
    operationKey: day ? `reminder:${day}:${scope}:${chat}` : `reminder:${randomUUID()}`,
    chatId: chat, taskId, kind: 'REMINDER', payload: { taskIds, ...(day ? { day } : {}) },
  });
  return { queued: tasks.length, sent: 0, chats: groups.size };
}
export async function runScheduler(now = new Date()) {
  if (!reminderDue(now)) return;
  const day = istanbulDay(now);
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9183060)`;
    if (await tx.schedulerRun.findUnique({ where: { day } })) return;
    await queueReminders(tx, 'overdue', undefined, day);
    await queueReminders(tx, 'due_soon', undefined, day);
    await tx.schedulerRun.create({ data: { day } });
  });
}
