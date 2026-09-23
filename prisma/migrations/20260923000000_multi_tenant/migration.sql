-- Tenant isolation. Every user owns exactly one PostgreSQL schema and one WAHA session.
ALTER TABLE "users" ADD COLUMN "tenant_schema" TEXT;
ALTER TABLE "users" ADD COLUMN "waha_session" TEXT;
ALTER TABLE "users" ADD COLUMN "self_phone" TEXT;
ALTER TABLE "users" ADD COLUMN "self_lid" TEXT;
ALTER TABLE "users" ADD COLUMN "self_name" TEXT;
CREATE UNIQUE INDEX "users_waha_session_key" ON "users"("waha_session");

-- The data that already exists belongs to the first administrator. Any other
-- existing account is left without a tenant so it can no longer read that data;
-- an administrator must provision it explicitly. The WAHA session name is
-- assigned at startup from WAHA_SESSION_NAME. This block only runs in the main
-- schema (the one DATABASE_URL points at); per-user schemas (t_*) start empty.
UPDATE "users" SET
  "tenant_schema" = 'public',
  "self_phone" = '905332760534',
  "self_lid" = '31933115404296@lid',
  "self_name" = 'Muzaffer'
WHERE current_schema() NOT LIKE 't\_%'
  AND "id" = (SELECT "id" FROM "users" WHERE "role" = 'ADMIN' ORDER BY "created_at" ASC LIMIT 1);
