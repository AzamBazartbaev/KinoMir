from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("genres/", views.GenreListView.as_view()),
    path("movies/", views.MovieListView.as_view()),
    path("movies/<str:slug>/poster/<int:width>.<str:image_format>", views.poster_variant, name="movie-poster-variant"),
    path("movies/<str:slug>/", views.MovieDetailView.as_view()),
    path("movies/<str:slug>/favorite/", views.favorite),
    path("movies/<str:slug>/rating/", views.rating),
    path("movies/<str:slug>/comments/", views.comment),
    path("movies/<str:slug>/progress/", views.watch_progress),
    path("auth/register/", views.register), path("auth/login/", views.login), path("auth/logout/", views.logout), path("auth/me/", views.me),
    path("favorites/", views.favorites),
    path("watch-history/", views.watch_history),
    path("watch-history/<str:slug>/", views.delete_watch_history_item),
]
