import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';
async function main() {
  if (await prisma.user.findFirst({ where: { role: 'ADMIN' } })) return;
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) { console.log('ADMIN_PASSWORD not set; skipping admin user seed'); return; }
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) { console.log('User already exists; skipping seed'); return; }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({data:{username,passwordHash,role:'ADMIN',displayName:'System Admin'}});
  console.log('First administrator created');
}
main().catch((err) => { console.error('Administrator initialization notice:', err.message); }).finally(() => prisma.$disconnect());
