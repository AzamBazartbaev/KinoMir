from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.urls import reverse
from rest_framework import serializers
from .images import IMAGE_FORMATS, POSTER_WIDTHS
from .models import Comment, Genre, Movie, Rating, WatchProgress
from .video import resolve_video

User = get_user_model()


def requested_language(context) -> str:
    request = context.get("request")
    if request is None:
        return "ru"
    value = request.query_params.get("lang") or request.headers.get("Accept-Language", "ru")
    return "ky" if value.lower().split(",", 1)[0].strip().startswith("ky") else "ru"


class GenreSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    name_ru = serializers.CharField(source="name", read_only=True)

    class Meta: model = Genre; fields = ["id", "name", "name_ru", "name_ky", "slug", "description", "image"]

    def get_name(self, obj) -> str:
        return (obj.name_ky or obj.name) if requested_language(self.context) == "ky" else (obj.name or obj.name_ky)

class CommentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    class Meta: model = Comment; fields = ["id", "username", "text", "created_at", "updated_at"]

class MovieListSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    title_ru = serializers.CharField(source="title", read_only=True)
    description_ru = serializers.CharField(source="description", read_only=True)
    genres = GenreSerializer(many=True, read_only=True)
    rating_avg = serializers.FloatField(read_only=True, allow_null=True)
    ratings_count = serializers.IntegerField(read_only=True)
    is_favorite = serializers.SerializerMethodField()
    poster_sources = serializers.SerializerMethodField()
    class Meta:
        model = Movie
        fields = ["id", "title", "title_ru", "title_ky", "original_title", "slug", "description", "description_ru", "description_ky", "year", "country", "duration", "age_rating", "genres", "poster", "poster_sources", "banner", "is_featured", "views_count", "rating_avg", "ratings_count", "is_favorite"]

    def get_title(self, obj) -> str:
        return (obj.title_ky or obj.title) if requested_language(self.context) == "ky" else (obj.title or obj.title_ky)

    def get_description(self, obj) -> str:
        return (obj.description_ky or obj.description) if requested_language(self.context) == "ky" else (obj.description or obj.description_ky)

    def get_is_favorite(self, obj) -> bool:
        if hasattr(obj, "is_favorite_value"):
            return obj.is_favorite_value
        user = self.context["request"].user
        return user.is_authenticated and obj.favorited_by.filter(user=user).exists()

    def get_poster_sources(self, obj) -> dict:
        if not obj.poster:
            return {}
        request = self.context.get("request")
        result = {}
        for image_format in IMAGE_FORMATS:
            variants = []
            for width in sorted(POSTER_WIDTHS):
                path = reverse("movie-poster-variant", kwargs={"slug": obj.slug, "width": width, "image_format": image_format})
                variants.append({"url": request.build_absolute_uri(path) if request else path, "width": width})
            result[image_format] = variants
        return result

class MovieLegalSerializer(serializers.Serializer):
    rights_holder = serializers.CharField(read_only=True)
    license_type = serializers.CharField(read_only=True)
    license_label = serializers.CharField(source="get_license_type_display", read_only=True)
    rights_status = serializers.CharField(read_only=True)
    rights_status_label = serializers.CharField(source="get_rights_status_display", read_only=True)
    content_source_url = serializers.URLField(read_only=True)
    video_content_type = serializers.CharField(read_only=True)
    video_content_label = serializers.CharField(source="get_video_content_type_display", read_only=True)
    poster_attribution = serializers.CharField(read_only=True)
    poster_source_url = serializers.URLField(read_only=True)
    video_attribution = serializers.CharField(read_only=True)
    video_source_url = serializers.URLField(read_only=True)

class MovieDetailSerializer(MovieListSerializer):
    comments = serializers.SerializerMethodField()
    player = serializers.SerializerMethodField()
    user_rating = serializers.SerializerMethodField()
    legal = MovieLegalSerializer(source="*", read_only=True)
    watch_progress = serializers.SerializerMethodField()
    class Meta(MovieListSerializer.Meta):
        fields = MovieListSerializer.Meta.fields + ["director", "actors", "trailer_url", "player", "comments", "user_rating", "watch_progress", "legal", "created_at"]
    def get_comments(self, obj) -> list: return CommentSerializer(obj.comments.filter(is_approved=True), many=True).data
    def get_player(self, obj) -> dict: return resolve_video(obj.source_type, obj.video_url)
    def get_user_rating(self, obj) -> int | None:
        user = self.context["request"].user
        rating = Rating.objects.filter(user=user, movie=obj).first() if user.is_authenticated else None
        return rating.value if rating else None
    def get_watch_progress(self, obj) -> dict | None:
        user = self.context["request"].user
        progress = WatchProgress.objects.filter(user=user, movie=obj).first() if user.is_authenticated else None
        return WatchProgressPositionSerializer(progress).data if progress else None


class WatchProgressPositionSerializer(serializers.ModelSerializer):
    progress_percent = serializers.IntegerField(read_only=True)

    class Meta:
        model = WatchProgress
        fields = ["position_seconds", "duration_seconds", "progress_percent", "updated_at"]


class WatchProgressWriteSerializer(serializers.Serializer):
    position_seconds = serializers.IntegerField(min_value=0)
    duration_seconds = serializers.IntegerField(min_value=0)

    def validate(self, attrs):
        duration = attrs["duration_seconds"]
        if duration:
            attrs["position_seconds"] = min(attrs["position_seconds"], duration)
        return attrs


class WatchHistorySerializer(WatchProgressPositionSerializer):
    movie = MovieListSerializer(read_only=True)

    class Meta(WatchProgressPositionSerializer.Meta):
        fields = ["movie", *WatchProgressPositionSerializer.Meta.fields]

class UserSerializer(serializers.ModelSerializer):
    class Meta: model = User; fields = ["id", "username", "email", "date_joined"]

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    class Meta: model = User; fields = ["username", "email", "password"]
    def validate_username(self, value):
        value = value.strip()
        if len(value) < 3: raise serializers.ValidationError("Имя пользователя должно содержать минимум 3 символа.")
        if User.objects.filter(username__iexact=value).exists(): raise serializers.ValidationError("Это имя пользователя уже занято.")
        return value
    def validate_email(self, value):
        value = User.objects.normalize_email(value.strip())
        if User.objects.filter(email__iexact=value).exists(): raise serializers.ValidationError("Этот email уже используется.")
        return value
    def validate_password(self, value):
        validate_password(value)
        return value
    def create(self, data): return User.objects.create_user(**data)

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    def validate(self, data):
        user = authenticate(**data)
        if not user: raise serializers.ValidationError("Неверное имя пользователя или пароль.")
        data["user"] = user
        return data
