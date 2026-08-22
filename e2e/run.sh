#!/usr/bin/env sh
set -eu

cleanup() {
  docker compose -f docker-compose.e2e.yml down --volumes --remove-orphans
}
trap cleanup EXIT INT TERM

docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e
