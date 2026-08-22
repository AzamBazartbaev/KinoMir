from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

class Genre(models.Model):
    name = models.CharField("название", max_length=100, unique=True)
    slug = models.SlugField(unique=True, allow_unicode=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="genres/", blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "жанр"
        verbose_name_plural = "жанры"

    def __str__(self): return self.name

class Movie(models.Model):
    SOURCE_CHOICES = [(x, x) for x in ["direct", "youtube", "vimeo", "iframe", "external"]]
    VIDEO_CONTENT_CHOICES = [
        ("full_movie", "Полный фильм"),
        ("trailer", "Трейлер"),
        ("clip", "Фрагмент"),
        ("demo", "Демонстрационное видео"),
        ("external", "Внешняя страница"),
    ]
    LICENSE_CHOICES = [
        ("unknown", "Не указана"),
        ("all_rights_reserved", "Все права защищены"),
        ("licensed", "Лицензионное соглашение"),
        ("permission", "Разрешение правообладателя"),
        ("public_domain", "Общественное достояние"),
        ("cc_by", "Creative Commons BY"),
        ("cc_by_sa", "Creative Commons BY-SA"),
        ("cc_by_nc", "Creative Commons BY-NC"),
    ]
    RIGHTS_STATUS_CHOICES = [
        ("pending", "Ожидает проверки"),
        ("verified", "Права подтверждены"),
        ("rejected", "Публикация запрещена"),
    ]
    title = models.CharField("название", max_length=255)
    original_title = models.CharField(max_length=255, blank=True)
    slug = models.SlugField(unique=True, allow_unicode=True)
    description = models.TextField()
    year = models.PositiveSmallIntegerField(validators=[MinValueValidator(1888), MaxValueValidator(2100)])
    country = models.CharField(max_length=100)
    duration = models.PositiveSmallIntegerField(help_text="Минуты")
    age_rating = models.CharField(max_length=10, default="12+")
    director = models.CharField(max_length=255, blank=True)
    actors = models.TextField(blank=True)
    genres = models.ManyToManyField(Genre, related_name="movies")
    poster = models.ImageField(upload_to="movies/posters/", blank=True)
    banner = models.ImageField(upload_to="movies/banners/", blank=True)
    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="external")
    video_content_type = models.CharField("тип видеоматериала", max_length=20, choices=VIDEO_CONTENT_CHOICES, default="trailer")
    video_url = models.URLField(blank=True)
    trailer_url = models.URLField(blank=True)
    rights_holder = models.CharField("правообладатель", max_length=255, blank=True)
    license_type = models.CharField("тип лицензии", max_length=30, choices=LICENSE_CHOICES, default="unknown")
    rights_status = models.CharField("проверка прав", max_length=20, choices=RIGHTS_STATUS_CHOICES, default="pending")
    content_source_url = models.URLField("источник сведений о правах", blank=True)
    poster_attribution = models.CharField("атрибуция постера", max_length=500, blank=True)
    poster_source_url = models.URLField("источник постера", blank=True)
    video_attribution = models.CharField("атрибуция видео", max_length=500, blank=True)
    video_source_url = models.URLField("источник видео", blank=True)
    rights_notes = models.TextField("служебные заметки о правах", blank=True, help_text="В API и на сайте не показываются.")
    is_published = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    views_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "фильм"
        verbose_name_plural = "фильмы"
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(is_published=False)
                    | ~models.Q(video_content_type="full_movie")
                    | (
                        models.Q(rights_status="verified")
                        & ~models.Q(rights_holder="")
                        & ~models.Q(license_type="unknown")
                        & ~models.Q(content_source_url="")
                    )
                ),
                name="published_full_movie_requires_verified_rights",
            )
        ]

    def clean(self):
        super().clean()
        errors = {}
        if self.is_featured and not self.is_published:
            errors["is_featured"] = "В рекомендации можно добавить только опубликованный фильм."
        if self.is_published:
            if not self.rights_holder.strip():
                errors["rights_holder"] = "Для публикации укажите правообладателя."
            if self.license_type == "unknown":
                errors["license_type"] = "Для публикации укажите тип лицензии."
            if not self.content_source_url:
                errors["content_source_url"] = "Для публикации укажите источник сведений о правах."
            if self.poster and not self.poster_attribution.strip():
                errors["poster_attribution"] = "Для опубликованного постера укажите атрибуцию."
            if self.poster and not self.poster_source_url:
                errors["poster_source_url"] = "Для опубликованного постера укажите источник."
            if self.video_url and not self.video_attribution.strip():
                errors["video_attribution"] = "Для опубликованного видео укажите атрибуцию."
            if self.video_url and not self.video_source_url:
                errors["video_source_url"] = "Для опубликованного видео укажите источник."
            if self.video_content_type == "full_movie" and self.rights_status != "verified":
                errors["rights_status"] = "Полный фильм можно публиковать только после подтверждения прав."
        if errors:
            raise ValidationError(errors)

    def __str__(self): return self.title

class Favorite(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favorites")
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="favorited_by")
    created_at = models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "movie"], name="unique_favorite")]

class Rating(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="ratings")
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="ratings")
    value = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "movie"], name="unique_rating")]

class Comment(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="comments")
    movie = models.ForeignKey(Movie, on_delete=models.CASCADE, related_name="comments")
    text = models.CharField(max_length=1000)
    is_approved = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    class Meta:
        ordering = ["-created_at"]
