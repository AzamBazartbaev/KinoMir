from urllib.parse import urlparse

from django import forms
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.core.exceptions import ValidationError
from django.db.models import Count
from django.utils.html import format_html

from .models import Comment, Favorite, Genre, Movie, Rating
from .video import resolve_video

User = get_user_model()


class MovieAdminForm(forms.ModelForm):
    class Meta:
        model = Movie
        fields = "__all__"
        exclude = ["views_count"]
        widgets = {
            "description": forms.Textarea(attrs={"rows": 5}),
            "actors": forms.Textarea(attrs={"rows": 3}),
        }

    def clean(self):
        cleaned = super().clean()
        video_url = cleaned.get("video_url")
        if cleaned.get("is_published") and not video_url:
            self.add_error("video_url", "Для опубликованного фильма укажите ссылку на видео.")
        if cleaned.get("is_featured") and not cleaned.get("is_published"):
            self.add_error("is_featured", "В рекомендации можно добавить только опубликованный фильм.")
        for field_name in ("video_url", "trailer_url"):
            value = cleaned.get(field_name)
            if value and urlparse(value).scheme not in {"http", "https"}:
                self.add_error(field_name, "Разрешены только безопасные ссылки http:// или https://.")
        if video_url and urlparse(video_url).scheme in {"http", "https"} and resolve_video(cleaned.get("source_type"), video_url)["mode"] == "unavailable":
            self.add_error("video_url", "Ссылка не соответствует выбранному типу источника или домен не поддерживается.")
        return cleaned


@admin.action(description="Опубликовать выбранные фильмы")
def publish_movies(modeladmin, request, queryset):
    updated = 0
    skipped = 0
    for movie in queryset:
        movie.is_published = True
        source_is_valid = resolve_video(movie.source_type, movie.video_url)["mode"] != "unavailable"
        try:
            if not source_is_valid:
                raise ValidationError("Недоступный источник видео.")
            movie.full_clean()
        except ValidationError:
            skipped += 1
            continue
        movie.save(update_fields=["is_published", "updated_at"])
        updated += 1
    if request is not None:
        modeladmin.message_user(request, f"Опубликовано фильмов: {updated}. Пропущено без подтверждённых прав или корректного источника: {skipped}.")


@admin.action(description="Подтвердить права на выбранные фильмы")
def verify_rights(modeladmin, request, queryset):
    ready = queryset.exclude(rights_holder="").exclude(license_type="unknown").exclude(content_source_url="")
    updated = ready.update(rights_status="verified")
    if request is not None:
        modeladmin.message_user(request, f"Права подтверждены для фильмов: {updated}. Записи без обязательных реквизитов пропущены.")


@admin.action(description="Снять выбранные фильмы с публикации")
def unpublish_movies(modeladmin, request, queryset):
    queryset.update(is_published=False, is_featured=False)


@admin.action(description="Добавить выбранные фильмы в рекомендации")
def feature_movies(modeladmin, request, queryset):
    queryset.filter(is_published=True).update(is_featured=True)


@admin.action(description="Убрать выбранные фильмы из рекомендаций")
def unfeature_movies(modeladmin, request, queryset):
    queryset.update(is_featured=False)


@admin.register(Genre)
class GenreAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "movies_total", "is_active"]
    list_display_links = ["name", "slug"]
    list_editable = ["is_active"]
    list_filter = ["is_active"]
    search_fields = ["name", "slug", "description"]
    prepopulated_fields = {"slug": ("name",)}
    ordering = ["name"]
    save_on_top = True
    list_per_page = 30

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_movies_total=Count("movies", distinct=True))

    @admin.display(description="Фильмов", ordering="_movies_total")
    def movies_total(self, obj):
        return obj._movies_total


