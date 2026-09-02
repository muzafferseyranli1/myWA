import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      passwordHash: hashedPassword,
      role: 'ADMIN',
      displayName: 'System Admin'
    },
    create: {
      username: adminUsername,
      passwordHash: hashedPassword,
      role: 'ADMIN',
      displayName: 'System Admin'
    }
  });

  console.log(`Admin user seeded: ${admin.username}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
