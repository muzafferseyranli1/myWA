import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const url = new URL(process.env.TEST_DATABASE_URL || '');
assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/mywa_test'), 'Use an isolated local mywa_test database');
url.searchParams.set('schema',`integration_${Date.now()}`);
const env={...process.env,DATABASE_URL:url.href,TEST_DATABASE_URL:url.href};
const migration=spawnSync(process.execPath,['scripts/migrate-safe.mjs'],{env,encoding:'utf8'});
if(migration.status!==0){console.error(migration.stderr || migration.stdout);process.exit(1);}
const result=spawnSync(process.execPath,['--import','tsx','--test','tests/integration.test.ts'],{env,stdio:'inherit'});
process.exitCode=result.status || 0;
