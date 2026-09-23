import { PrismaClient } from '@prisma/client';
import { currentTenant, systemDb } from './tenant';

/**
 * Tenant-bound Prisma client.
 * Every access resolves to the client of the tenant active in the current
 * async context (see lib/tenant.ts) and throws when there is none, so data can
 * never be read without an explicit tenant. Use `systemDb()` for the users table.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = currentTenant().db as any;
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export { systemDb };
export default prisma;
