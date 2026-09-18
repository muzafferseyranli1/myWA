#!/bin/sh
set -eu
node scripts/validate-waha-image.mjs
node scripts/migrate-safe.mjs
node --import tsx prisma/seed.ts
exec node --import tsx server/index.ts
