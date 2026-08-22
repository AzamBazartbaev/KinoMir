import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from .images import generate_poster_variants
from .models import Movie


logger = logging.getLogger(__name__)


@receiver(post_save, sender=Movie)
def prepare_movie_poster_variants(sender, instance, **kwargs):
    if not instance.poster:
        return
    try:
        generate_poster_variants(instance.poster)
    except (OSError, ValueError):
        logger.exception("Could not generate poster variants for movie %s", instance.pk)
