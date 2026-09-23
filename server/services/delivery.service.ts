import { randomUUID } from 'node:crypto';
import { Prisma, OutgoingJob } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { events } from '../lib/events';
import { wahaService } from './waha.service';
import { messageService } from './message.service';
import { contactResolver } from './contact-resolver.service';
import { urlShortenerService } from './url-shortener.service';
import { mediaService } from './media.service';
import { currentTenant } from '../lib/tenant';
import { classifySendError, eventKey, istanbulDay, parseMessage, reminderDue, retryDelay, isStatusOrBroadcast } from '../lib/reliability';

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
  kind: 'TASK_CREATED' | 'TASK_COMPLETED' | 'TASK_REACTIVATED' | 'TASK_CREATED_DM',
  extra?: { reason?: string; by?: string; groupName?: string; recipientName?: string }
) {
  const mentions: string[] = [];
  const tags = task.assignees?.map((a: any) => {
    const resolved = contactResolver.resolveAssigneeMention(a.contact);
    if (resolved.jid) mentions.push(resolved.jid);
    return resolved.tag;
  }).filter(Boolean).join(' ') || '';
  const date = task.dueDate ? new Date(task.dueDate).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) : 'Belirtilmedi';
  const taskUrl = `${process.env.APP_URL || 'http://localhost:3000'}/t/${task.id}`;

  const cleanTitle = contactResolver.formatMentionsToNamesSync(task.title || '');
  const cleanDescription = task.description ? contactResolver.formatMentionsToNamesSync(task.description) : '';

  let text = '';
  if (kind === 'TASK_CREATED') {
    text = `📌 *Yeni Görev*\n\n*${cleanTitle}*\n`;
    if (cleanDescription) text += `${cleanDescription}\n`;
    text += `Öncelik: ${task.priority}\nBitiş: ${date}\nGörevliler: ${tags}\n`;
    // Always include source message text so that if WAHA cannot quote natively (e.g. older message not in cache),
    // the source message context is guaranteed never to be lost.
    if (task.sourceMessage?.body) {
      const cleanSource = contactResolver.formatMentionsToNamesSync(task.sourceMessage.body);
      text += `\nKaynak mesaj: ${cleanSource}\n`;
    }
    text += `\n🔗 Görevi incele: ${taskUrl}`;
    return { text, mentions: [...new Set(mentions)], url: taskUrl, replyTo: task.sourceMessageId || undefined, linkPreview: false };
  }

  if (kind === 'TASK_CREATED_DM') {
    const groupName = extra?.groupName || task.chat?.name || 'WhatsApp Grubu';
    text = `📌 *Adınıza Yeni Görev Tanımlandı*\n\n*${cleanTitle}*\n`;
    if (cleanDescription) text += `${cleanDescription}\n`;
    text += `📁 *Grup:* ${groupName}\nÖncelik: ${task.priority}\nBitiş: ${date}\n👥 *Görevliler:* ${tags}\n`;
    if (task.sourceMessage?.body) {
      const cleanSource = contactResolver.formatMentionsToNamesSync(task.sourceMessage.body);
      text += `\nKaynak mesaj: ${cleanSource}\n`;
    }
    text += `\n🔗 Görevi incele: ${taskUrl}`;
    return { text, mentions: [], url: taskUrl, linkPreview: false };
  }

  if (kind === 'TASK_COMPLETED') {
    text = `✅ *Görev Tamamlandı!*\n\n*${cleanTitle}*\n`;
    if (cleanDescription) text += `${cleanDescription}\n`;
    text += `Öncelik: ${task.priority}\nBitiş: ${date}\nGörevliler: ${tags}\n`;
    if (task.completionNote) text += `\n📝 *Kapanış notu:* ${task.completionNote}\n`;
    if (task.completedBy) text += `✍️ *Kapatan:* ${task.completedBy}\n`;
    // Kullanıcı kuralı: Görev tamamlandı bildirimine link koyulmaz
    return { text: text.trim(), mentions: [...new Set(mentions)], replyTo: task.sourceMessageId || undefined, linkPreview: false };
  }

  if (kind === 'TASK_REACTIVATED') {
    text = `🔄 *Görev Tekrar Aktifleştirildi!*\n\n*${cleanTitle}*\n`;
    if (cleanDescription) text += `${cleanDescription}\n`;
    text += `Öncelik: ${task.priority}\n📅 *Yeni Bitiş:* ${date}\n👥 *Görevliler:* ${tags}\n✍️ *Aktifleştiren:* ${extra?.by || 'Yönetici'}\n`;
    if (extra?.reason) text += `\n📝 *Aktifleştirme Nedeni:*\n"${extra.reason}"\n`;
    text += `\n🔗 Görevi incele: ${taskUrl}`;
    return { text, mentions: [...new Set(mentions)], url: taskUrl, replyTo: task.sourceMessageId || undefined, linkPreview: false };
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
        const rawFrom = body.payload?.from;
        const rawTo = body.payload?.to;
        const rawChatId = body.payload?.chatId;
        if (isStatusOrBroadcast(rawFrom) || isStatusOrBroadcast(rawTo) || isStatusOrBroadcast(rawChatId)) {
          await tx.incomingEvent.update({ where: { id }, data: { status: 'COMPLETED', lockedUntil: null, lockToken: null, lastError: null } });
          return null;
        }
        const data = parseMessage(body.payload);
        if (isStatusOrBroadcast(data.chatId)) {
          await tx.incomingEvent.update({ where: { id }, data: { status: 'COMPLETED', lockedUntil: null, lockToken: null, lastError: null } });
          return null;
        }
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
 if(!updatedMessage) {
   // If message wasn't stored (e.g. status/broadcast or pruned), complete event without failure
   await tx.incomingEvent.update({ where: { id }, data: { status: 'COMPLETED', lockedUntil: null, lockToken: null, lastError: null } });
   return null;
 }
}
if(body.event==='message.edited'||body.event==='message.revoked') {
 const p=body.payload.after||body.payload;
 const messageId=p.id||body.payload.before?.id;
 updatedMessage=await tx.message.update({where:{id:messageId},data:body.event==='message.revoked'?{revoked:true,body:'',mediaUrl:null}:{body:p.body||'',editedAt:new Date()}}).catch(() => null);
}
if(body.event==='message.reaction') {
 const p=body.payload, senderId=p.fromMe?'me':p.participant||p.from;
 const timestamp=new Date(Number(p.timestamp)*1000);
 const previous=await tx.messageReaction.findUnique({where:{messageId_senderId:{messageId:p.reaction.messageId,senderId}}});
 if(!previous||previous.timestamp<=timestamp) await tx.messageReaction.upsert({where:{messageId_senderId:{messageId:p.reaction.messageId,senderId}},create:{messageId:p.reaction.messageId,senderId,text:p.reaction.text,timestamp},update:{text:p.reaction.text,timestamp}});
 updatedMessage=await tx.message.findUnique({where:{id:p.reaction.messageId}});
 if(!updatedMessage) {
   // If reaction is for status or broadcast message not stored in DB, do not throw
   await tx.incomingEvent.update({ where: { id }, data: { status: 'COMPLETED', lockedUntil: null, lockToken: null, lastError: null } });
   return null;
 }
}
await tx.incomingEvent.update({ where: { id }, data: { status: 'COMPLETED', lockedUntil: null, lockToken: null, lastError: null } });
      return { message, updatedMessage, statusEvent: body.event === 'session.status' || body.event === 'state.change' };
    }, { timeout: 20_000 });
    if (result?.message) {
      const msg = result.message;
      events.emit('new_message', msg);
      if (['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER'].includes(msg.messageType)) {
        void mediaService.downloadMedia(msg.id).then(async () => {
          const fresh = await prisma.message.findUnique({ where: { id: msg.id } });
          if (fresh) events.emit('message_updated', fresh);
        }).catch(err => {
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

export function getDaysDiff(targetDate: Date, nowDate = new Date()): number {
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d);
  const d1 = new Date(fmt(targetDate) + 'T00:00:00Z');
  const d2 = new Date(fmt(nowDate) + 'T00:00:00Z');
  return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatDateTR(date: Date): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

export async function renderJob(job: OutgoingJob): Promise<{ text: string; mentions: string[]; replyTo?: string; linkPreview?: boolean } | null> {
  const payload = job.payload as any;
  if (job.kind === 'REMINDER') {
    if (payload.day && payload.day !== istanbulDay()) return null;
    const tasks = await prisma.task.findMany({
      where: { id: { in: payload.taskIds }, status: { not: 'DONE' } },
      include: { assignees: { include: { contact: true } } }
    });
    if (!tasks.length) return null;

    const mentions = new Set<string>();
    const now = new Date();

    const overdueTasks: typeof tasks = [];
    const dueSoonTasks: typeof tasks = [];
    const otherTasks: typeof tasks = [];

    for (const task of tasks) {
      if (task.dueDate) {
        const diff = getDaysDiff(new Date(task.dueDate), now);
        if (diff < 0) {
          overdueTasks.push(task);
        } else if (diff <= 3) {
          dueSoonTasks.push(task);
        } else {
          otherTasks.push(task);
        }
      } else {
        otherTasks.push(task);
      }
    }

    const sections: string[] = [];

    const formatSection = async (
      title: string,
      taskList: typeof tasks,
      icon: string,
      timeFormatter: (t: typeof tasks[0]) => string
    ) => {
      if (!taskList.length) return;
      const lines = await Promise.all(taskList.map(async (task, idx) => {
        const tags = task.assignees.map(a => {
          const resolved = contactResolver.resolveAssigneeMention(a.contact);
          if (resolved.jid) mentions.add(resolved.jid);
          return resolved.tag;
        }).filter(Boolean).join(' ');

        const assigneeStr = tags ? ` — ${tags}` : '';
        const timeBadge = timeFormatter(task);
        const cleanTitle = contactResolver.formatMentionsToNamesSync(task.title || '');
        const rawUrl = `${process.env.APP_URL || 'http://localhost:3000'}/t/${task.id}`;
        const shortLink = await urlShortenerService.shortenUrl(rawUrl);

        return `${idx + 1}. ${icon} *${cleanTitle}*${assigneeStr} ${timeBadge}\n   🔗 ${shortLink}`;
      }));
      sections.push(`${title} (${taskList.length}):\n${lines.join('\n')}`);
    };

    // 1. Süresi Geçenler
    await formatSection('🚨 *Süresi Geçenler*', overdueTasks, '❌', task => {
      const diff = Math.abs(getDaysDiff(new Date(task.dueDate!), now));
      return `(${diff} gündür gecikiyor!)`;
    });

    // 2. Yaklaşanlar
    await formatSection('⏳ *Yaklaşanlar*', dueSoonTasks, '⚡', task => {
      const diff = getDaysDiff(new Date(task.dueDate!), now);
      return diff === 0 ? '(Bugün son gün!)' : `(${diff} gün kaldı)`;
    });

    // 3. Devam Edenler / Diğerleri
    await formatSection('🔄 *Devam Edenler*', otherTasks, '🔧', task => {
      if (task.dueDate) {
        const diff = getDaysDiff(new Date(task.dueDate), now);
        return `(${diff} gün kaldı)`;
      }
      return task.status === 'IN_PROGRESS' ? '(Devam ediyor)' : '(Aktif)';
    });

    const body = sections.join('\n\n');
    const text = `📊 🗓️ *GÖREV DURUMU ÖZETİ*\n\n${body}\n\n📌 *Toplam:* ${tasks.length} aktif görev`;

    return { text, mentions: [...mentions], linkPreview: false };
  }

  if (job.kind === 'REMINDER_DM') {
    if (payload.day && payload.day !== istanbulDay()) return null;
    const tasks = await prisma.task.findMany({
      where: { id: { in: payload.taskIds }, status: { not: 'DONE' } },
      include: { chat: true }
    });
    if (!tasks.length) return null;

    const now = new Date();
    const recipient = payload.recipientName ? `@${payload.recipientName.trim().replace(/^@/, '')}` : 'Görevli';

    const hasOverdue = tasks.some(t => t.dueDate && getDaysDiff(new Date(t.dueDate), now) < 0);
    const headingNotice = hasOverdue
      ? 'Süresi geçtiği halde tamamlanmayan görevleriniz bulunmaktadır:'
      : 'Takip etmeniz gereken görevleriniz bulunmaktadır:';

    const textList = await Promise.all(tasks.map(async (task, idx) => {
      const groupName = task.chat?.name ? ` (${task.chat.name})` : '';
      const cleanTitle = contactResolver.formatMentionsToNamesSync(task.title || '');
      const rawUrl = `${process.env.APP_URL || 'http://localhost:3000'}/t/${task.id}`;
      const shortLink = await urlShortenerService.shortenUrl(rawUrl);

      let timeBadge = '';
      if (task.dueDate) {
        const diff = getDaysDiff(new Date(task.dueDate), now);
        if (diff < 0) {
          timeBadge = `⏰ ${Math.abs(diff)} gündür gecikiyor!`;
        } else if (diff === 0) {
          timeBadge = '🚨 Bugün son gün!';
        } else {
          timeBadge = `⏳ ${diff} gün kaldı`;
        }
      } else {
        timeBadge = '⏳ Tarih belirtilmedi';
      }

      const dateStr = task.dueDate ? formatDateTR(new Date(task.dueDate)) : 'Belirtilmedi';

      return `${idx + 1}. 📋 *${cleanTitle}*${groupName}\n   🗓️ Bitiş: ${dateStr} | ${timeBadge}\n   🔗 Kapat: ${shortLink}`;
    }));

    const text = `⚠️ Sayın *${recipient}*\n\n${headingNotice}\n\n${textList.join('\n\n')}\n\nLütfen en kısa sürede tamamlayın veya durum güncellemesi yapın.`;

    return {
      text,
      mentions: [],
      linkPreview: false
    };
  }

  let text = payload.text || '';
  if (payload.url) {
    const shortLink = await urlShortenerService.shortenUrl(payload.url);
    if (shortLink && shortLink !== payload.url) {
      text = text.replace(payload.url, shortLink);
    }
  }
  return { text, mentions: payload.mentions || [], replyTo: payload.replyTo || undefined, linkPreview: payload.linkPreview ?? false };
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
    const session = currentTenant().session;
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
      const preference = await prisma.connectionPreference.findUnique({ where: { session: currentTenant().session } });
      if (!preference?.enabled || !wahaService.isConnected()) {
        status = 'PENDING';
      } else {
      sending = true;
      const response = await wahaService.sendMessage(job.chatId, rendered.text, rendered.mentions, rendered.replyTo, rendered.linkPreview ?? false);
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
  }, include: { assignees: { include: { contact: true } }, chat: true } });

  const groups = new Map<string, string[]>();
  for (const task of tasks) groups.set(task.chatId, [...(groups.get(task.chatId) || []), task.id]);
  for (const [chat, taskIds] of groups) await enqueue(db, {
    operationKey: day ? `reminder:${day}:${scope}:${chat}` : `reminder:${randomUUID()}`,
    chatId: chat, taskId, kind: 'REMINDER', payload: { taskIds, ...(day ? { day } : {}) },
  });

  // Direct DM reminders for assignees whose tasks have notifyAssigneesDirectly === true
  const directAssigneeTasks = new Map<string, { contact: any; taskIds: string[] }>();
  for (const task of tasks) {
    if ((task as any).notifyAssigneesDirectly && task.assignees?.length) {
      for (const a of task.assignees) {
        const dmChatId = contactResolver.resolveDirectChatId(a.contact);
        if (dmChatId && dmChatId !== task.chatId) {
          const entry = directAssigneeTasks.get(dmChatId) || { contact: a.contact, taskIds: [] };
          if (!entry.taskIds.includes(task.id)) {
            entry.taskIds.push(task.id);
          }
          directAssigneeTasks.set(dmChatId, entry);
        }
      }
    }
  }

  for (const [dmChatId, { contact, taskIds }] of directAssigneeTasks) {
    const recipientName = contact.displayName || contact.pushName || contactResolver.getDisplayNameSync(contact.id) || 'Görevli';
    await enqueue(db, {
      operationKey: day ? `reminder:dm:${day}:${scope}:${dmChatId}` : `reminder:dm:${randomUUID()}:${dmChatId}`,
      chatId: dmChatId, taskId, kind: 'REMINDER_DM',
      payload: { taskIds, recipientName, ...(day ? { day } : {}) },
    });
  }

  return { queued: tasks.length, sent: 0, chats: groups.size, directDMs: directAssigneeTasks.size };
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
