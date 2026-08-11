# КиноМир — DRF API + отдельный Frontend

Проект разделён на два независимых приложения:

- `backend/` — Django 5 + Django REST Framework, SQLite, Token Authentication, Swagger/OpenAPI и Django Admin;
- `frontend/` — статическое SPA на HTML/CSS/Vanilla JS, которое получает все данные только через REST API;
- `docker-compose.yml` — контейнеры backend и frontend с постоянными volumes для БД и media.

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

Демонстрационные постеры получены из публичного каталога [The Movie Database (TMDB)](https://www.themoviedb.org/). Изображения используются только в учебном проекте; права принадлежат их владельцам.

## API

| Метод | URL | Назначение | Доступ |
|---|---|---|---|
| GET | `/api/health/` | Проверка сервиса | Все |
| GET | `/api/genres/` | Активные жанры | Все |
| GET | `/api/movies/` | Каталог, фильтры, поиск, пагинация | Все |
| GET | `/api/movies/{slug}/` | Карточка фильма | Все |
| POST | `/api/auth/register/` | Регистрация, выдаёт token | Все |
| POST | `/api/auth/login/` | Вход, выдаёт token | Все |
| POST | `/api/auth/logout/` | Удаление текущего token | Token |
| GET | `/api/auth/me/` | Текущий пользователь | Token |
| GET | `/api/favorites/` | Избранные фильмы | Token |
| POST | `/api/movies/{slug}/favorite/` | Переключить избранное | Token |
| PUT | `/api/movies/{slug}/rating/` | Поставить/изменить оценку 1–5 | Token |
| POST | `/api/movies/{slug}/comments/` | Добавить комментарий | Token |

Параметры `GET /api/movies/`: `q`, `genre`, `year`, `country`, `age_rating`, `sort`, `page`. Сортировки: `newest`, `year_desc`, `year_asc`, `title`, `rating`, `popular`.

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

Frontend можно открыть через любой статический HTTP-сервер; при локальном запуске `config.js` автоматически использует `http://localhost:8000/api`.
