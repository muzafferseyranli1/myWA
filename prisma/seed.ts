import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
async function main() {
  if (await prisma.user.findFirst({ where: { role: 'ADMIN' } })) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD is required to create the first administrator');
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) throw new Error('ADMIN_USERNAME belongs to a non-admin account; choose a different username');
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({data:{username,passwordHash,role:'ADMIN',displayName:'System Admin'}});
  console.log('First administrator created');
}
main().catch(() => { console.error('Administrator initialization failed'); process.exitCode=1; }).finally(() => prisma.$disconnect());
