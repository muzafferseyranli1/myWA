import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
const db = new PrismaClient();
const cli = 'node_modules/prisma/build/index.js';
function prisma(args, capture = false) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', env: process.env });
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
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally { await db.$disconnect(); }
