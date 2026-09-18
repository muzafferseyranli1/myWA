import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
await prisma.syncState.updateMany({ data: { lastError: null } });
console.log('Successfully cleared syncState lastError');
await prisma.$disconnect();
