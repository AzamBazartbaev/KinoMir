from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health),
    path("genres/", views.GenreListView.as_view()),
    path("movies/", views.MovieListView.as_view()),
    path("movies/<str:slug>/", views.MovieDetailView.as_view()),
    path("movies/<str:slug>/favorite/", views.favorite),
    path("movies/<str:slug>/rating/", views.rating),
    path("movies/<str:slug>/comments/", views.comment),
    path("auth/register/", views.register), path("auth/login/", views.login), path("auth/logout/", views.logout), path("auth/me/", views.me),
    path("favorites/", views.favorites),
]

