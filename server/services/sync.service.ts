import { prisma } from '../lib/prisma';
import { wahaService } from './waha.service';
import { acceptEvent } from './delivery.service';
import { parseMessage, isStatusOrBroadcast } from '../lib/reliability';
import { events } from '../lib/events';
import { contactResolver } from './contact-resolver.service';

import { currentTenant, tenantScoped } from '../lib/tenant';

// Discovery cursor and avatar back-off are kept per tenant.
const state = tenantScoped('sync', () => ({ discoveryOffset: 0, avatarChecked: new Map<string, number>() }));

/**
 * Eksik profil resmi olan sohbetlerin avatarlarını arka planda WAHA'dan çeker
 */
async function syncMissingAvatars(): Promise<void> {
  try {
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    const chatsWithoutAvatar = await prisma.chat.findMany({
      where: {
        avatarUrl: null,
        AND: [
          { id: { not: 'status@broadcast' } },
          { id: { not: { endsWith: '@broadcast' } } }
        ]
      },
      select: { id: true, isGroup: true },
      take: 15,
      orderBy: { updatedAt: 'desc' }
    });

    let updatedCount = 0;
    for (const chat of chatsWithoutAvatar) {
      const lastChecked = state.avatarChecked.get(chat.id);
      if (lastChecked && now - lastChecked < twentyFourHours) {
        continue;
      }
      state.avatarChecked.set(chat.id, now);

      let pictureUrl: string | null = null;

      if (chat.isGroup) {
        pictureUrl = await wahaService.getChatPicture(chat.id);
      } else {
        if (chat.id.endsWith('@lid')) {
          const mentionJid = contactResolver.resolveToMentionJid(chat.id);
          if (mentionJid && !mentionJid.endsWith('@lid')) {
            pictureUrl = await wahaService.getChatPicture(mentionJid) ||
                         await wahaService.getContactPicture(mentionJid);
          }
          if (!pictureUrl) {
            pictureUrl = await wahaService.getChatPicture(chat.id);
          }
        } else {
          pictureUrl = await wahaService.getChatPicture(chat.id) ||
                       await wahaService.getContactPicture(chat.id);
        }
      }

      if (pictureUrl) {
        await prisma.chat.update({
          where: { id: chat.id },
          data: { avatarUrl: pictureUrl }
        });
        contactResolver.cacheAvatar(chat.id, pictureUrl);
        await prisma.contact.updateMany({
          where: { OR: [{ id: chat.id }, { lidId: chat.id }] },
          data: { avatarUrl: pictureUrl }
        }).catch(() => {});
        updatedCount++;
      }

      await new Promise(r => setTimeout(r, 100));
    }

    if (updatedCount > 0) {
      events.emit('chat_updated');
    }
  } catch (e: any) {
    console.warn('[Sync] syncMissingAvatars notice:', e?.message || e);
  }
}

