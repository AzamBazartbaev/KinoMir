#!/bin/sh
set -eu

: "${DOMAIN:?DOMAIN is required}"
envsubst '${DOMAIN}' < /etc/prometheus/prometheus.yml.template > /etc/prometheus/prometheus.yml

exec /bin/prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time="${PROMETHEUS_RETENTION:-15d}" \
  --web.enable-lifecycle
