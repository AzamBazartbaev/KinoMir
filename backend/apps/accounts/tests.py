import re
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import AccountActionToken


User = get_user_model()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    FRONTEND_URL="http://frontend.test",
    PASSWORD_RESET_TIMEOUT=3600,
    EMAIL_CONFIRMATION_TIMEOUT=3600,
)
class AccountLifecycleApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        self.user = User.objects.create_user(username="account-user", email="old@example.com", password="StrongOldPass123!")

    def raw_token_from_last_email(self):
        match = re.search(r"[?&]token=([^\s]+)", mail.outbox[-1].body)
        self.assertIsNotNone(match)
        return match.group(1)

    def authenticate(self):
        token = Token.objects.create(user=self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return token

    def test_password_reset_request_does_not_reveal_account_existence(self):
        known = self.client.post("/api/auth/password-reset/request/", {"email": self.user.email}, format="json")
        known_body = known.data
        self.assertEqual(known.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(len(mail.outbox), 1)

        mail.outbox.clear()
        unknown = self.client.post("/api/auth/password-reset/request/", {"email": "missing@example.com"}, format="json")
        self.assertEqual(unknown.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(unknown.data, known_body)
        self.assertEqual(len(mail.outbox), 0)

    def test_password_reset_token_is_single_use_and_revokes_api_tokens(self):
        api_token = self.authenticate()
        self.client.post("/api/auth/password-reset/request/", {"email": self.user.email}, format="json")
        raw_token = self.raw_token_from_last_email()
        payload = {"token": raw_token, "password": "StrongNewPass456!", "password_confirm": "StrongNewPass456!"}

        first = self.client.post("/api/auth/password-reset/confirm/", payload, format="json")
        self.client.credentials()
        second = self.client.post("/api/auth/password-reset/confirm/", payload, format="json")
        self.user.refresh_from_db()

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(self.user.check_password("StrongNewPass456!"))
        self.assertFalse(Token.objects.filter(key=api_token.key).exists())
        self.assertIsNotNone(AccountActionToken.objects.get(purpose=AccountActionToken.Purpose.PASSWORD_RESET).used_at)

    def test_expired_password_reset_token_is_rejected(self):
        self.client.post("/api/auth/password-reset/request/", {"email": self.user.email}, format="json")
        raw_token = self.raw_token_from_last_email()
        AccountActionToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))

        response = self.client.post("/api/auth/password-reset/confirm/", {
            "token": raw_token,
            "password": "StrongNewPass456!",
            "password_confirm": "StrongNewPass456!",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("StrongOldPass123!"))

    def test_new_email_is_saved_only_after_single_use_confirmation(self):
        self.authenticate()
        requested = self.client.post("/api/auth/email-change/request/", {"email": "new@example.com"}, format="json")
        raw_token = self.raw_token_from_last_email()
        self.user.refresh_from_db()
        self.assertEqual(requested.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(self.user.email, "old@example.com")

        self.client.credentials()
        confirmed = self.client.post("/api/auth/email-change/confirm/", {"token": raw_token}, format="json")
        repeated = self.client.post("/api/auth/email-change/confirm/", {"token": raw_token}, format="json")
        self.user.refresh_from_db()

        self.assertEqual(confirmed.status_code, status.HTTP_200_OK)
        self.assertEqual(repeated.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.user.email, "new@example.com")

    def test_email_templates_are_clear_in_russian_and_kyrgyz(self):
        self.client.post("/api/auth/password-reset/request/", {"email": self.user.email}, format="json")
        password_body = mail.outbox[-1].body
        self.assertIn("восстановление пароля", password_body)
        self.assertIn("сырсөзүн калыбына", password_body)

        mail.outbox.clear()
        self.authenticate()
        self.client.post("/api/auth/email-change/request/", {"email": "new@example.com"}, format="json")
        email_body = mail.outbox[-1].body
        self.assertIn("Подтвердите новый email", email_body)
        self.assertIn("жаңы", email_body)

    def test_email_change_requires_authentication_and_rejects_duplicate(self):
        unauthorized = self.client.post("/api/auth/email-change/request/", {"email": "new@example.com"}, format="json")
        other = User.objects.create_user(username="other", email="taken@example.com", password="StrongOtherPass123!")
        self.authenticate()
        duplicate = self.client.post("/api/auth/email-change/request/", {"email": other.email}, format="json")

        self.assertEqual(unauthorized.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(len(mail.outbox), 0)