export async function syncHistory() {
  if (!wahaService.isConnected()) return;
  const session = currentTenant().session;
  let sync = await prisma.syncState.upsert({ where: { session }, create: { session }, update: {} });
  try {
    if (!sync.roundUntil) sync = await prisma.syncState.update({ where: { session }, data: { roundUntil: Math.floor(Date.now()/1000), offset: 0 } });
    const messages = await wahaService.getHistory(sync.offset, Math.max(0, sync.completedUntil - 120), sync.roundUntil!);
    if (!Array.isArray(messages)) throw new Error('Unexpected history response');
    // Persist each page before advancing its durable cursor. Replaying an
    // interrupted page shares the same message keys as live webhooks.
    for (const payload of messages) {
      const from = payload.from || '';
      const to = payload.to || '';
      const chatId = payload.chatId || '';
      if (isStatusOrBroadcast(from) || isStatusOrBroadcast(to) || isStatusOrBroadcast(chatId)) {
        continue;
      }
      await acceptEvent({ session, event: 'message.any', payload });
      const data=parseMessage(payload);
      if (isStatusOrBroadcast(data.chatId)) continue;
      if(data.preview)await prisma.message.updateMany({where:{id:payload.id},data:{preview:data.preview}});
      if (Number.isInteger(payload.ack)) await prisma.message.updateMany({ where: { id: payload.id, OR: [{ack: null},{ack:{lt:payload.ack}}] }, data: { ack: payload.ack } });
    }
    const complete = messages.length === 0;
    await prisma.syncState.update({ where: { session }, data: complete ? { completedUntil: sync.roundUntil!, roundUntil: null, offset: 0, lastSuccessAt: new Date(), lastError: null } : { offset: sync.offset + 100, lastError: null } });
    const chats = await wahaService.getChatOverview(state.discoveryOffset);
    if (!Array.isArray(chats)) throw new Error('Unexpected chat response');
    for (const chat of chats) {
      if (typeof chat.id !== 'string' || !chat.id.includes('@')) continue;
      if (isStatusOrBroadcast(chat.id)) continue;

      const isGroup = chat.id.endsWith('@g.us');
      const timestamp = chat.lastMessage?.timestamp ? new Date(Number(chat.lastMessage.timestamp) * 1000) : new Date(0);

      if (chat.picture) {
        contactResolver.cacheAvatar(chat.id, chat.picture);
      }

      if (!isGroup) {
        // 1-on-1 sohbet: İlgili kişinin veritabanında aktif bir LID sohbeti var mı kontrol et
        const lidId = contactResolver.getLidByPhone(chat.id);
        if (lidId) {
          const lidChat = await prisma.chat.findUnique({ where: { id: lidId } });
          if (lidChat) {
            // Gerçek mesajların olduğu LID sohbeti mevcut!
            // Profil resmini LID sohbetine ve kişisine aktar:
            if (chat.picture && (!lidChat.avatarUrl || lidChat.avatarUrl !== chat.picture)) {
              await prisma.chat.update({
                where: { id: lidId },
                data: { avatarUrl: chat.picture }
              });
              contactResolver.cacheAvatar(lidId, chat.picture);
            }
            if (chat.picture) {
              await prisma.contact.updateMany({
                where: { OR: [{ id: lidId }, { lidId }] },
                data: { avatarUrl: chat.picture }
              }).catch(() => {});
            }

            // Eğer DB'de mükerrer boş @c.us sohbet satırı kalmışsa birleştir ve sil:
            const existingPhoneChat = await prisma.chat.findUnique({ where: { id: chat.id } });
            if (existingPhoneChat) {
              await prisma.message.updateMany({ where: { chatId: chat.id }, data: { chatId: lidId } });
              await prisma.task.updateMany({ where: { chatId: chat.id }, data: { chatId: lidId } });
              await prisma.outgoingJob.updateMany({ where: { chatId: chat.id }, data: { chatId: lidId } });
              await prisma.chat.delete({ where: { id: chat.id } }).catch(() => {});
            }

            // Mükerrer @c.us sohbeti OLUŞTURMA!
            continue;
          }
        }
      }

      const current = await prisma.chat.findUnique({ where: { id: chat.id } });
      const effectiveTime = current && current.updatedAt > timestamp ? current.updatedAt : timestamp;
      await prisma.chat.upsert({
        where: { id: chat.id },
        create: {
          id: chat.id,
          name: chat.name || chat.id.split('@')[0],
          isGroup,
          avatarUrl: chat.picture || null,
          updatedAt: timestamp
        },
        update: {
          ...(chat.name ? { name: chat.name } : {}),
          ...(chat.picture ? { avatarUrl: chat.picture } : {}),
          updatedAt: effectiveTime
        }
      });
    }
    state.discoveryOffset = chats.length ? state.discoveryOffset + 100 : 0;
    if (chats.length) events.emit('chat_updated');

    // Eksik profil resimlerini arka planda WAHA'dan tamamla
    await syncMissingAvatars();
  } catch (error: any) {
    if (error.status === 400 || error.status === 404 || error.status === 501) {
      // WAHA store is not enabled for this session; real-time messaging continues normally.
      await prisma.syncState.update({where:{session},data:{lastError: null}});
      return;
    }
    await prisma.syncState.update({where:{session},data:{lastError: 'Geçmiş eşitleme tamamlanamadı; otomatik yeniden denenecek.'}});
    throw error;
  }
}
