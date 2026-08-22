from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("movies", "0003_movie_and_genre_kyrgyz_translations"),
    ]

    operations = [
        migrations.CreateModel(
            name="WatchProgress",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("position_seconds", models.PositiveIntegerField(default=0)),
                ("duration_seconds", models.PositiveIntegerField(default=0)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("movie", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="watch_progress", to="movies.movie")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="watch_history", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-updated_at", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="watchprogress",
            constraint=models.UniqueConstraint(fields=("user", "movie"), name="unique_watch_progress"),
        ),
    ]
