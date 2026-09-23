import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient, User } from '@prisma/client';

/**
 * Tenant isolation.
 *
 * Every user owns one PostgreSQL schema and one WAHA session. All WhatsApp data
 * (chats, messages, tasks, queues) lives inside that schema, so a query can only
 * ever see the data of the tenant whose client executed it.
 *
 * The tenant is carried implicitly through AsyncLocalStorage. `currentTenant()`
 * throws when no tenant is active, so code that forgets to establish a tenant
 * fails closed instead of reading somebody else's data.
 */
export interface Tenant {
  /** The owning user's id. */
  id: string;
  username: string;
  schema: string;
  session: string;
  db: PrismaClient;
  self: { phone: string | null; lid: string | null; name: string | null };
  /** Per-tenant singletons created through tenantScoped(). */
  scoped: Map<string, unknown>;
}

const storage = new AsyncLocalStorage<Tenant>();
// 'public' names the main schema DATABASE_URL points at (the pre-existing data);
// every other user gets a dedicated t_* schema.
const SCHEMA = /^(public|t_[a-z0-9]{8,32})$/;
const SESSION = /^[a-zA-Z0-9_-]{1,64}$/;

function schemaUrl(schema: string) {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('schema', schema);
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
  return url.href;
}

let system: PrismaClient | null = null;
/** Client for the public schema. Only for the users table and system-wide checks. */
export function systemDb(): PrismaClient {
  if (!system) {
    const g = globalThis as any;
    system = g._mywaSystemPrisma ||= new PrismaClient({ log: ['error'] });
  }
  return system!;
}

export function runWithTenant<T>(tenant: Tenant, fn: () => T): T {
  return storage.run(tenant, fn);
}

export function currentTenant(): Tenant {
  const tenant = storage.getStore();
  if (!tenant) throw new Error('Tenant context missing');
  return tenant;
}

export function maybeTenant(): Tenant | undefined {
  return storage.getStore();
}

/**
 * Returns an object that forwards every property access to the instance that
 * belongs to the current tenant, creating it on first use.
 */
