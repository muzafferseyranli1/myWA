import { prisma } from '../lib/prisma';
import { wahaService } from './waha.service';
import { acceptEvent } from './delivery.service';
import {parseMessage} from '../lib/reliability';
import { events } from '../lib/events';
let discoveryOffset = 0;
export async function syncHistory() {
  if (!wahaService.isConnected()) return;
  const session = process.env.WAHA_SESSION_NAME || 'default';
  let state = await prisma.syncState.upsert({ where: { session }, create: { session }, update: {} });
  try {
    if (!state.roundUntil) state = await prisma.syncState.update({ where: { session }, data: { roundUntil: Math.floor(Date.now()/1000), offset: 0 } });
    const messages = await wahaService.getHistory(state.offset, Math.max(0, state.completedUntil - 120), state.roundUntil!);
    if (!Array.isArray(messages)) throw new Error('Unexpected history response');
    // Persist each page before advancing its durable cursor. Replaying an
    // interrupted page shares the same message keys as live webhooks.
    for (const payload of messages) {
      await acceptEvent({ session, event: 'message.any', payload });
      const data=parseMessage(payload);
      if(data.preview)await prisma.message.updateMany({where:{id:payload.id},data:{preview:data.preview}});
      if (Number.isInteger(payload.ack)) await prisma.message.updateMany({ where: { id: payload.id, OR: [{ack: null},{ack:{lt:payload.ack}}] }, data: { ack: payload.ack } });
    }
    const complete = messages.length === 0;
    await prisma.syncState.update({ where: { session }, data: complete ? { completedUntil: state.roundUntil!, roundUntil: null, offset: 0, lastSuccessAt: new Date(), lastError: null } : { offset: state.offset + 100, lastError: null } });
    const chats = await wahaService.getChatOverview(discoveryOffset);
    if (!Array.isArray(chats)) throw new Error('Unexpected chat response');
    for (const chat of chats) {
      if (typeof chat.id !== 'string' || !chat.id.includes('@')) continue;
      const current = await prisma.chat.findUnique({where:{id:chat.id}});
      const timestamp = chat.lastMessage?.timestamp ? new Date(Number(chat.lastMessage.timestamp)*1000) : current?.updatedAt || new Date(0);
      await prisma.chat.upsert({where:{id:chat.id},create:{id:chat.id,name:chat.name || chat.id.split('@')[0],isGroup:chat.id.endsWith('@g.us'),avatarUrl:chat.picture || null,updatedAt:timestamp},update:{ ...(chat.name ? {name:chat.name}:{}), ...(chat.picture ? {avatarUrl:chat.picture}:{}), updatedAt:current && current.updatedAt > timestamp ? current.updatedAt : timestamp}});
    }
    discoveryOffset = chats.length ? discoveryOffset + 100 : 0;
    if (chats.length) events.emit('chat_updated');
  } catch (error: any) {
    await prisma.syncState.update({where:{session},data:{lastError: error.status ? `WAHA HTTP ${error.status}; geçmiş erişimi ve NOWEB store ayarını kontrol edin.` : 'Geçmiş eşitleme tamamlanamadı; otomatik yeniden denenecek.'}});
    throw error;
  }
}
