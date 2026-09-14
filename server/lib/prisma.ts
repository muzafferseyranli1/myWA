import { PrismaClient } from '@prisma/client';

/**
 * Server-only Prisma singleton.
 * Import this from server-side code (Express routes & services).
 * Do NOT import from Next.js pages/components — use src/lib/prisma.ts there.
 */
let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['error'],
  });
} else {
  // Prevent multiple instances during development (tsx hot-reload)
  const g = globalThis as any;
  if (!g._serverPrisma) {
    g._serverPrisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = g._serverPrisma;
}

export { prisma };
export default prisma;
