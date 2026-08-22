#!/bin/sh
set -eu

: "${ALERT_WEBHOOK_URL:?ALERT_WEBHOOK_URL is required}"
envsubst '${ALERT_WEBHOOK_URL}' < /etc/alertmanager/alertmanager.yml.template > /etc/alertmanager/alertmanager.yml

exec /bin/alertmanager \
  --config.file=/etc/alertmanager/alertmanager.yml \
  --storage.path=/alertmanager \
  --enable-feature=utf8-strict-mode
