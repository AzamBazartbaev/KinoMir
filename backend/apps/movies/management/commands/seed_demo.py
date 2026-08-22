import os
from pathlib import Path
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.management.base import BaseCommand
from django.utils.text import slugify
from apps.movies.models import Genre, Movie

MOVIES = [
    {
        "title": "Курманжан Датка",
        "original_title": "Kurmanjan Datka: Queen of the Mountains",
        "year": 2014,
        "duration": 135,
        "age_rating": "16+",
        "genre": "Тарыхый драма",
        "description": "Историческая драма о Курманжан Датке — женщине, ставшей правительницей и символом стойкости кыргызского народа.",
        "director": "Садык Шер-Нияз",
        "actors": "Элина Абай кызы, Назира Мамбетова, Азиз Мурадиллаев",
        "poster": "kurmanjan-datka.jpg",
        "source_url": "https://www.imdb.com/title/tt2640460/",
    },
    {
        "title": "Бешкемпир",
        "original_title": "The Adopted Son",
        "year": 1998,
        "duration": 81,
        "age_rating": "12+",
        "genre": "Драма",
        "description": "Тонкая история взросления мальчика в кыргызском селе, его первой любви, дружбе и поиске собственного места в семье.",
        "director": "Актан Арым Кубат",
        "actors": "Мирлан Абдыкалыков, Адир Абылкасымов, Мырза Сабыров",
        "poster": "beshkempir.jpg",
        "source_url": "https://www.imdb.com/title/tt0166503/",
    },
    {
        "title": "Салам, Нью-Йорк!",
        "original_title": "Salam, New York!",
        "year": 2013,
        "duration": 127,
        "age_rating": "12+",
        "genre": "Комедия",
        "description": "Молодой кыргызстанец приезжает в Нью-Йорк вслед за мечтой и учится не терять себя вдали от дома.",
        "director": "Руслан Акун",
        "actors": "Бектемир Мамаюсупов, Эльдар Айтматов, Асель Садвакасова",
        "poster": "salam-new-york.jpg",
        "source_url": "https://www.imdb.com/title/tt2598064/",
    },
    {
        "title": "Аяш 1",
        "original_title": "Ayash",
        "year": 2021,
        "duration": 94,
        "age_rating": "12+",
        "genre": "Комедия",
        "description": "Бакыт и Каныкей собираются развестись и отправляются на Иссык-Куль, но поломка машины сводит их с необычной семьёй Койчубековых и превращает дорогу в череду комичных приключений.",
        "director": "Бакыт Осмонканов",
        "actors": "Бакыт Осмонканов, Жениш Майрамбеков, Калипа Таштанова, Динара Багышбаева",
        "poster": "ayash-original.png",
        "source_type": "direct",
        "video_url": "https://video.kinoafisha.info/video-high/l9ihjxs--3eqq0ky2i_p.mp4",
        "source_url": "https://www.kinoafisha.info/en/trailers/69d509205c29d198c216cb36a1ad85f4/",
    },
    {
        "title": "Дарак ыры",
        "original_title": "The Song of the Tree",
        "year": 2018,
        "duration": 93,
        "age_rating": "12+",
        "genre": "Музыкалык драма",
        "description": "Музыкальная легенда о любви, чести и цене выбора, рассказанная на фоне величественной природы Кыргызстана.",
        "director": "Айбек Дайырбеков",
        "actors": "Омурбек Израилов, Салтанат Бакаева, Темирлан Сманбеков",
        "poster": "song-of-the-tree.jpg",
        "source_url": "https://www.imdb.com/title/tt7372628/",
    },
    {
        "title": "Асманга чуркоо",
        "original_title": "Running to the Sky",
        "year": 2019,
        "duration": 88,
        "age_rating": "6+",
        "genre": "Үй-бүлөлүк драма",
        "description": "Двенадцатилетний Жекшен отлично бегает и мечтает о большой победе, способной изменить жизнь его семьи.",
        "director": "Мирлан Абдыкалыков",
        "actors": "Темирлан Асанкадыров, Руслан Орозакунов, Мээрим Атантаева",
        "poster": "running-to-the-sky.jpg",
        "source_url": "https://www.imdb.com/title/tt10907844/",
    },
    {
        "title": "Бейиш — эненин таманында",
        "original_title": "Heaven Is Beneath Mother's Feet",
        "year": 2024,
        "duration": 140,
        "age_rating": "16+",
        "genre": "Драма",
        "description": "Адиль отправляется в долгий путь к Мекке вместе с матерью, превращая путешествие в историю безусловной любви и преданности.",
        "director": "Руслан Акун",
        "actors": "Эмиль Эсеналиев, Анаркуль Назаркулова",
        "poster": "paradise-under-mothers-feet.jpg",
        "source_url": "https://www.imdb.com/title/tt31940684/",
    },
]

