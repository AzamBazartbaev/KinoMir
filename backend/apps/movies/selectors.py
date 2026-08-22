from django.db.models import Avg, BooleanField, Count, Exists, F, OuterRef, Q, Value
from .models import Favorite, Movie

SORT_FIELDS = {"newest": "-created_at", "year_desc": "-year", "year_asc": "year", "title": "title", "rating": "-rating_avg", "popular": "-views_count"}

def published_movies(user=None):
    favorite = (
        Exists(Favorite.objects.filter(movie_id=OuterRef("pk"), user=user))
        if getattr(user, "is_authenticated", False)
        else Value(False, output_field=BooleanField())
    )
    return (
        Movie.objects.filter(is_published=True)
        .prefetch_related("genres")
        .annotate(
            rating_avg=Avg("ratings__value"),
            ratings_count=Count("ratings", distinct=True),
            is_favorite_value=favorite,
        )
    )

def filtered_movies(params, user=None):
    qs = published_movies(user)
    if query := params.get("q"):
        qs = qs.filter(Q(title__icontains=query) | Q(title_ky__icontains=query) | Q(original_title__icontains=query) | Q(description__icontains=query) | Q(description_ky__icontains=query) | Q(director__icontains=query) | Q(actors__icontains=query))
    if genre := params.get("genre"): qs = qs.filter(genres__slug=genre)
    if year := params.get("year"):
        try: qs = qs.filter(year=int(year))
        except (TypeError, ValueError): pass
    if country := params.get("country"): qs = qs.filter(country__iexact=country)
    if age := params.get("age_rating"): qs = qs.filter(age_rating=age)
    sort = params.get("sort")
    primary_order = F("rating_avg").desc(nulls_last=True) if sort == "rating" else SORT_FIELDS.get(sort, "-created_at")
    return qs.order_by(primary_order, "-id").distinct()
