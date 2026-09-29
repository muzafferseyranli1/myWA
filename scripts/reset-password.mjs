// Sets a new password for a panel user. The password is read from the terminal
// without echoing, so it never appears on screen, in shell history or in logs.
// Usage: node --env-file=.env scripts/reset-password.mjs <username>
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const username = process.argv[2];
if (!username) { console.error('Kullanım: node --env-file=.env scripts/reset-password.mjs <kullanıcı-adı>'); process.exit(1); }
if (!process.stdin.isTTY) { console.error('Bu betik bir terminalde çalıştırılmalı.'); process.exit(1); }

function ask(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt);
    const input = [];
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onData = chunk => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData);
          process.stdout.write('\n'); return resolve(input.join(''));
        }
        if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') input.pop(); else input.push(ch);
      }
    };
    process.stdin.on('data', onData);
  });
}

const db = new PrismaClient({ log: [] });
try {
  const user = await db.user.findUnique({ where: { username } });
  if (!user) throw new Error(`"${username}" adlı kullanıcı bulunamadı.`);
  const password = await ask('Yeni şifre: ');
  if (password.length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
  if (await ask('Yeni şifre (tekrar): ') !== password) throw new Error('Şifreler eşleşmedi; hiçbir şey değiştirilmedi.');
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
  console.log(`${username} için şifre güncellendi.`);
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  await db.$disconnect();
}
