import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const chats = await prisma.chat.findMany({
    where: {
      OR: [
        { name: { contains: 'Aynur', mode: 'insensitive' } },
        { name: { contains: 'İbrahim', mode: 'insensitive' } },
        { name: { contains: 'Ibrahim', mode: 'insensitive' } }
      ]
    },
    include: {
      _count: { select: { messages: true } }
    }
  });
  console.log('Chats found:', JSON.stringify(chats, null, 2));

  // Also check if there are other chats with duplicate names
  const allChats = await prisma.chat.findMany({
    select: { id: true, name: true, avatarUrl: true, _count: { select: { messages: true } } }
  });
  
  const byName = new Map();
  for (const c of allChats) {
    const list = byName.get(c.name) || [];
    list.push(c);
    byName.set(c.name, list);
  }

  const duplicates = [];
  for (const [name, list] of byName.entries()) {
    if (list.length > 1) {
      duplicates.push({ name, count: list.length, items: list });
    }
  }

  console.log('Duplicates summary:', JSON.stringify(duplicates, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