LEGACY_MOVIE_SLUGS = {
    "побег-из-шоушенка", "интерстеллар", "унесённые-призраками",
    "начало", "11", "паразиты",
}

POSTER_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "posters"

class Command(BaseCommand):
    help = "Создаёт администратора и демонстрационный каталог"
    def handle(self, *args, **kwargs):
        Movie.objects.filter(slug__in=LEGACY_MOVIE_SLUGS).delete()
        genres = {}
        for name in sorted({movie["genre"] for movie in MOVIES}):
            genres[name], _ = Genre.objects.get_or_create(slug=slugify(name, allow_unicode=True), defaults={"name": name})
        for index, movie_data in enumerate(MOVIES):
            is_ayash = movie_data["title"] == "Аяш 1"
            video_source_url = movie_data["source_url"] if is_ayash else "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video"
            movie, _ = Movie.objects.update_or_create(slug=slugify(movie_data["title"], allow_unicode=True), defaults={
                "title": movie_data["title"], "original_title": movie_data["original_title"],
                "year": movie_data["year"], "country": "Кыргызстан", "duration": movie_data["duration"],
                "age_rating": movie_data["age_rating"], "description": movie_data["description"],
                "director": movie_data["director"], "actors": movie_data["actors"],
                "source_type": movie_data.get("source_type", "direct"),
                "video_url": movie_data.get("video_url", "https://mdn.github.io/shared-assets/videos/flower.mp4"),
                "video_content_type": "trailer" if is_ayash else "demo",
                "rights_holder": "Создатели фильма — правообладатель уточняется",
                "license_type": "all_rights_reserved",
                "rights_status": "pending",
                "content_source_url": movie_data["source_url"],
                "poster_attribution": f"Постер и сведения о фильме «{movie_data['title']}» — страница источника",
                "poster_source_url": movie_data["source_url"],
                "video_attribution": "Трейлер фильма «Аяш 1» — Киноафиша" if is_ayash else "Демонстрационное видео flower.mp4 — MDN Web Docs; не является фрагментом фильма",
                "video_source_url": video_source_url,
                "is_published": True,
                "is_featured": index == 0,
            })
            movie.genres.set([genres[movie_data["genre"]]])
            expected_poster_name = f"movies/posters/{movie_data['poster']}"
            if movie.poster.name != expected_poster_name or not movie.poster.storage.exists(expected_poster_name):
                with (POSTER_DIR / movie_data["poster"]).open("rb") as poster_source:
                    movie.poster.save(movie_data["poster"], File(poster_source), save=True)
        username = os.getenv("DJANGO_ADMIN_USERNAME", "admin")
        password = os.getenv("DJANGO_ADMIN_PASSWORD", "admin12345")
        user, created = get_user_model().objects.get_or_create(username=username, defaults={"email": os.getenv("DJANGO_ADMIN_EMAIL", "admin@example.com"), "is_staff": True, "is_superuser": True})
        if created: user.set_password(password); user.save()
        self.stdout.write(self.style.SUCCESS("Демонстрационные данные готовы"))
