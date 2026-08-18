#!/bin/sh
set -e

python manage.py migrate --noinput
python manage.py collectstatic --noinput

if [ "${DJANGO_SEED_DEMO:-false}" = "true" ]; then
    python manage.py seed_demo
fi

if [ "$#" -gt 0 ]; then
    exec "$@"
fi

exec gunicorn config.wsgi:application \
    --bind 0.0.0.0:8000 \
    --workers "${GUNICORN_WORKERS:-2}" \
    --timeout "${GUNICORN_TIMEOUT:-60}" \
    --access-logfile - \
    --error-logfile -
