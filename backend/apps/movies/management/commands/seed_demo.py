import os
from pathlib import Path
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.management.base import BaseCommand
from django.utils.text import slugify
from apps.movies.models import Genre, Movie

MOVIES = [
    ("Побег из Шоушенка", "The Shawshank Redemption", 1994, "США", "Драма", "Два заключённых находят надежду и дружбу за стенами тюрьмы.", "shawshank-redemption.jpg"),
    ("Интерстеллар", "Interstellar", 2014, "США", "Фантастика", "Экспедиция отправляется сквозь космос в поисках нового дома для человечества.", "interstellar.jpg"),
    ("Унесённые призраками", "Spirited Away", 2001, "Япония", "Анимация", "Девочка попадает в загадочный мир духов и ищет путь домой.", "spirited-away.jpg"),
    ("Начало", "Inception", 2010, "США", "Фантастика", "Команда проникает в сны, чтобы внедрить идею в сознание человека.", "inception.jpg"),
    ("1+1", "Intouchables", 2011, "Франция", "Комедия", "Неожиданная дружба меняет жизнь двух очень разных людей.", "intouchables.jpg"),
    ("Паразиты", "Gisaengchung", 2019, "Южная Корея", "Триллер", "Семья постепенно внедряется в дом состоятельных работодателей.", "parasite.jpg"),
]

POSTER_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "posters"

class Command(BaseCommand):
    help = "Создаёт администратора и демонстрационный каталог"
    def handle(self, *args, **kwargs):
        genres = {}
        for name in ["Драма", "Фантастика", "Анимация", "Комедия", "Триллер"]:
            genres[name], _ = Genre.objects.get_or_create(slug=slugify(name, allow_unicode=True), defaults={"name": name})
        for index, (title, original, year, country, genre, description, poster_filename) in enumerate(MOVIES):
            movie, _ = Movie.objects.update_or_create(slug=slugify(title, allow_unicode=True), defaults={
                "title": title, "original_title": original, "year": year, "country": country,
                "duration": 120 + index * 4, "age_rating": "12+", "description": description,
                "director": "Режиссёр фильма", "actors": "Актёрский состав",
                "source_type": "external", "video_url": "https://www.imdb.com/", "is_featured": index == 0,
            })
            movie.genres.set([genres[genre]])
            expected_poster_name = f"movies/posters/{poster_filename}"
            if movie.poster.name != expected_poster_name or not movie.poster.storage.exists(expected_poster_name):
                with (POSTER_DIR / poster_filename).open("rb") as poster_source:
                    movie.poster.save(poster_filename, File(poster_source), save=True)
        username = os.getenv("DJANGO_ADMIN_USERNAME", "admin")
        password = os.getenv("DJANGO_ADMIN_PASSWORD", "admin12345")
        user, created = get_user_model().objects.get_or_create(username=username, defaults={"email": os.getenv("DJANGO_ADMIN_EMAIL", "admin@example.com"), "is_staff": True, "is_superuser": True})
        if created: user.set_password(password); user.save()
        self.stdout.write(self.style.SUCCESS("Демонстрационные данные готовы"))
