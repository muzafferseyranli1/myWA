import { prisma } from '../lib/prisma';
import { queueReminders } from './delivery.service';
export const reminderService = {
  sendReminder(taskId: string) { return prisma.$transaction(tx => queueReminders(tx, 'all_pending', undefined, undefined, taskId)); },
  sendBulkReminders(scope: string, chatId?: string) {
    if (!['overdue', 'due_soon', 'all_pending'].includes(scope)) throw new Error('Geçersiz hatırlatma kapsamı');
    return prisma.$transaction(tx => queueReminders(tx, scope, chatId));
  },
};