from django.db.models import Avg, Count, F
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.generics import ListAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import serializers as drf_serializers
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view, inline_serializer
from .models import Genre, Movie
from .pagination import MoviePagination
from .selectors import filtered_movies, published_movies
from .serializers import GenreSerializer, LoginSerializer, MovieDetailSerializer, MovieListSerializer, RegisterSerializer, UserSerializer
from .services import add_comment, set_rating, toggle_favorite
from .throttles import AuditedAnonRateThrottle, AuditedUserRateThrottle, CommentRateThrottle, LoginRateThrottle, RegisterRateThrottle

@extend_schema(responses=inline_serializer("HealthResponse", {"status": drf_serializers.CharField()}))
@api_view(["GET"])
def health(request): return Response({"status": "ok"})

class GenreListView(ListAPIView):
    queryset = Genre.objects.filter(is_active=True)
    serializer_class = GenreSerializer
    pagination_class = None

@extend_schema_view(get=extend_schema(parameters=[
    OpenApiParameter("q", str, description="Поиск по названию, описанию, режиссёру и актёрам"),
    OpenApiParameter("genre", str, description="Slug жанра"),
    OpenApiParameter("year", int, description="Год выпуска"),
    OpenApiParameter("country", str, description="Страна (точное совпадение)"),
    OpenApiParameter("age_rating", str, description="Возрастной рейтинг"),
    OpenApiParameter("sort", str, enum=["newest", "year_desc", "year_asc", "title", "rating", "popular"]),
    OpenApiParameter("page", int, description="Номер страницы"),
    OpenApiParameter("page_size", int, description="Количество фильмов на странице (до 24)"),
]))
class MovieListView(ListAPIView):
    serializer_class = MovieListSerializer
    pagination_class = MoviePagination
    def get_queryset(self): return filtered_movies(self.request.query_params)

class MovieDetailView(RetrieveAPIView):
    serializer_class = MovieDetailSerializer
    lookup_field = "slug"
    def get_queryset(self): return published_movies()
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        Movie.objects.filter(pk=instance.pk).update(views_count=F("views_count") + 1)
        instance.refresh_from_db()
        return Response(self.get_serializer(instance).data)

AuthResponse = inline_serializer("AuthResponse", {"token": drf_serializers.CharField(), "user": UserSerializer()})
FavoriteResponse = inline_serializer("FavoriteResponse", {"is_favorite": drf_serializers.BooleanField()})
RatingRequest = inline_serializer("RatingRequest", {"value": drf_serializers.IntegerField(min_value=1, max_value=5)})
RatingResponse = inline_serializer("RatingResponse", {
    "value": drf_serializers.IntegerField(),
    "rating_avg": drf_serializers.FloatField(allow_null=True),
    "ratings_count": drf_serializers.IntegerField(),
})
CommentRequest = inline_serializer("CommentRequest", {"text": drf_serializers.CharField(max_length=1000)})
ThrottleResponse = inline_serializer("ThrottleResponse", {"detail": drf_serializers.CharField()})

@extend_schema(request=RegisterSerializer, responses={201: AuthResponse, 429: ThrottleResponse})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuditedAnonRateThrottle, RegisterRateThrottle])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response({"token": Token.objects.create(user=user).key, "user": UserSerializer(user).data}, status=status.HTTP_201_CREATED)

@extend_schema(request=LoginSerializer, responses={200: AuthResponse, 429: ThrottleResponse})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuditedAnonRateThrottle, LoginRateThrottle])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.validated_data["user"]
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "user": UserSerializer(user).data})

@extend_schema(request=None, responses={204: None})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    request.auth.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)

@extend_schema(responses=UserSerializer)
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request): return Response(UserSerializer(request.user).data)

@extend_schema(responses=MovieListSerializer(many=True))
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def favorites(request):
    qs = published_movies().filter(favorited_by__user=request.user)
    return Response(MovieListSerializer(qs, many=True, context={"request": request}).data)

def public_movie(slug): return get_object_or_404(Movie, slug=slug, is_published=True)

@extend_schema(request=None, responses=FavoriteResponse)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def favorite(request, slug): return Response({"is_favorite": toggle_favorite(request.user, public_movie(slug))})

@extend_schema(request=RatingRequest, responses=RatingResponse)
@api_view(["PUT"])
@permission_classes([IsAuthenticated])
def rating(request, slug):
    try:
        value = int(request.data.get("value", 0))
    except (TypeError, ValueError):
        value = 0
    result = set_rating(request.user, public_movie(slug), value)
    summary = result.movie.ratings.aggregate(rating_avg=Avg("value"), ratings_count=Count("id"))
    return Response({"value": result.value, **summary})

@extend_schema(request=CommentRequest, responses={
    201: inline_serializer("CommentCreateResponse", {"id": drf_serializers.IntegerField(), "text": drf_serializers.CharField(), "username": drf_serializers.CharField(), "created_at": drf_serializers.DateTimeField()}),
    429: ThrottleResponse,
})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AuditedUserRateThrottle, CommentRateThrottle])
def comment(request, slug):
    result = add_comment(request.user, public_movie(slug), request.data.get("text"))
    return Response({"id": result.id, "text": result.text, "username": request.user.username, "created_at": result.created_at}, status=status.HTTP_201_CREATED)
