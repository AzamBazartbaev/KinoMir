#!/usr/bin/env bash
set -Eeuo pipefail

required=(RESTIC_REPOSITORY RESTIC_PASSWORD POSTGRES_HOST POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD)
for name in "${required[@]}"; do
  [[ -n "${!name:-}" ]] || { echo "Required variable $name is empty" >&2; exit 1; }
done
if [[ "$RESTIC_REPOSITORY" == s3:* ]]; then
  [[ -n "${AWS_ACCESS_KEY_ID:-}" && -n "${AWS_SECRET_ACCESS_KEY:-}" ]] || {
    echo "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required for S3 repositories" >&2
    exit 1
  }
fi

exec 9>/tmp/kinomir-backup.lock
flock -n 9 || { echo "Another backup is already running"; exit 0; }

staging="$(mktemp -d /tmp/kinomir-backup.XXXXXX)"
trap 'rm -rf "$staging"' EXIT
export PGPASSWORD="$POSTGRES_PASSWORD"

echo "Creating consistent PostgreSQL dump..."
pg_dump --host="$POSTGRES_HOST" --port="${POSTGRES_PORT:-5432}" \
  --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" \
  --format=custom --compress=6 --no-owner --no-acl \
  --file="$staging/database.dump"

if ! restic snapshots >/dev/null 2>&1; then
  echo "Initializing encrypted Restic repository..."
  restic init
fi

echo "Uploading database and media snapshot..."
restic backup "$staging/database.dump" /media --tag kinomir --host "${BACKUP_HOST:-kinomir-production}"
restic forget --tag kinomir --prune \
  --keep-daily "${BACKUP_KEEP_DAILY:-7}" \
  --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" \
  --keep-monthly "${BACKUP_KEEP_MONTHLY:-12}"
restic check --read-data-subset="${BACKUP_CHECK_SUBSET:-5%}"
echo "Backup completed successfully."
