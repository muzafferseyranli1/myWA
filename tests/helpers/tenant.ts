import base from 'node:test';
import type { Tenant } from '../../server/lib/tenant';
import { runWithTenant } from '../../server/lib/tenant';

/** A tenant without a database, for unit tests that never reach PostgreSQL. */
export function fakeTenant(id = 'unit-tenant'): Tenant {
  const db = new Proxy({}, { get: () => { throw new Error('No database in unit tests'); } }) as any;
  return { id, username: id, schema: 'public', session: 'default', db, self: { phone: null, lid: null, name: null }, scoped: new Map() };
}

/** node:test's `test`, with every test body running inside one fake tenant. */
export function tenantTest(tenant = fakeTenant()) {
  return (name: string, fn: (t: any) => void | Promise<void>) => base(name, t => runWithTenant(tenant, () => fn(t)));
}
