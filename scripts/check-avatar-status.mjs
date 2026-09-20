import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const allChats = await prisma.chat.findMany({
    where: { id: { not: { contains: 'broadcast' } } },
    select: { id: true, name: true, isGroup: true, avatarUrl: true }
  });

  const withAvatar = allChats.filter(c => !!c.avatarUrl);
  const withoutAvatar = allChats.filter(c => !c.avatarUrl);

  console.log(`Total chats: ${allChats.length}`);
  console.log(`Chats WITH avatar: ${withAvatar.length}`);
  console.log(`Chats WITHOUT avatar: ${withoutAvatar.length}`);
  console.log('\nSample chats without avatar:');
  console.log(withoutAvatar.slice(0, 10));
}

main().catch(console.error).finally(() => prisma.$disconnect());
