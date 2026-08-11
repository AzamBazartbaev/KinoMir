from django.contrib import admin
from .models import Comment, Favorite, Genre, Movie, Rating

@admin.register(Genre)
class GenreAdmin(admin.ModelAdmin):
    list_display = ["name", "is_active"]
    prepopulated_fields = {"slug": ("name",)}

@admin.register(Movie)
class MovieAdmin(admin.ModelAdmin):
    list_display = ["title", "year", "is_published", "is_featured", "views_count"]
    list_filter = ["is_published", "is_featured", "source_type", "genres", "year"]
    search_fields = ["title", "original_title", "director", "actors"]
    prepopulated_fields = {"slug": ("title",)}
    filter_horizontal = ["genres"]
    readonly_fields = ["views_count", "created_at", "updated_at"]

admin.site.register([Favorite, Rating, Comment])
admin.site.site_header = "КиноМир — управление"

