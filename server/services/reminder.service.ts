import { whatsappService } from './whatsapp.service';
import { taskService } from './task.service';
import { prisma } from '../lib/prisma';
import { contactResolver } from './contact-resolver.service';
import { urlShortenerService } from './url-shortener.service';

function daysUntil(date: Date): number {
  const target = new Date(date);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function absDays(date: Date): number {
  return Math.abs(daysUntil(date));
}

function formatDateTR(date: Date): string {
  return date.toLocaleDateString('tr-TR');
}

export const reminderService = {
  async generateReminderMessage(task: any, state: 'OVERDUE' | 'DUE_SOON' | 'IN_PROGRESS'): Promise<{ message: string; mentions: string[] }> {
    const mentionJids: string[] = [];
    const phones = (task.assignees || []).map((a: any) => {
      const { tag, jid } = contactResolver.resolveAssigneeMention(a.contact || { id: a.contactId });
      if (jid) mentionJids.push(jid);
      return tag;
    }).filter(Boolean).join(' ');

    const days = task.dueDate ? absDays(new Date(task.dueDate)) : 0;
    const date = task.dueDate ? formatDateTR(new Date(task.dueDate)) : '-';

    const baseUrl = process.env.APP_URL!;
    const taskUrl = await urlShortenerService.shortenUrl(`${baseUrl}/t/${task.id}`);
    const linkText = `\n\n🔗 *Görevi İncele & Kapat:*\n${taskUrl}`;

    let body = '';
    switch (state) {
      case 'OVERDUE':
        body = `🚨⏰ *HATIRLATMA: Süresi Geçmiş Görev!*\n\n📋 *Görev:* ${task.title}\n👤 *Sorumlu:* ${phones}\n📅 *Son Tarih:* ${date}\n⚠️ *Gecikme:* ${days} gün\n\n❗ Bu görevin süresi geçmiş. Lütfen durumu güncelleyin.${linkText}`;
        break;
      case 'DUE_SOON':
        body = `⏳🔔 *HATIRLATMA: Son Tarih Yaklaşıyor!*\n\n📋 *Görev:* ${task.title}\n👤 *Sorumlu:* ${phones}\n📅 *Son Tarih:* ${date}\n⏱️ *Kalan:* ${days} gün\n\n💪 Son tarih yaklaşıyor, şimdi harekete geçme zamanı!${linkText}`;
        break;
      case 'IN_PROGRESS':
        body = `🔄📊 *DURUM KONTROLÜ*\n\n📋 *Görev:* ${task.title}\n👤 *Sorumlu:* ${phones}\n🏷️ *Durum:* Devam Ediyor\n📅 *Son Tarih:* ${date}\n⏱️ *Kalan:* ${days} gün\n\n📝 Görev durumunuz hakkında güncelleme paylaşır mısınız?${linkText}`;
        break;
      default:
        body = '';
    }

    return {
      message: body,
      mentions: [...new Set(mentionJids)]
    };
  },

  generateSummaryMessage(chatTasks: any[]): string {
    const now = new Date();
    const overdue = chatTasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'DONE');
    const dueSoon = chatTasks.filter(t => t.dueDate && new Date(t.dueDate) >= now && daysUntil(new Date(t.dueDate)) <= 3 && t.status !== 'DONE');
    const inProgress = chatTasks.filter(t => t.status === 'IN_PROGRESS');

    let msg = `📊🗓️ *GÖREV DURUMU ÖZETİ*\n\n`;

    if (overdue.length > 0) {
      msg += `🚨 *Süresi Geçenler (${overdue.length}):*\n`;
      overdue.forEach((t, i) => {
        const phones = t.assignees.map((a: any) => {
          const jid = contactResolver.resolveToMentionJid(a.contact.id);
          return jid ? `@${jid.split('@')[0]}` : (a.contact.pushName || a.contact.phoneNumber);
        }).join(' ');
        msg += `  ${i + 1}. ❌ ${t.title} — ${phones} (${absDays(new Date(t.dueDate))} gün gecikme)\n`;
      });
      msg += '\n';
    }

    if (dueSoon.length > 0) {
      msg += `⏳ *Yaklaşanlar (${dueSoon.length}):*\n`;
      dueSoon.forEach((t, i) => {
        const phones = t.assignees.map((a: any) => {
          const jid = contactResolver.resolveToMentionJid(a.contact.id);
          return jid ? `@${jid.split('@')[0]}` : (a.contact.pushName || a.contact.phoneNumber);
        }).join(' ');
        msg += `  ${i + 1}. ⚡ ${t.title} — ${phones} (${daysUntil(new Date(t.dueDate))} gün kaldı)\n`;
      });
      msg += '\n';
    }

    if (inProgress.length > 0) {
      msg += `🔄 *Devam Edenler (${inProgress.length}):*\n`;
      inProgress.forEach((t, i) => {
        const phones = t.assignees.map((a: any) => {
          const jid = contactResolver.resolveToMentionJid(a.contact.id);
          return jid ? `@${jid.split('@')[0]}` : (a.contact.pushName || a.contact.phoneNumber);
        }).join(' ');
        const days = t.dueDate ? `${daysUntil(new Date(t.dueDate))} gün kaldı` : 'Tarih yok';
        msg += `  ${i + 1}. 🔧 ${t.title} — ${phones} (${days})\n`;
      });
      msg += '\n';
    }

    msg += `📌 *Toplam:* ${chatTasks.length} aktif görev\n💬 Durumlarınızı güncellemek için paneli kullanabilirsiniz.`;
    return msg;
  },

  async sendReminder(taskId: string) {
    const task = await taskService.getTaskById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.status === 'DONE') return { sent: 0 };

    const now = new Date();
    let state: 'OVERDUE' | 'DUE_SOON' | 'IN_PROGRESS' | null = null;
    
    if (task.dueDate && task.dueDate < now) {
      state = 'OVERDUE';
    } else if (task.dueDate && daysUntil(task.dueDate) <= 3) {
      state = 'DUE_SOON';
    } else if (task.status === 'IN_PROGRESS') {
      state = 'IN_PROGRESS';
    }

    // Fallback: görev DONE değil ama hiçbir koşul sağlanmadıysa
    // (örn. TODO durumuyla, tarihi 3+ gün ileride) yine de gönder
    if (!state) state = 'IN_PROGRESS';

    const { message, mentions } = await this.generateReminderMessage(task, state);
    await whatsappService.sendMessage(task.chatId, message, mentions);
    
    await prisma.taskReminder.create({
      data: {
        taskId,
        messageContent: message,
      }
    });

    return { sent: 1 };
  },

  async sendBulkReminders(scope: 'overdue' | 'due_soon' | 'all_pending', chatId?: string) {
    const where: any = { status: { not: 'DONE' } };
    if (chatId) where.chatId = chatId;
    
    const tasks = await prisma.task.findMany({
      where,
      include: {
        assignees: { include: { contact: true } },
        chat: true,
      },
      orderBy: { dueDate: 'asc' },
    });

    const now = new Date();
    
    if (scope === 'overdue') {
      const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < now);
      if (overdueTasks.length === 0) return { sent: 0, chats: 0 };

      const tasksByAssigneeByChat: Record<string, Record<string, typeof overdueTasks>> = {};
      
      for (const task of overdueTasks) {
        for (const assignee of task.assignees) {
          const assigneeId = assignee.contact.id;
          if (!tasksByAssigneeByChat[task.chatId]) tasksByAssigneeByChat[task.chatId] = {};
          if (!tasksByAssigneeByChat[task.chatId][assigneeId]) tasksByAssigneeByChat[task.chatId][assigneeId] = [];
          tasksByAssigneeByChat[task.chatId][assigneeId].push(task);
        }
      }

      let totalSent = 0;
      let chatCount = 0;

      for (const [chatIdKey, assigneesMap] of Object.entries(tasksByAssigneeByChat)) {
        chatCount++;
        for (const [assigneeId, assignTasks] of Object.entries(assigneesMap)) {
          const contact = assignTasks[0].assignees.find(a => a.contact.id === assigneeId)?.contact;
          const { tag: mentionTag, jid: mentionJid } = contact 
            ? contactResolver.resolveAssigneeMention(contact) 
            : { tag: `@${assigneeId.split('@')[0]}`, jid: contactResolver.resolveToMentionJid(assigneeId) };
          
          let message = `⚠️ Sayın ${mentionTag}\n\nSüresi geçtiği halde tamamlanmayan görevleriniz var:\n\n`;
          
          const baseUrl = process.env.APP_URL!;
          for (let i = 0; i < assignTasks.length; i++) {
            const t = assignTasks[i];
            const dueDate = t.dueDate ? t.dueDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
            const days = absDays(t.dueDate!);
            const shortUrl = await urlShortenerService.shortenUrl(`${baseUrl}/t/${t.id}`);
            message += `${i + 1}. 📋 *${t.title}*\n   📅 Bitiş: ${dueDate} | ⏰ ${days} gündür gecikiyor!\n   🔗 Kapat: ${shortUrl}\n\n`;
          }
          
          message += `Lütfen en kısa sürede tamamlayın veya durum güncellemesi yapın.`;

          try {
            const mentionsList = mentionJid ? [mentionJid] : [];
            await whatsappService.sendMessage(chatIdKey, message, mentionsList);
            
            for (const t of assignTasks) {
              await prisma.taskReminder.create({
                data: {
                  taskId: t.id,
                  messageContent: message,
                }
              });
            }
            totalSent += assignTasks.length;
          } catch (err) {
            console.error(`Failed to send overdue reminder to chat ${chatIdKey} for ${assigneeId}:`, err);
          }
        }
      }
      return { sent: totalSent, chats: chatCount };
    }

    // Default flow for due_soon or all_pending
    let targetTasks = tasks;
    if (scope === 'due_soon') {
      targetTasks = tasks.filter(t => t.dueDate && t.dueDate >= now && daysUntil(t.dueDate) <= 3);
    }
    if (targetTasks.length === 0) return { sent: 0, chats: 0 };

    const tasksByChat: Record<string, typeof targetTasks> = {};
    for (const task of targetTasks) {
      if (!tasksByChat[task.chatId]) tasksByChat[task.chatId] = [];
      tasksByChat[task.chatId].push(task);
    }

    let totalSent = 0;

    for (const [chatIdKey, chatTasks] of Object.entries(tasksByChat)) {
      const message = this.generateSummaryMessage(chatTasks);
      
      const allIds = chatTasks.flatMap(t => t.assignees.map(a => a.contact.id));
      const uniqueMentions = [...new Set(allIds)]
        .map(id => contactResolver.resolveToMentionJid(id))
        .filter((jid): jid is string => Boolean(jid));

      try {
        await whatsappService.sendMessage(chatIdKey, message, uniqueMentions);
        
        for (const t of chatTasks) {
          await prisma.taskReminder.create({
            data: {
              taskId: t.id,
              messageContent: message,
            }
          });
        }
        
        totalSent += chatTasks.length;
      } catch (err) {
        console.error(`Failed to send reminder to chat ${chatIdKey}:`, err);
      }
    }

    return { sent: totalSent, chats: Object.keys(tasksByChat).length };
  }
};
