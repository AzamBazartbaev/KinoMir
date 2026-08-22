# КиноОрдо — кыргыз киносу, DRF API + отдельный Frontend

Проект разделён на два независимых приложения:

- `backend/` — Django 5 + Django REST Framework, SQLite, Token Authentication, Swagger/OpenAPI и Django Admin;
- `frontend/` — статическое SPA на HTML/CSS/Vanilla JS, которое получает все данные только через REST API;
- `docker-compose.yml` — контейнеры backend, frontend и Redis с постоянными volumes для БД и media.

В Docker frontend проксирует запросы `/api/` во внутренний контейнер backend, поэтому браузеру достаточно открыть только порт `3000`.

## Запуск через Docker

```bash
copy .env.example .env
docker compose up --build
```

После запуска:

- Frontend: http://localhost:3000
- REST API: http://localhost:8001/api/
- Swagger UI: http://localhost:8001/api/docs/
- OpenAPI schema: http://localhost:8001/api/schema/
- Django Admin: http://localhost:8001/admin/

При старте автоматически выполняются миграции, создаются демонстрационные фильмы и администратор. Логин и пароль берутся из `.env` (`admin` / `admin12345` в примере).

Демонстрационные постеры кыргызских фильмов получены из публичных карточек [The Movie Database (TMDB)](https://www.themoviedb.org/), IMDb, Kinoafisha, Afisha Ufa и Pluto Film. Изображения хранятся локально и используются только в учебном проекте; права принадлежат их владельцам.

Для «Аяш 1» используется оригинальный учебный постер, созданный специально для этого каталога с вымышленными персонажами. Вместо полного фильма встроен трейлер [Киноафиши](https://www.kinoafisha.info/movies/8367299/video/) длительностью 1:29. Он воспроизводится в HTML5-плеере KinoOrdo с регулировкой скорости и полноэкранным режимом.

Для демонстрации возможностей видеоплеера используется открытый MP4-пример `flower.mp4` из [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video). Он не является содержимым перечисленных фильмов и нужен только для учебной проверки управления воспроизведением.

Интерфейс рассчитан на медленную или нестабильную сеть: используются skeleton-экраны и индикаторы загрузки, запросы ограничены тайм-аутом, а ошибки `401`, `403`, `404`, `429` и `5xx` показываются понятными сообщениями. После сбоя страницу можно загрузить повторно одной кнопкой.

### Защита API от спама

Лимиты хранятся в общем Redis-кэше, поэтому действуют сразу для всех Gunicorn-процессов. По умолчанию разрешено `60/min` анонимных и `240/min` авторизованных запросов; для входа — `5/min`, регистрации — `3/hour`, комментариев — `10/min`. Значения настраиваются переменными `DRF_THROTTLE_*`. Блокировка возвращает HTTP `429` и заголовок `Retry-After`. Повторные нарушения записываются логгером `security`: локально также в `backend/data/security.log`, в production — в журнал контейнера.

## API

| Метод | URL | Назначение | Доступ |
|---|---|---|---|
| GET | `/api/health/` | Проверка сервиса | Все |
| GET | `/api/genres/` | Активные жанры | Все |
| GET | `/api/movies/` | Каталог, фильтры, поиск, пагинация и локализация `ru`/`ky` | Все |
| GET | `/api/movies/{slug}/` | Карточка фильма | Все |
| POST | `/api/auth/register/` | Регистрация, выдаёт token | Все |
| POST | `/api/auth/login/` | Вход, выдаёт token | Все |
| POST | `/api/auth/logout/` | Удаление текущего token | Token |
| GET | `/api/auth/me/` | Текущий пользователь | Token |
| POST | `/api/auth/password-reset/request/` | Запросить письмо восстановления | Все |
| POST | `/api/auth/password-reset/confirm/` | Установить пароль по одноразовому токену | Все |
| POST | `/api/auth/email-change/request/` | Запросить смену email | Token |
| POST | `/api/auth/email-change/confirm/` | Подтвердить новый email | Все |
| GET | `/api/favorites/` | Избранные фильмы | Token |
| POST | `/api/movies/{slug}/favorite/` | Переключить избранное | Token |
| PUT | `/api/movies/{slug}/rating/` | Поставить/изменить оценку 1–5 | Token |
| POST | `/api/movies/{slug}/comments/` | Добавить комментарий | Token |

Параметры `GET /api/movies/`: `q`, `genre`, `year`, `country`, `age_rating`, `sort`, `page`, `lang`. Сортировки: `newest`, `year_desc`, `year_asc`, `title`, `rating`, `popular`. Язык также определяется по заголовку `Accept-Language`; если кыргызский перевод отсутствует, API возвращает русский текст.

Для закрытых методов передаётся заголовок:

```http
Authorization: Token <token>
Content-Type: application/json
```

## Локальный backend без Docker

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo
python manage.py runserver
```

Проверки:

```bash
python manage.py check
python manage.py test
```

Полный браузерный E2E-набор запускает отдельные PostgreSQL, Redis, backend и frontend, не используя рабочую базу:

```powershell
.\e2e\run.ps1
```

Playwright проверяет каталог, поиск, фильм, регистрацию, вход/выход, восстановление аккаунта, подтверждение email, избранное, рейтинг и комментарии. При падении screenshot, trace и видео сохраняются в `e2e/artifacts`, HTML-отчёт — в `e2e/reports`. Тот же набор автоматически выполняется в GitHub Actions.

Frontend можно открыть через любой статический HTTP-сервер; при локальном запуске `config.js` автоматически использует `http://localhost:8000/api`.

Production-мониторинг, алерты, резервные копии и тестовое восстановление описаны в [docs/operations.md](docs/operations.md).
