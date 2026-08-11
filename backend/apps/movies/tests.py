from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from .models import Genre, Movie, Rating
from .video import resolve_video

class ApiTests(APITestCase):
    def setUp(self):
        self.genre = Genre.objects.create(name="Драма", slug="drama")
        self.movie = Movie.objects.create(title="Тест", slug="test", description="Описание", year=2020, country="Кыргызстан", duration=100)
        self.movie.genres.add(self.genre)
        self.user = get_user_model().objects.create_user("user", "user@example.com", "StrongPass123!")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.user).key}")
    def test_catalog_hides_unpublished(self):
        Movie.objects.create(title="Скрыт", slug="hidden", description="x", year=2020, country="x", duration=90, is_published=False)
        response = self.client.get("/api/movies/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
    def test_favorite_toggle(self):
        self.assertTrue(self.client.post("/api/movies/test/favorite/").data["is_favorite"])
        self.assertFalse(self.client.post("/api/movies/test/favorite/").data["is_favorite"])
    def test_rating_updates_single_row(self):
        self.client.put("/api/movies/test/rating/", {"value": 4}, format="json")
        self.client.put("/api/movies/test/rating/", {"value": 5}, format="json")
        self.assertEqual(Rating.objects.count(), 1)
        self.assertEqual(Rating.objects.get().value, 5)
    def test_unsafe_video_is_rejected(self):
        self.assertEqual(resolve_video("external", "javascript:alert(1)")["mode"], "unavailable")

