#!/usr/bin/env bash
set -euo pipefail

# MyWA Production Backup Script
# Creates a full, timestamped archive of the database and all Docker volumes.

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-./backups/backup_${TIMESTAMP}}"
mkdir -p "${BACKUP_DIR}"

echo "=========================================="
echo " Starting MyWA Full Backup: ${TIMESTAMP}"
echo " Destination: ${BACKUP_DIR}"
echo "=========================================="

# 1. PostgreSQL Database Dump (using pg_dump inside running container)
echo "[1/4] Dumping PostgreSQL database..."
if docker ps --format '{{.Names}}' | grep -q "^mywa-db$"; then
  DB_USER=$(docker exec mywa-db printenv POSTGRES_USER || echo "mywa")
  DB_NAME=$(docker exec mywa-db printenv POSTGRES_DB || echo "mywa")
  docker exec mywa-db pg_dump -U "${DB_USER}" -Fc "${DB_NAME}" > "${BACKUP_DIR}/mywa_db.dump"
  echo "  -> DB dump created successfully ($(du -h "${BACKUP_DIR}/mywa_db.dump" | cut -f1))"
else
  echo "  -> WARNING: mywa-db container is not running; skipping live DB dump."
fi

# 2. Uploads Volume Backup
echo "[2/4] Archiving mywa_uploads volume..."
if docker volume inspect mywa_uploads >/dev/null 2>&1; then
  docker run --rm -v mywa_uploads:/data:ro -v "$(cd "${BACKUP_DIR}" && pwd)":/backup alpine tar -czf /backup/mywa_uploads.tar.gz -C /data .
  echo "  -> mywa_uploads archive created ($(du -h "${BACKUP_DIR}/mywa_uploads.tar.gz" | cut -f1))"
else
  echo "  -> mywa_uploads volume not found; skipping."
fi

# 3. WAHA Sessions Volume Backup
echo "[3/4] Archiving mywa_waha_sessions volume..."
if docker volume inspect mywa_waha_sessions >/dev/null 2>&1; then
  docker run --rm -v mywa_waha_sessions:/data:ro -v "$(cd "${BACKUP_DIR}" && pwd)":/backup alpine tar -czf /backup/mywa_waha_sessions.tar.gz -C /data .
  echo "  -> mywa_waha_sessions archive created ($(du -h "${BACKUP_DIR}/mywa_waha_sessions.tar.gz" | cut -f1))"
else
  echo "  -> mywa_waha_sessions volume not found; skipping."
fi

# 4. Media Cache Volume Backup
echo "[4/4] Archiving mywa_media volume..."
if docker volume inspect mywa_media >/dev/null 2>&1; then
  docker run --rm -v mywa_media:/data:ro -v "$(cd "${BACKUP_DIR}" && pwd)":/backup alpine tar -czf /backup/mywa_media.tar.gz -C /data .
  echo "  -> mywa_media archive created ($(du -h "${BACKUP_DIR}/mywa_media.tar.gz" | cut -f1))"
else
  echo "  -> mywa_media volume not found; skipping."
fi

echo "=========================================="
echo " Backup completed successfully!"
ls -lh "${BACKUP_DIR}"
echo "=========================================="