@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    form = MovieAdminForm
    list_display = ["title", "year", "country", "video_content_type", "rights_status_badge", "is_published", "is_featured", "views_count", "updated_at"]
    list_display_links = ["title"]
    list_editable = ["is_published", "is_featured"]
    list_filter = ["rights_status", "license_type", "video_content_type", "is_published", "is_featured", "source_type", "genres", "country", "year", "age_rating"]
    search_fields = ["title", "original_title", "description", "director", "actors", "country", "rights_holder"]
    prepopulated_fields = {"slug": ("title",)}
    filter_horizontal = ["genres"]
    readonly_fields = ["poster_preview", "views_count", "created_at", "updated_at"]
    date_hierarchy = "created_at"
    save_on_top = True
    list_per_page = 30
    actions = [verify_rights, publish_movies, unpublish_movies, feature_movies, unfeature_movies]
    fieldsets = [
        ("Основная информация", {"fields": ("title", "original_title", "slug", "description")}),
        ("Каталог", {"fields": (("year", "duration", "age_rating"), "country", "genres", "director", "actors")}),
        ("Изображения", {"fields": ("poster", "poster_preview", "banner", "poster_attribution", "poster_source_url")}),
        ("Видео", {"fields": (("video_content_type", "source_type"), "video_url", "trailer_url", "video_attribution", "video_source_url"), "description": "Используйте только ссылки http:// или https://."}),
        ("Права и лицензия", {"fields": (("rights_status", "license_type"), "rights_holder", "content_source_url", "rights_notes"), "description": "Полный фильм нельзя опубликовать, пока статус прав не подтверждён."}),
        ("Публикация", {"fields": (("is_published", "is_featured"), "views_count", ("created_at", "updated_at"))}),
    ]

    @admin.display(description="Права", ordering="rights_status")
    def rights_status_badge(self, obj):
        colors = {"verified": "#238636", "pending": "#9e6a03", "rejected": "#da3633"}
        return format_html(
            '<span style="display:inline-block;padding:3px 8px;border-radius:999px;color:#fff;background:{}">{}</span>',
            colors.get(obj.rights_status, "#6e7681"),
            obj.get_rights_status_display(),
        )

    @admin.display(description="Текущий постер")
    def poster_preview(self, obj):
        if not obj.poster:
            return "Постер не загружен"
        return format_html('<img src="{}" alt="" style="width:120px;border-radius:10px" />', obj.poster.url)


@admin.action(description="Одобрить выбранные комментарии")
def approve_comments(modeladmin, request, queryset):
    queryset.update(is_approved=True)


@admin.action(description="Скрыть выбранные комментарии")
def hide_comments(modeladmin, request, queryset):
    queryset.update(is_approved=False)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ["short_text", "user", "movie", "is_approved", "created_at"]
    list_display_links = ["short_text"]
    list_editable = ["is_approved"]
    list_filter = ["is_approved", "created_at", "movie"]
    search_fields = ["text", "user__username", "user__email", "movie__title"]
    autocomplete_fields = ["user", "movie"]
    readonly_fields = ["created_at", "updated_at"]
    date_hierarchy = "created_at"
    list_select_related = ["user", "movie"]
    actions = [approve_comments, hide_comments]
    list_per_page = 40

    @admin.display(description="Комментарий")
    def short_text(self, obj):
        return obj.text if len(obj.text) <= 70 else f"{obj.text[:67]}…"


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ["user", "movie", "created_at"]
    list_filter = ["created_at"]
    search_fields = ["user__username", "user__email", "movie__title"]
    autocomplete_fields = ["user", "movie"]
    readonly_fields = ["created_at"]
    list_select_related = ["user", "movie"]
    date_hierarchy = "created_at"


@admin.register(Rating)
class RatingAdmin(admin.ModelAdmin):
    list_display = ["user", "movie", "value", "updated_at"]
    list_editable = ["value"]
    list_filter = ["value", "updated_at"]
    search_fields = ["user__username", "user__email", "movie__title"]
    autocomplete_fields = ["user", "movie"]
    readonly_fields = ["updated_at"]
    list_select_related = ["user", "movie"]
    date_hierarchy = "updated_at"


admin.site.unregister(User)


@admin.register(User)
class KinoUserAdmin(UserAdmin):
    list_display = ["username", "email", "is_active", "is_staff", "favorites_total", "comments_total", "date_joined"]
    list_filter = ["is_active", "is_staff", "is_superuser", "groups", "date_joined"]
    search_fields = ["username", "email", "first_name", "last_name"]
    ordering = ["-date_joined"]
    readonly_fields = ["last_login", "date_joined"]
    date_hierarchy = "date_joined"
    list_per_page = 30

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _favorites_total=Count("favorites", distinct=True),
            _comments_total=Count("comments", distinct=True),
        )

    @admin.display(description="Избранное", ordering="_favorites_total")
    def favorites_total(self, obj):
        return obj._favorites_total

    @admin.display(description="Комментарии", ordering="_comments_total")
    def comments_total(self, obj):
        return obj._comments_total


admin.site.site_header = "КиноОрдо — управление"
admin.site.site_title = "КиноОрдо Admin"
admin.site.index_title = "Управление каталогом и пользователями"
