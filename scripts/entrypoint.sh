#!/bin/sh
set -eu
node scripts/migrate-safe.mjs || true
node --import tsx prisma/seed.ts || true
exec node --import tsx server/index.ts
