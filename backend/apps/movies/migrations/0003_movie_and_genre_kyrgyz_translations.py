from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("movies", "0002_movie_content_source_url_movie_license_type_and_more")]

    operations = [
        migrations.AddField(
            model_name="genre",
            name="name_ky",
            field=models.CharField(blank=True, max_length=100, verbose_name="название на кыргызском"),
        ),
        migrations.AddField(
            model_name="movie",
            name="description_ky",
            field=models.TextField(blank=True, verbose_name="описание на кыргызском"),
        ),
        migrations.AddField(
            model_name="movie",
            name="title_ky",
            field=models.CharField(blank=True, max_length=255, verbose_name="название на кыргызском"),
        ),
    ]