export function tenantScoped<T extends object>(key: string, create: (tenant: Tenant) => T): T {
  const instance = () => {
    const tenant = currentTenant();
    let value = tenant.scoped.get(key) as T | undefined;
    if (!value) { value = create(tenant); tenant.scoped.set(key, value); }
    return value;
  };
  return new Proxy({} as T, {
    get(_target, prop) {
      const target = instance() as any;
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(_target, prop, value) {
      (instance() as any)[prop] = value;
      return true;
    },
  });
}

// ─── Registry ─────────────────────────────────────────

const tenants = new Map<string, Tenant>();

function build(user: User, existing?: Tenant): Tenant {
  if (!user.tenantSchema || !SCHEMA.test(user.tenantSchema)) throw new Error('Invalid tenant schema');
  if (!user.wahaSession || !SESSION.test(user.wahaSession)) throw new Error('Invalid WAHA session');
  if (existing && existing.schema === user.tenantSchema && existing.session === user.wahaSession) {
    existing.self = { phone: user.selfPhone, lid: user.selfLid, name: user.selfName };
    existing.username = user.username;
    return existing;
  }
  return {
    id: user.id,
    username: user.username,
    schema: user.tenantSchema,
    session: user.wahaSession,
    db: user.tenantSchema === 'public' ? systemDb() : new PrismaClient({ datasources: { db: { url: schemaUrl(user.tenantSchema) } }, log: ['error'] }),
    self: { phone: user.selfPhone, lid: user.selfLid, name: user.selfName },
    scoped: existing?.scoped ?? new Map(),
  };
}

/** Reloads all active, provisioned users from the public schema. */
export async function loadTenants() {
  const users = await systemDb().user.findMany({ where: { isActive: true, tenantSchema: { not: null }, wahaSession: { not: null } } });
  const seen = new Set<string>();
  for (const user of users) {
    try {
      tenants.set(user.id, build(user, tenants.get(user.id)));
      seen.add(user.id);
    } catch (error: any) {
      console.error(`[tenant] Skipping user ${user.username}:`, error.message);
    }
  }
  for (const [id, tenant] of tenants) {
    if (seen.has(id)) continue;
    tenants.delete(id);
    if (tenant.db !== systemDb()) void tenant.db.$disconnect().catch(() => {});
  }
  return listTenants();
}

export function listTenants(): Tenant[] {
  return [...tenants.values()];
}

export function tenantForUser(userId: string): Tenant | undefined {
  return tenants.get(userId);
}

export function tenantForSession(session: string): Tenant | undefined {
  return listTenants().find(t => t.session === session);
}

/**
 * Runs `fn` once for every tenant, each inside its own context. A failing tenant
 * does not stop the others; the first error is rethrown afterwards so callers
 * can apply their backoff.
 */
export async function forEachTenant(fn: (tenant: Tenant) => Promise<unknown>) {
  let first: unknown = null;
  for (const tenant of listTenants()) {
    try { await runWithTenant(tenant, () => fn(tenant)); }
    catch (error) { first ??= error; }
  }
  if (first) throw first;
}

/** Updates the WhatsApp identity learned from WAHA (used to recognise own messages). */
export async function updateSelf(tenant: Tenant, self: { phone?: string | null; lid?: string | null; name?: string | null }) {
  const next = {
    phone: self.phone ?? tenant.self.phone,
    lid: self.lid ?? tenant.self.lid,
    name: self.name ?? tenant.self.name,
  };
  if (next.phone === tenant.self.phone && next.lid === tenant.self.lid && next.name === tenant.self.name) return;
  tenant.self = next;
  await systemDb().user.update({ where: { id: tenant.id }, data: { selfPhone: next.phone, selfLid: next.lid, selfName: next.name } });
}

// ─── Provisioning ─────────────────────────────────────

/** Applies all Prisma migrations to one schema. */
export function migrateSchema(schema: string) {
  if (!SCHEMA.test(schema)) throw new Error('Invalid tenant schema');
  const cli = path.resolve('node_modules/prisma/build/index.js');
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: schemaUrl(schema) },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Migration of ${schema} failed: ${(result.stderr || result.stdout || '').slice(-500)}`);
}

/**
 * Gives a user their own schema and WAHA session. The user row must already
 * exist in the public schema. Safe to call again after a partial failure.
 */
export async function provisionTenant(userId: string) {
  const db = systemDb();
  let user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.tenantSchema || !user.wahaSession) {
    const key = randomBytes(6).toString('hex');
    user = await db.user.update({ where: { id: userId }, data: { tenantSchema: user.tenantSchema || `t_${key}`, wahaSession: user.wahaSession || `u_${key}` } });
  }
  const schema = user.tenantSchema!;
  if (schema !== 'public') {
    await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    migrateSchema(schema);
    // Mirror row keeps Task.created_by referentially valid inside the tenant schema.
    // It cannot be used to log in: authentication only reads the public schema.
    await db.$executeRawUnsafe(
      `INSERT INTO "${schema}"."users" (id, username, password_hash, display_name, role, is_active, updated_at)
       VALUES ($1, $2, '!', $3, 'USER', true, NOW()) ON CONFLICT (id) DO NOTHING`,
      user.id, user.username, user.displayName,
    );
  }
  await loadTenants();
  return tenantForUser(userId);
}

/**
 * Assigns the legacy WAHA session to the tenant that owns the public schema.
 * Runs at startup so existing installations keep their paired WhatsApp.
 */
export async function bootstrapLegacyTenant() {
  const db = systemDb();
  const owner = await db.user.findFirst({ where: { tenantSchema: 'public' }, orderBy: { createdAt: 'asc' } });
  if (owner && !owner.wahaSession) {
    const session = process.env.WAHA_SESSION_NAME || 'default';
    const holder = await db.user.findUnique({ where: { wahaSession: session } });
    if (!holder) await db.user.update({ where: { id: owner.id }, data: { wahaSession: session } });
  }
  return loadTenants();
}
