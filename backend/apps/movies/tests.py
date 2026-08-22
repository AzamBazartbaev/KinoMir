from django.contrib.auth import get_user_model
from django.conf import settings
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from .admin import MovieAdminForm, approve_comments, hide_comments, publish_movies
from .models import Comment, Genre, Movie, Rating, WatchProgress
from .video import resolve_video

class ApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.genre = Genre.objects.create(name="Драма", slug="drama")
        self.movie = Movie.objects.create(
            title="Тест", slug="test", description="Описание", year=2020, country="Кыргызстан", duration=100,
            is_published=True, video_content_type="demo", rights_holder="Тестовый правообладатель",
            license_type="licensed", rights_status="pending", content_source_url="https://example.com/rights",
            video_attribution="Тестовое видео", video_source_url="https://example.com/video-source",
        )
        self.movie.genres.add(self.genre)
        self.user = get_user_model().objects.create_user("user", "user@example.com", "StrongPass123!")
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.create(user=self.user).key}")
    def test_catalog_hides_unpublished(self):
        Movie.objects.create(title="Скрыт", slug="hidden", description="x", year=2020, country="x", duration=90, is_published=False)
        response = self.client.get("/api/movies/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_published_movie_has_indexable_seo_page(self):
        response = self.client.get("/films/test/")
        content = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertIn("<title>Тест (2020) — КиноОрдо</title>", content)
        self.assertIn('rel="canonical" href="http://127.0.0.1:3000/films/test/"', content)
        self.assertIn('property="og:type" content="video.movie"', content)
        self.assertIn('name="twitter:card" content="summary_large_image"', content)
        self.assertIn('type="application/ld+json"', content)

    def test_sitemap_contains_only_published_movies(self):
        Movie.objects.create(title="Не опубликован", slug="not-published", description="x", year=2024, country="Кыргызстан", duration=90)
        response = self.client.get("/sitemap.xml")
        content = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml; charset=utf-8")
        self.assertIn("http://127.0.0.1:3000/films/test/", content)
        self.assertNotIn("not-published", content)
        self.assertEqual(self.client.get("/films/not-published/").status_code, 404)

    def test_robots_points_to_sitemap_and_blocks_private_routes(self):
        response = self.client.get("/robots.txt")
        content = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertIn("Disallow: /admin/", content)
        self.assertIn("Disallow: /api/", content)
        self.assertIn("Sitemap: http://127.0.0.1:3000/sitemap.xml", content)
    def test_favorite_toggle(self):
        self.assertTrue(self.client.post("/api/movies/test/favorite/").data["is_favorite"])
        self.assertFalse(self.client.post("/api/movies/test/favorite/").data["is_favorite"])
    def test_rating_updates_single_row(self):
        self.client.put("/api/movies/test/rating/", {"value": 4}, format="json")
        response = self.client.put("/api/movies/test/rating/", {"value": 5}, format="json")
        self.assertEqual(Rating.objects.count(), 1)
        self.assertEqual(Rating.objects.get().value, 5)
        self.assertEqual(response.data["value"], 5)
        self.assertEqual(response.data["rating_avg"], 5.0)
        self.assertEqual(response.data["ratings_count"], 1)

    def test_watch_progress_is_saved_updated_and_restored(self):
        first = self.client.put("/api/movies/test/progress/", {"position_seconds": 31, "duration_seconds": 120}, format="json")
        second = self.client.put("/api/movies/test/progress/", {"position_seconds": 64, "duration_seconds": 120}, format="json")
        detail = self.client.get("/api/movies/test/")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.data["position_seconds"], 64)
        self.assertEqual(second.data["progress_percent"], 53)
        self.assertEqual(WatchProgress.objects.count(), 1)
        self.assertEqual(detail.data["watch_progress"]["position_seconds"], 64)

    def test_watch_history_is_private(self):
        other = get_user_model().objects.create_user("other", "other@example.com", "StrongPass123!")
        WatchProgress.objects.create(user=self.user, movie=self.movie, position_seconds=20, duration_seconds=100)
        WatchProgress.objects.create(user=other, movie=self.movie, position_seconds=80, duration_seconds=100)

        response = self.client.get("/api/watch-history/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["position_seconds"], 20)

        self.client.delete("/api/watch-history/test/")
        self.assertFalse(WatchProgress.objects.filter(user=self.user).exists())
        self.assertTrue(WatchProgress.objects.filter(user=other).exists())

    def test_watch_history_can_be_cleared_without_touching_another_user(self):
        other = get_user_model().objects.create_user("history-other", "history-other@example.com", "StrongPass123!")
        WatchProgress.objects.create(user=self.user, movie=self.movie, position_seconds=10, duration_seconds=100)
        WatchProgress.objects.create(user=other, movie=self.movie, position_seconds=40, duration_seconds=100)

        response = self.client.delete("/api/watch-history/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(WatchProgress.objects.filter(user=self.user).exists())
        self.assertTrue(WatchProgress.objects.filter(user=other).exists())

    def test_empty_comment_is_rejected(self):
        empty = self.client.post("/api/movies/test/comments/", {"text": ""}, format="json")
        whitespace = self.client.post("/api/movies/test/comments/", {"text": "   "}, format="json")
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(whitespace.status_code, 400)
        self.assertEqual(Comment.objects.count(), 0)

    def test_comment_is_created_and_loaded_with_movie(self):
        response = self.client.post("/api/movies/test/comments/", {"text": "  Отличный фильм!  "}, format="json")
        detail = self.client.get("/api/movies/test/")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["text"], "Отличный фильм!")
        self.assertEqual(detail.data["comments"][0]["text"], "Отличный фильм!")
        self.assertEqual(detail.data["comments"][0]["username"], self.user.username)
    def test_unsafe_video_is_rejected(self):
        self.assertEqual(resolve_video("external", "javascript:alert(1)")["mode"], "unavailable")
        self.assertEqual(resolve_video("youtube", "https://evil-youtube.com/watch?v=unsafe")["mode"], "unavailable")
        self.assertEqual(resolve_video("vimeo", "https://example.com/123456")["mode"], "unavailable")

    def test_youtube_urls_are_normalized_only_for_trusted_hosts(self):
        expected = {"mode": "embed", "url": "https://www.youtube.com/embed/abc123_DEF4"}
        self.assertEqual(resolve_video("youtube", "https://www.youtube.com/watch?v=abc123_DEF4"), expected)
        self.assertEqual(resolve_video("youtube", "https://youtu.be/abc123_DEF4"), expected)
        self.assertEqual(resolve_video("youtube", "https://www.youtube.com/shorts/abc123_DEF4"), expected)
        self.assertEqual(resolve_video("youtube", "https://www.youtube.com/embed/abc123_DEF4"), expected)

    def test_direct_video_is_available_to_html5_player(self):
        result = resolve_video("direct", "https://example.com/movie.mp4")
        self.assertEqual(result, {"mode": "html5", "url": "https://example.com/movie.mp4"})

    def test_ayash_trailer_is_available_to_html5_player(self):
        trailer_url = "https://video.kinoafisha.info/video-high/l9ihjxs--3eqq0ky2i_p.mp4"
        result = resolve_video("direct", trailer_url)
        self.assertEqual(result, {"mode": "html5", "url": trailer_url})

    def test_catalog_searches_title_and_description(self):
        Movie.objects.create(title="Другой фильм", slug="other", description="Космическая экспедиция", year=2022, country="США", duration=90, is_published=True)
        by_title = self.client.get("/api/movies/", {"q": "Тест"})
        by_description = self.client.get("/api/movies/", {"q": "экспедиция"})
        self.assertEqual([item["slug"] for item in by_title.data["results"]], ["test"])
        self.assertEqual([item["slug"] for item in by_description.data["results"]], ["other"])

    def test_catalog_localizes_movies_and_keeps_explicit_translations(self):
        self.movie.title_ky = "Сыноо тасмасы"
        self.movie.description_ky = "Кыргызча сүрөттөмө"
        self.movie.save(update_fields=["title_ky", "description_ky"])
        response = self.client.get("/api/movies/", HTTP_ACCEPT_LANGUAGE="ky-KG,ky;q=0.9")
        item = response.data["results"][0]
        self.assertEqual(item["title"], "Сыноо тасмасы")
        self.assertEqual(item["description"], "Кыргызча сүрөттөмө")
        self.assertEqual(item["title_ru"], "Тест")
        self.assertEqual(item["description_ru"], "Описание")

    def test_catalog_uses_russian_fallback_and_searches_kyrgyz(self):
        fallback = self.client.get("/api/movies/", HTTP_ACCEPT_LANGUAGE="ky")
        self.assertEqual(fallback.data["results"][0]["title"], "Тест")
        self.movie.description_ky = "Уникалдуу кыргызча баян"
        self.movie.save(update_fields=["description_ky"])
        search = self.client.get("/api/movies/", {"q": "Уникалдуу"}, HTTP_ACCEPT_LANGUAGE="ky")
        self.assertEqual([item["slug"] for item in search.data["results"]], ["test"])

    def test_catalog_filters_by_genre_and_year(self):
        other_genre = Genre.objects.create(name="Комедия", slug="comedy")
        other = Movie.objects.create(title="Комедия", slug="comedy-movie", description="x", year=2024, country="Франция", duration=95, is_published=True)
        other.genres.add(other_genre)
        response = self.client.get("/api/movies/", {"genre": "comedy", "year": 2024})
        self.assertEqual([item["slug"] for item in response.data["results"]], ["comedy-movie"])

    def test_catalog_sorts_and_paginates(self):
        second = Movie.objects.create(title="Альфа", slug="alpha", description="x", year=2021, country="США", duration=95, is_published=True)
        Rating.objects.create(user=self.user, movie=self.movie, value=5)
        title_response = self.client.get("/api/movies/", {"sort": "title", "page_size": 1})
        newest_response = self.client.get("/api/movies/", {"sort": "newest"})
        rating_response = self.client.get("/api/movies/", {"sort": "rating"})
        self.assertEqual(title_response.data["count"], 2)
        self.assertEqual(title_response.data["results"][0]["slug"], second.slug)
        self.assertIsNotNone(title_response.data["next"])
        self.assertEqual(newest_response.data["results"][0]["slug"], second.slug)
        self.assertEqual(rating_response.data["results"][0]["slug"], self.movie.slug)

    def test_registration_returns_clear_validation_errors(self):
        self.client.credentials()
        short_name = self.client.post("/api/auth/register/", {"username": "ab", "email": "new@example.com", "password": "StrongPass123!"}, format="json")
        duplicate_email = self.client.post("/api/auth/register/", {"username": "new-user", "email": self.user.email, "password": "StrongPass123!"}, format="json")
        self.assertEqual(short_name.status_code, 400)
        self.assertIn("минимум 3 символа", str(short_name.data["username"][0]))
        self.assertEqual(duplicate_email.status_code, 400)
        self.assertIn("уже используется", str(duplicate_email.data["email"][0]))

    def test_registration_and_login_return_user_session(self):
        self.client.credentials()
        registration = self.client.post("/api/auth/register/", {"username": "new-user", "email": "new@example.com", "password": "StrongPass123!"}, format="json")
        login = self.client.post("/api/auth/login/", {"username": "new-user", "password": "StrongPass123!"}, format="json")
        self.assertEqual(registration.status_code, 201)
        self.assertEqual(registration.data["user"]["email"], "new@example.com")
        self.assertTrue(registration.data["token"])
        self.assertEqual(login.status_code, 200)
        self.assertTrue(login.data["token"])

    def test_profile_is_protected_and_returns_user_data(self):
        self.client.credentials()
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {Token.objects.get(user=self.user).key}")
        response = self.client.get("/api/auth/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], self.user.username)
        self.assertEqual(response.data["email"], self.user.email)

    def test_logout_invalidates_token(self):
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)

    def test_movie_detail_exposes_legal_metadata_without_internal_notes(self):
        self.movie.rights_notes = "Внутренняя проверка договора"
        self.movie.save(update_fields=["rights_notes"])
        response = self.client.get("/api/movies/test/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["legal"]["rights_holder"], "Тестовый правообладатель")
        self.assertEqual(response.data["legal"]["video_content_type"], "demo")
        self.assertNotIn("rights_notes", response.data["legal"])

    def test_full_movie_requires_verified_rights(self):
        movie = Movie(
            title="Полный фильм", slug="full-movie", description="Описание", year=2024,
            country="Кыргызстан", duration=90, is_published=True, video_content_type="full_movie",
            source_type="direct", video_url="https://example.com/movie.mp4",
            rights_holder="Студия", license_type="licensed", rights_status="pending",
            content_source_url="https://example.com/rights", video_attribution="Фильм — Студия",
            video_source_url="https://example.com/source",
        )
        with self.assertRaises(ValidationError):
            movie.full_clean()
        movie.rights_status = "verified"
        movie.full_clean()

    def test_database_blocks_unverified_published_full_movie(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Movie.objects.create(
                title="Обход проверки", slug="bypass", description="Описание", year=2024,
                country="Кыргызстан", duration=90, is_published=True, video_content_type="full_movie",
                rights_holder="Студия", license_type="licensed", rights_status="pending",
                content_source_url="https://example.com/rights",
            )

    def test_anonymous_and_authenticated_limits_are_different(self):
        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        self.assertEqual(rates["anon"], "60/min")
        self.assertEqual(rates["user"], "240/min")

    def test_login_throttle_logs_repeated_violations(self):
        self.client.credentials()
        payload = {"username": "unknown", "password": "WrongPass123!"}
        allowed = [self.client.post("/api/auth/login/", payload, format="json") for _ in range(5)]
        self.assertTrue(all(response.status_code == 400 for response in allowed))
        with self.assertLogs("security", level="WARNING") as captured:
            blocked = self.client.post("/api/auth/login/", payload, format="json")
            repeated = self.client.post("/api/auth/login/", payload, format="json")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(repeated.status_code, 429)
        self.assertTrue(any("scope=login" in message and "repeated=True" in message for message in captured.output))

    def test_register_has_a_stricter_limit(self):
        self.client.credentials()
        invalid_payload = {"username": "ab", "email": "bad", "password": "short"}
        allowed = [self.client.post("/api/auth/register/", invalid_payload, format="json") for _ in range(3)]
        blocked = self.client.post("/api/auth/register/", invalid_payload, format="json")
        self.assertTrue(all(response.status_code == 400 for response in allowed))
        self.assertEqual(blocked.status_code, 429)
        self.assertIn("Retry-After", blocked.headers)

    def test_comment_throttle_allows_normal_use_then_blocks_spam(self):
        allowed = [self.client.post("/api/movies/test/comments/", {"text": f"Комментарий {index}"}, format="json") for index in range(10)]
        blocked = self.client.post("/api/movies/test/comments/", {"text": "Спам"}, format="json")
        self.assertTrue(all(response.status_code == 201 for response in allowed))
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(Comment.objects.filter(user=self.user).count(), 10)


class AdminTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.genre = Genre.objects.create(name="Драма", slug="drama")
        self.movie = Movie.objects.create(
            title="Админ-фильм", slug="admin-movie", description="Описание", year=2024,
            country="Кыргызстан", duration=90, video_url="https://example.com/movie.mp4", is_published=True,
            video_content_type="demo", rights_holder="Студия", license_type="licensed",
            content_source_url="https://example.com/rights", video_attribution="Демо",
            video_source_url="https://example.com/source",
        )
        self.movie.genres.add(self.genre)
        user_model = get_user_model()
        self.regular_user = user_model.objects.create_user("regular", "regular@example.com", "StrongPass123!")
        self.staff_user = user_model.objects.create_user("staff", "staff@example.com", "StrongPass123!", is_staff=True)
        self.superuser = user_model.objects.create_superuser("root", "root@example.com", "StrongPass123!")

    def movie_form_data(self, **overrides):
        data = {
            "title": "Новый фильм", "original_title": "New Movie", "slug": "new-movie",
            "description": "Полное описание", "year": 2025, "country": "Кыргызстан",
            "duration": 100, "age_rating": "12+", "genres": [self.genre.pk],
            "director": "Режиссёр", "actors": "Актёр", "source_type": "direct",
            "video_url": "https://example.com/video.mp4", "trailer_url": "",
            "video_content_type": "demo", "rights_holder": "Студия", "license_type": "licensed",
            "rights_status": "pending", "content_source_url": "https://example.com/rights",
            "poster_attribution": "", "poster_source_url": "", "video_attribution": "Демо — Студия",
            "video_source_url": "https://example.com/source", "rights_notes": "",
            "is_published": True, "is_featured": False,
        }
        data.update(overrides)
        return data

    def test_published_movie_requires_safe_video_url(self):
        missing = MovieAdminForm(data=self.movie_form_data(video_url=""))
        unsafe = MovieAdminForm(data=self.movie_form_data(video_url="ftp://example.com/video.mp4"))
        wrong_type = MovieAdminForm(data=self.movie_form_data(source_type="direct", video_url="https://www.youtube.com/watch?v=abc123"))
        untrusted_iframe = MovieAdminForm(data=self.movie_form_data(source_type="iframe", video_url="https://example.com/embed/123"))
        hidden_featured = MovieAdminForm(data=self.movie_form_data(is_published=False, is_featured=True))
        valid = MovieAdminForm(data=self.movie_form_data())
        self.assertFalse(missing.is_valid())
        self.assertIn("опубликованного фильма", str(missing.errors["video_url"][0]))
        self.assertFalse(unsafe.is_valid())
        self.assertIn("http:// или https://", str(unsafe.errors["video_url"][0]))
        self.assertFalse(wrong_type.is_valid())
        self.assertIn("не соответствует выбранному типу", str(wrong_type.errors["video_url"][0]))
        self.assertFalse(untrusted_iframe.is_valid())
        self.assertIn("домен не поддерживается", str(untrusted_iframe.errors["video_url"][0]))
        self.assertFalse(hidden_featured.is_valid())
        self.assertIn("только опубликованный", str(hidden_featured.errors["is_featured"][0]))
        self.assertTrue(valid.is_valid(), valid.errors)

    def test_publish_action_skips_movies_with_invalid_sources(self):
        valid = Movie.objects.create(title="Можно публиковать", slug="valid-source", description="Описание", year=2024, country="Кыргызстан", duration=90, source_type="direct", video_url="https://example.com/movie.mp4", video_content_type="demo", rights_holder="Студия", license_type="licensed", content_source_url="https://example.com/rights", video_attribution="Демо", video_source_url="https://example.com/source", is_published=False)
        invalid = Movie.objects.create(title="Нельзя публиковать", slug="invalid-source", description="Описание", year=2024, country="Кыргызстан", duration=90, source_type="direct", video_url="https://example.com/watch", is_published=False)
        publish_movies(None, None, Movie.objects.filter(pk__in=[valid.pk, invalid.pk]))
        valid.refresh_from_db()
        invalid.refresh_from_db()
        self.assertTrue(valid.is_published)
        self.assertFalse(invalid.is_published)

    def test_admin_requires_staff_and_model_permissions(self):
        self.client.force_login(self.regular_user)
        regular_response = self.client.get(reverse("admin:index"))
        self.assertEqual(regular_response.status_code, 302)
        self.assertIn(reverse("admin:login"), regular_response.url)

        self.client.force_login(self.staff_user)
        self.assertEqual(self.client.get(reverse("admin:index")).status_code, 200)
        self.assertEqual(self.client.get(reverse("admin:movies_movie_changelist")).status_code, 403)

        self.client.force_login(self.superuser)
        self.assertEqual(self.client.get(reverse("admin:movies_movie_changelist")).status_code, 200)
        self.assertEqual(self.client.get(reverse("admin:movies_comment_changelist")).status_code, 200)
        self.assertEqual(self.client.get(reverse("admin:auth_user_changelist")).status_code, 200)

    def test_comment_moderation_actions(self):
        comment = Comment.objects.create(user=self.regular_user, movie=self.movie, text="Комментарий")
        hide_comments(None, None, Comment.objects.filter(pk=comment.pk))
        comment.refresh_from_db()
        self.assertFalse(comment.is_approved)
        self.assertEqual(self.client.get(f"/api/movies/{self.movie.slug}/").data["comments"], [])
        approve_comments(None, None, Comment.objects.filter(pk=comment.pk))
        comment.refresh_from_db()
        self.assertTrue(comment.is_approved)
        self.assertEqual(self.client.get(f"/api/movies/{self.movie.slug}/").data["comments"][0]["text"], comment.text)
