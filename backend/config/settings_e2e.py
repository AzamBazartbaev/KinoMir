import os

from .settings import *  # noqa: F403


DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "kinomir_e2e"),
        "USER": os.getenv("POSTGRES_USER", "kinomir_e2e"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "kinomir-e2e-password"),
        "HOST": os.getenv("POSTGRES_HOST", "db"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": 0,
    }
}

# Ускоряет создание уникальных пользователей в браузерных тестах.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
