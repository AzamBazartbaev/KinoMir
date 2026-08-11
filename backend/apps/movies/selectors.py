from django.db.models import Avg, Count, Q
from .models import Movie

SORT_FIELDS = {"newest": "-created_at", "year_desc": "-year", "year_asc": "year", "title": "title", "rating": "-rating_avg", "popular": "-views_count"}

def published_movies():
    return Movie.objects.filter(is_published=True).prefetch_related("genres").annotate(rating_avg=Avg("ratings__value"), ratings_count=Count("ratings", distinct=True))

def filtered_movies(params):
    qs = published_movies()
    if query := params.get("q"):
        qs = qs.filter(Q(title__icontains=query) | Q(original_title__icontains=query) | Q(description__icontains=query) | Q(director__icontains=query) | Q(actors__icontains=query))
    if genre := params.get("genre"): qs = qs.filter(genres__slug=genre)
    if year := params.get("year"):
        try: qs = qs.filter(year=int(year))
        except (TypeError, ValueError): pass
    if country := params.get("country"): qs = qs.filter(country__iexact=country)
    if age := params.get("age_rating"): qs = qs.filter(age_rating=age)
    return qs.order_by(SORT_FIELDS.get(params.get("sort"), "-created_at"), "-id").distinct()

