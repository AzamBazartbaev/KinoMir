import os
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils.text import slugify
from apps.movies.models import Genre, Movie

MOVIES = [
    ("Побег из Шоушенка", "The Shawshank Redemption", 1994, "США", "Драма", "Два заключённых находят надежду и дружбу за стенами тюрьмы."),
    ("Интерстеллар", "Interstellar", 2014, "США", "Фантастика", "Экспедиция отправляется сквозь космос в поисках нового дома для человечества."),
    ("Унесённые призраками", "Spirited Away", 2001, "Япония", "Анимация", "Девочка попадает в загадочный мир духов и ищет путь домой."),
    ("Начало", "Inception", 2010, "США", "Фантастика", "Команда проникает в сны, чтобы внедрить идею в сознание человека."),
    ("1+1", "Intouchables", 2011, "Франция", "Комедия", "Неожиданная дружба меняет жизнь двух очень разных людей."),
    ("Паразиты", "Gisaengchung", 2019, "Южная Корея", "Триллер", "Семья постепенно внедряется в дом состоятельных работодателей."),
]

class Command(BaseCommand):
    help = "Создаёт администратора и демонстрационный каталог"
    def handle(self, *args, **kwargs):
        genres = {}
        for name in ["Драма", "Фантастика", "Анимация", "Комедия", "Триллер"]:
            genres[name], _ = Genre.objects.get_or_create(slug=slugify(name, allow_unicode=True), defaults={"name": name})
        for index, (title, original, year, country, genre, description) in enumerate(MOVIES):
            movie, _ = Movie.objects.update_or_create(slug=slugify(title, allow_unicode=True), defaults={
                "title": title, "original_title": original, "year": year, "country": country,
                "duration": 120 + index * 4, "age_rating": "12+", "description": description,
                "director": "Режиссёр фильма", "actors": "Актёрский состав",
                "source_type": "external", "video_url": "https://www.imdb.com/", "is_featured": index == 0,
            })
            movie.genres.set([genres[genre]])
        username = os.getenv("DJANGO_ADMIN_USERNAME", "admin")
        password = os.getenv("DJANGO_ADMIN_PASSWORD", "admin12345")
        user, created = get_user_model().objects.get_or_create(username=username, defaults={"email": os.getenv("DJANGO_ADMIN_EMAIL", "admin@example.com"), "is_staff": True, "is_superuser": True})
        if created: user.set_password(password); user.save()
        self.stdout.write(self.style.SUCCESS("Демонстрационные данные готовы"))

