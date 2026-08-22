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

restore_dir="$(mktemp -d /tmp/kinomir-restore.XXXXXX)"
test_db="kinomir_restore_test_$(date +%s)_$$"
export PGPASSWORD="$POSTGRES_PASSWORD"
cleanup() {
  dropdb --if-exists --host="$POSTGRES_HOST" --port="${POSTGRES_PORT:-5432}" --username="$POSTGRES_USER" "$test_db" >/dev/null 2>&1 || true
  rm -rf "$restore_dir"
}
trap cleanup EXIT

echo "Checking repository and restoring the latest snapshot..."
restic check
restic restore latest --tag kinomir --target "$restore_dir"
dump_file="$(find "$restore_dir" -type f -name database.dump -print -quit)"
[[ -n "$dump_file" ]] || { echo "database.dump is missing in restored snapshot" >&2; exit 1; }
pg_restore --list "$dump_file" >/dev/null

createdb --host="$POSTGRES_HOST" --port="${POSTGRES_PORT:-5432}" --username="$POSTGRES_USER" "$test_db"
pg_restore --exit-on-error --no-owner --no-acl \
  --host="$POSTGRES_HOST" --port="${POSTGRES_PORT:-5432}" \
  --username="$POSTGRES_USER" --dbname="$test_db" "$dump_file"
psql --host="$POSTGRES_HOST" --port="${POSTGRES_PORT:-5432}" \
  --username="$POSTGRES_USER" --dbname="$test_db" \
  --set=ON_ERROR_STOP=1 --command='SELECT COUNT(*) AS applied_migrations FROM django_migrations;' >/dev/null

media_count="$(find "$restore_dir" -path '*/media/*' -type f | wc -l | tr -d ' ')"
echo "Restore test passed: PostgreSQL opened successfully; restored media files: $media_count."
