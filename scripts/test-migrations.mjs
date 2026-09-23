import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const base = new URL(process.env.TEST_DATABASE_URL || '');
assert.ok(['localhost', '127.0.0.1'].includes(base.hostname) && base.pathname.startsWith('/mywa_test'), 'Only isolated local mywa_test databases are allowed');
function run(args, url, expected = 0) {
  const result = spawnSync(process.execPath, args, { encoding:'utf8', env:{...process.env,DATABASE_URL:url,ADMIN_USERNAME:'fixture-admin',ADMIN_PASSWORD:'different-deploy-password'} });
  assert.equal(result.status,expected,result.stderr || result.stdout);
}
for (const mode of ['fresh','legacy','drift']) {
  const url=new URL(base); url.searchParams.set('schema',`fixture_${mode}_${Date.now()}`);
  const db=new PrismaClient({datasourceUrl:url.href});
  try {
    if (mode !== 'fresh') {
      run(['node_modules/prisma/build/index.js','db','execute','--schema','prisma/baseline.prisma','--file','prisma/migrations/20260918000000_baseline/migration.sql'],url.href);
      // Raw SQL: the current client already knows columns the baseline lacks.
      await db.$executeRaw`INSERT INTO users (id,username,password_hash,role,display_name,created_at,updated_at) VALUES ('preserved-admin','old-admin','preserved-hash','ADMIN','Existing administrator',NOW()-INTERVAL '1 day',NOW())`;
      await db.$executeRaw`INSERT INTO users (id,username,password_hash,role,display_name,updated_at) VALUES ('preserved-user','old-user','user-hash','USER','Existing user',NOW())`;
      await db.chat.create({data:{id:'preserved-chat@g.us',name:'Preserved',isGroup:true}});
      await db.$executeRaw`INSERT INTO tasks (id,chat_id,title,created_by,updated_at) VALUES ('preserved-task','preserved-chat@g.us','Existing data','preserved-admin',NOW())`;
      if (mode === 'drift') await db.$executeRawUnsafe('ALTER TABLE tasks ADD COLUMN unexpected TEXT');
    }
    run(['scripts/migrate-safe.mjs'],url.href,mode==='drift'?1:0);
    if (mode === 'drift') {
      const migrations=await db.$queryRaw`SELECT to_regclass('_prisma_migrations')::text AS name`;
      assert.equal(migrations[0].name,null,'Drift must not create a baseline marker');
    } else {
      run(['scripts/migrate-safe.mjs'],url.href); // Restart is harmless.
      run(['--import','tsx','prisma/seed.ts'],url.href);
      if (mode==='legacy') {
        assert.equal((await db.user.findUniqueOrThrow({where:{id:'preserved-admin'}})).passwordHash,'preserved-hash');
        assert.equal((await db.task.findUniqueOrThrow({where:{id:'preserved-task'}})).title,'Existing data');
        assert.equal(await db.user.count(),2);
        // Existing data belongs to the first administrator; other accounts lose access to it.
        const owner=await db.user.findUniqueOrThrow({where:{id:'preserved-admin'}});
        assert.equal(owner.tenantSchema,'public'); assert.equal(owner.selfPhone,'905332760534');
        assert.equal((await db.user.findUniqueOrThrow({where:{id:'preserved-user'}})).tenantSchema,null);
      } else {
        assert.equal(await db.user.count({where:{role:'ADMIN'}}),1);
        assert.equal((await db.user.findFirstOrThrow({where:{role:'ADMIN'}})).tenantSchema,'public');
        const hash=(await db.user.findFirstOrThrow()).passwordHash;
        run(['--import','tsx','prisma/seed.ts'],url.href); assert.equal((await db.user.findFirstOrThrow()).passwordHash,hash);
      }
      assert.equal(await db.outgoingJob.count(),0);
    }
    console.log(`Migration fixture passed: ${mode}`);
  } finally { await db.$disconnect(); }
}
