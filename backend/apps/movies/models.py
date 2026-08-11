from django.conf import settings
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
    video_url = models.URLField(blank=True)
    trailer_url = models.URLField(blank=True)
    is_published = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    views_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "фильм"
        verbose_name_plural = "фильмы"

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

