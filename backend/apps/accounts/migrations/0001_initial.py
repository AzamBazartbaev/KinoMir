import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name="AccountActionToken",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("purpose", models.CharField(choices=[("password_reset", "Сброс пароля"), ("email_confirmation", "Подтверждение email")], max_length=32)),
                ("token_digest", models.CharField(editable=False, max_length=64, unique=True)),
                ("email", models.EmailField(blank=True, max_length=254)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="account_action_tokens", to=settings.AUTH_USER_MODEL)),
            ],
            options={"verbose_name": "одноразовый токен аккаунта", "verbose_name_plural": "одноразовые токены аккаунта", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="accountactiontoken",
            index=models.Index(fields=["user", "purpose", "used_at"], name="account_token_lookup"),
        ),
    ]
