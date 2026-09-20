import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function mergeDuplicateChats() {
  console.log('--- SCANNING DUPLICATE CHATS ---');
  
  // 1. Get contacts with both phoneNumber and lidId
  const contacts = await prisma.contact.findMany({
    where: {
      AND: [
        { phoneNumber: { not: '' } },
        { lidId: { not: null } }
      ]
    }
  });

  console.log(`Found ${contacts.length} contacts with both phone and lidId.`);

  let mergedCount = 0;
  for (const c of contacts) {
    const cleanPhone = c.phoneNumber.replace(/\D/g, '');
    const phoneChatId = `${cleanPhone}@c.us`;
    const altPhoneChatId = `${cleanPhone}@s.whatsapp.net`;
    const lidChatId = c.lidId;

    const candidatePhoneChatIds = [phoneChatId, altPhoneChatId];

    for (const pChatId of candidatePhoneChatIds) {
      const [pChat, lChat] = await Promise.all([
        prisma.chat.findUnique({ where: { id: pChatId } }),
        prisma.chat.findUnique({ where: { id: lidChatId } })
      ]);

      if (pChat && lChat && pChat.id !== lChat.id) {
        console.log(`\nMerging [${pChat.id}] into [${lChat.id}] (${c.displayName || c.pushName || lChat.name}):`);

        // A. Copy avatarUrl if lidChat has none and pChat has one
        const newAvatarUrl = lChat.avatarUrl || pChat.avatarUrl || null;
        if (newAvatarUrl && newAvatarUrl !== lChat.avatarUrl) {
          console.log(`  -> Transferring avatar to ${lChat.id}`);
          await prisma.chat.update({
            where: { id: lChat.id },
            data: { avatarUrl: newAvatarUrl }
          });
        }

        // Also update contact avatarUrl if null
        if (newAvatarUrl && !c.avatarUrl) {
          await prisma.contact.update({
            where: { id: c.id },
            data: { avatarUrl: newAvatarUrl }
          });
        }

        // B. Reassign messages from pChat to lChat
        const msgUpdate = await prisma.message.updateMany({
          where: { chatId: pChat.id },
          data: { chatId: lChat.id }
        });
        if (msgUpdate.count > 0) {
          console.log(`  -> Reassigned ${msgUpdate.count} messages from ${pChat.id} to ${lChat.id}`);
        }

        // C. Reassign tasks from pChat to lChat
        const taskUpdate = await prisma.task.updateMany({
          where: { chatId: pChat.id },
          data: { chatId: lChat.id }
        });
        if (taskUpdate.count > 0) {
          console.log(`  -> Reassigned ${taskUpdate.count} tasks from ${pChat.id} to ${lChat.id}`);
        }

        // D. Reassign outgoing_jobs if any
        const jobUpdate = await prisma.outgoingJob.updateMany({
          where: { chatId: pChat.id },
          data: { chatId: lChat.id }
        });
        if (jobUpdate.count > 0) {
          console.log(`  -> Reassigned ${jobUpdate.count} outgoing jobs to ${lChat.id}`);
        }

        // E. Delete the duplicate phone chat
        await prisma.chat.delete({
          where: { id: pChat.id }
        });
        console.log(`  -> Deleted redundant chat ${pChat.id}`);
        mergedCount++;
      }
    }
  }

  console.log(`\n=== MERGE COMPLETE: ${mergedCount} duplicate chats merged and removed ===`);
}

mergeDuplicateChats().catch(console.error).finally(() => prisma.$disconnect());
