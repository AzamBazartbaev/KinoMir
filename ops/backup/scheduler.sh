#!/usr/bin/env sh
set -eu

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

: "${BACKUP_CRON:=0 3 * * *}"
printf '%s %s\n' "$BACKUP_CRON" '/usr/local/bin/backup.sh >> /proc/1/fd/1 2>> /proc/1/fd/2' > /etc/crontabs/root

if [ "${BACKUP_RUN_ON_START:-false}" = "true" ]; then
  /usr/local/bin/backup.sh
fi

exec crond -f -l 2
