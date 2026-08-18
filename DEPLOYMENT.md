# Production deployment

This configuration targets a Linux VPS with Docker Engine, Docker Compose v2 and a public domain. Caddy terminates HTTPS, nginx serves the frontend and static/media files, Django runs under Gunicorn, and PostgreSQL stores application data.

## 1. Prepare the server

1. Point the domain's DNS `A`/`AAAA` record to the server.
2. Allow inbound TCP ports `22`, `80`, `443` and UDP port `443`; keep PostgreSQL and Django ports closed publicly.
3. Install Docker Engine with the Compose plugin and clone this repository.
4. Copy the environment template:

   ```bash
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```

5. Replace every example value. Generate secrets on the server, for example:

   ```bash
   openssl rand -base64 48
   ```

   `DOMAIN`, `DJANGO_ALLOWED_HOSTS`, CSRF and CORS origins must describe the same public HTTPS host. Never commit `.env.production`.

## 2. Validate and deploy

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml build --pull
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend python manage.py check --deploy
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Migrations and `collectstatic` run automatically before Gunicorn starts. Demo data is disabled by default. Caddy obtains and renews the TLS certificate after DNS resolves and ports 80/443 are reachable.

`check --deploy` may report `security.W021` while `DJANGO_SECURE_HSTS_PRELOAD=False`. Keep it disabled until HTTPS is confirmed for the domain and every subdomain; only then enable preload deliberately.

Verify:

```bash
curl --fail --show-error https://YOUR_DOMAIN/api/health/
curl --fail --show-error https://YOUR_DOMAIN/
```

## 3. Update

Create a backup before every deployment, then deploy a reviewed commit or tag:

```bash
mkdir -p backups
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > "backups/db-$(date +%F-%H%M%S).sql.gz"
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T backend tar -czf - -C /app media > "backups/media-$(date +%F-%H%M%S).tar.gz"

git fetch --tags origin
git checkout YOUR_REVIEWED_TAG_OR_COMMIT
docker compose --env-file .env.production -f docker-compose.prod.yml build --pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Keep backups outside the server as well. Check `docker compose ... logs --tail=200` and both health URLs after the update.

## 4. Rollback

Application rollback:

```bash
git checkout PREVIOUS_GOOD_TAG_OR_COMMIT
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

If the failed release introduced incompatible database migrations, stop the application and restore the matching database backup:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml stop backend frontend
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
gunzip -c backups/DB_BACKUP.sql.gz | docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Restore the media archive that belongs to the same backup when media files changed. Database and media backups must be treated as one restore point.
