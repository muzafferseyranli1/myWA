import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
const db = new PrismaClient();
const cli = 'node_modules/prisma/build/index.js';
function prisma(args, capture = false, env = process.env) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Prisma ${args[0]} failed (${result.status}); schema was not baselined`);
  return result.stdout;
}
try {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename != '_prisma_migrations'`;
  const migrationTable = await db.$queryRaw`SELECT to_regclass('_prisma_migrations')::text AS name`;
  const history = migrationTable[0].name ? await db.$queryRaw`SELECT migration_name FROM _prisma_migrations` : [];
  if (tables.length && !history.length) {
    // Exact schema comparison precedes marking any existing schema as applied.
    const diff = prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/baseline.prisma', '--to-schema-datamodel', 'prisma/baseline.prisma', '--script'], true);
    if (!diff.includes('This is an empty migration.')) throw new Error('Existing schema differs from prisma/baseline.prisma. Stop and review the difference; no baseline or migration was applied.');
    prisma(['migrate', 'resolve', '--applied', '20260918000000_baseline']);
  }
  prisma(['migrate', 'deploy']);
  // Readiness must not silently accept deployment against the wrong schema.
  const diff = prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], true);
  if (!diff.includes('This is an empty migration.')) throw new Error('Migrated database does not match the application schema');
  // Every user's private schema receives the same migrations.
  const tenants = await db.$queryRaw`SELECT DISTINCT tenant_schema AS schema FROM users WHERE tenant_schema IS NOT NULL AND tenant_schema <> 'public'`;
  for (const { schema } of tenants) {
    if (!/^t_[a-z0-9]{8,32}$/.test(schema)) throw new Error(`Refusing to migrate unexpected schema name: ${schema}`);
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('schema', schema);
    console.log(`Migrating tenant schema ${schema}`);
    prisma(['migrate', 'deploy'], false, { ...process.env, DATABASE_URL: url.href });
  }
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally { await db.$disconnect(); }
