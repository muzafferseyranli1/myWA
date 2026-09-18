// Metadata only: does not select/export application rows or modify the database.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const url=new URL(process.env.DATABASE_URL || '');
url.searchParams.set('connect_timeout','5'); url.searchParams.set('pool_timeout','5');
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-schema-datasource','prisma/baseline.prisma','--to-schema-datamodel','prisma/baseline.prisma','--script'],{env:{...process.env,DATABASE_URL:url.href},encoding:'utf8',timeout:30000});
if(result.status!==0) { console.error('Live schema metadata could not be inspected'); process.exitCode=1; }
else {
  const matches=result.stdout.includes('This is an empty migration.');
  fs.mkdirSync('temp',{recursive:true}); fs.writeFileSync('temp/live-schema-diff.sql',result.stdout);
  console.log(matches?'Live schema matches the legacy baseline':'Live schema differs from baseline; review temp/live-schema-diff.sql before any upgrade');
  if(!matches) process.exitCode=2;
}
