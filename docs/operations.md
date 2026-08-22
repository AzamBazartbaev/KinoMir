# Эксплуатация КиноОрдо

Этот runbook описывает production-мониторинг, оповещения и восстановление данных. Секреты хранятся только в `.env.production` на сервере; файл не коммитится.

## 1. Мониторинг ошибок

1. Создайте Python/Django-проект в Sentry.
2. Запишите DSN в `SENTRY_DSN`, окружение в `SENTRY_ENVIRONMENT`, а версию релиза в `SENTRY_RELEASE`.
3. После публикации вызовите контролируемое исключение в staging и убедитесь, что событие появилось в Sentry. Персональные данные по умолчанию не отправляются (`send_default_pii=False`).

Django экспортирует внутренние метрики по адресу `/metrics`. Этот путь не проксируется наружу и доступен Prometheus только в закрытой Docker-сети.

## 2. Внешняя проверка и алерты

Создайте HTTPS endpoint, совместимый с Alertmanager webhook, и укажите его в `ALERT_WEBHOOK_URL`. Затем запустите production вместе с ops-профилем:

```bash
ENV_FILE=.env.production docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops up -d --build
```

Prometheus получает метрики Django, а Blackbox Exporter проверяет публичный `https://DOMAIN/api/health/`. Настроены алерты:

- внешний endpoint недоступен дольше 2 минут;
- health-check отвечает HTTP 5xx дольше минуты;
- Prometheus не видит backend дольше 2 минут;
- доля HTTP 5xx Django превышает 5% в течение 5 минут.

Дополнительная независимая проверка выполняется GitHub Actions каждые пять минут. В настройках репозитория создайте переменную `PRODUCTION_URL`, например `https://kino.example.com`. Включите уведомления GitHub Actions для неуспешных workflow.

Проверка конфигураций:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops exec prometheus promtool check config /etc/prometheus/prometheus.yml
docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops exec prometheus promtool check rules /etc/prometheus/alerts.yml
docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops exec alertmanager amtool check-config /etc/alertmanager/alertmanager.yml
```

Тестовое уведомление (оно должно прийти в настроенный webhook):

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops exec alertmanager \
  amtool --alertmanager.url=http://127.0.0.1:9093 alert add alertname=KinoMirTestAlert severity=warning \
  --annotation=summary="Тест канала оповещений"
```

Prometheus и Alertmanager намеренно не публикуют порты. Для диагностики используйте SSH port forwarding или `docker compose exec`.

## 3. Резервные копии

Контейнер `backup` ежедневно в 03:00 создаёт согласованный `pg_dump` PostgreSQL и копирует volume `media` в зашифрованный Restic-репозиторий. Поддерживаются Amazon S3 и S3-совместимые Backblaze B2, Wasabi или MinIO.

Минимальные настройки: `RESTIC_REPOSITORY`, отдельный длинный `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Ключ S3 должен иметь доступ только к отдельному bucket резервных копий. Bucket должен находиться вне production-сервера, иметь TLS, versioning/Object Lock и запрет публичного доступа.

Политика хранения по умолчанию: 7 ежедневных, 4 еженедельных и 12 ежемесячных снимков. Она настраивается через `BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY`. После каждого задания Restic проверяет часть данных репозитория.

Запуск резервной копии вручную:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops run --rm backup /usr/local/bin/backup.sh
```

## 4. Тестовое восстановление

Проверяйте восстановление не реже одного раза в месяц и после изменения схемы. Команда восстанавливает последний snapshot в новый временный каталог и новую временную БД, проверяет архив, выполняет `pg_restore`, читает таблицу миграций и считает media-файлы. Production-база не изменяется; временная БД удаляется автоматически.

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml --profile ops run --rm backup /usr/local/bin/restore-test.sh
```

Успех заканчивается строкой `Restore test passed`. Зафиксируйте дату, snapshot ID, число media-файлов и имя проверяющего в журнале эксплуатации. При ошибке не удаляйте последний рабочий snapshot и создайте incident.

### Проверка реализации

22 августа 2026 года сценарий проверен локально на изолированных PostgreSQL 17 и Restic-репозитории: создан снимок БД и media, выполнено восстановление в отдельную БД, запрос к `django_migrations` прошёл, временная БД удалена. Перед production-публикацией тест необходимо повторить уже с настроенным внешним S3 bucket.
