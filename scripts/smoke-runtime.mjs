import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const url=new URL(process.env.TEST_DATABASE_URL || '');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/mywa_test'));
url.searchParams.set('schema','smoke_'+Date.now());
const port='3069';
const env={...process.env,NODE_ENV:'production',DATABASE_URL:url.href,JWT_SECRET:'smoke-test-only',APP_URL:`http://127.0.0.1:${port}`,PORT:port,WAHA_API_URL:'http://127.0.0.1:1',WAHA_API_KEY:'smoke-test-only',WAHA_WEBHOOK_SECRET:'smoke-test-only',UPLOAD_DIR:'temp/smoke-uploads'};
const migrated=spawnSync(process.execPath,['scripts/migrate-safe.mjs'],{env,encoding:'utf8'});
if(migrated.status!==0)throw new Error(migrated.stderr||migrated.stdout);
const child=spawn(process.execPath,['--import','tsx','server/index.ts'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env});
let logs=''; child.stdout.on('data',d=>logs+=d); child.stderr.on('data',d=>logs+=d);
try {
  let ready=false;
  for(let attempt=0;attempt<100;attempt++) {
    if(child.exitCode!==null) throw new Error('Runtime exited before readiness');
    try { const r=await fetch(`http://127.0.0.1:${port}/ready`); if(r.ok){ const body=await r.json();assert.equal(body.status,'degraded');assert.equal(body.database,'ok');assert.equal(body.workers,true);ready=true;break; } } catch {}
    await new Promise(r=>setTimeout(r,200));
  }
  assert.ok(ready,'Runtime readiness was not reached');
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status,200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/notifications`)).status,401);
  console.log('Production runtime smoke passed: health 200, readiness degraded 200 during WAHA outage, APIs require authentication');
} catch(error) { console.error(error.message,logs.slice(-1500));process.exitCode=1; }
finally { child.kill('SIGTERM'); await new Promise(r=>child.once('close',r)); }
