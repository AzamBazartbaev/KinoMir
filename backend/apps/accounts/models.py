from django.conf import settings
from django.db import models
from django.utils import timezone


class AccountActionToken(models.Model):
    class Purpose(models.TextChoices):
        PASSWORD_RESET = "password_reset", "Сброс пароля"
        EMAIL_CONFIRMATION = "email_confirmation", "Подтверждение email"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="account_action_tokens")
    purpose = models.CharField(max_length=32, choices=Purpose.choices)
    token_digest = models.CharField(max_length=64, unique=True, editable=False)
    email = models.EmailField(blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "purpose", "used_at"], name="account_token_lookup")]
        verbose_name = "одноразовый токен аккаунта"
        verbose_name_plural = "одноразовые токены аккаунта"

    @property
    def is_valid(self):
        return self.used_at is None and self.expires_at > timezone.now()

    def __str__(self):
        return f"{self.get_purpose_display()}: {self.user}"
