import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const sourceUrl=new URL(process.env.DATABASE_URL || '');
const targetUrl=new URL(process.env.TEST_DATABASE_URL || '');
assert.ok(['localhost','127.0.0.1'].includes(targetUrl.hostname) && targetUrl.pathname.startsWith('/mywa_test'), 'Destination must be an isolated local mywa_test database');
sourceUrl.searchParams.set('connect_timeout','5'); sourceUrl.searchParams.set('pool_timeout','5');
targetUrl.searchParams.set('schema',`live_copy_${Date.now()}`);
const tables=['users','contacts','chats','messages','group_participants','tasks','task_assignees','task_reminders'];
const cli='node_modules/prisma/build/index.js';
const diff=spawnSync(process.execPath,[cli,'migrate','diff','--from-schema-datasource','prisma/baseline.prisma','--to-schema-datamodel','prisma/baseline.prisma','--script'],{encoding:'utf8',env:{...process.env,DATABASE_URL:sourceUrl.href},timeout:30000});
if(diff.status!==0 || !diff.stdout.includes('This is an empty migration.')) {
  console.error('Live schema validation failed; no source writes or baseline markers were made.'); process.exit(1);
}
const source=new PrismaClient({datasourceUrl:sourceUrl.href});
const target=new PrismaClient({datasourceUrl:targetUrl.href});
const checksum = rows => createHash('sha256').update(JSON.stringify(rows.sort((a,b)=>String(a.id).localeCompare(String(b.id))))).digest('hex');
try {
  const snapshot=await source.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const data={};
    for(const table of tables) {
      const count=await tx.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`);
      assert.ok(count[0].n<=100000,'Snapshot limit exceeded; use pg_dump for larger datasets');
      const rows=await tx.$queryRawUnsafe(`SELECT to_jsonb(t) AS data FROM "${table}" t`);
      data[table]=rows.map(r=>r.data);
    }
    return data;
  },{isolationLevel:'RepeatableRead',timeout:60000});
  fs.mkdirSync('temp',{recursive:true});
  fs.writeFileSync('temp/live-copy-snapshot.json',JSON.stringify(snapshot));
  const result=spawnSync(process.execPath,[cli,'db','execute','--schema','prisma/baseline.prisma','--file','prisma/migrations/20260918000000_baseline/migration.sql'],{encoding:'utf8',env:{...process.env,DATABASE_URL:targetUrl.href}});
  assert.equal(result.status,0,'Isolated baseline setup failed');
  for(const table of tables) for(const row of snapshot[table]) await target.$executeRawUnsafe(`INSERT INTO "${table}" SELECT * FROM jsonb_populate_record(NULL::"${table}",$1::jsonb)`,JSON.stringify(row));
  const migration=spawnSync(process.execPath,['scripts/migrate-safe.mjs'],{encoding:'utf8',env:{...process.env,DATABASE_URL:targetUrl.href}});
  assert.equal(migration.status,0,'Upgrade of live DB copy failed');
  for(const table of tables) {
    const rows=await target.$queryRawUnsafe(`SELECT to_jsonb(t) AS data FROM "${table}" t`);
    const data=rows.map(r=>r.data);
    if(table==='tasks') for(const row of data) delete row.request_key;
    assert.equal(checksum(data),checksum(snapshot[table]),`${table} must be preserved`);
    console.log(`Live copy preserved: ${table} (${data.length} rows)`);
  }
} catch(error) { console.error(error.code || error.name, 'Live-copy test failed; source database was only read.'); process.exitCode=1; }
finally { await source.$disconnect(); await target.$disconnect(); }
