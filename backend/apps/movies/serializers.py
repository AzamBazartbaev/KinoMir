from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from .models import Comment, Genre, Movie, Rating
from .video import resolve_video

User = get_user_model()

class GenreSerializer(serializers.ModelSerializer):
    class Meta: model = Genre; fields = ["id", "name", "slug", "description", "image"]

class CommentSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    class Meta: model = Comment; fields = ["id", "username", "text", "created_at", "updated_at"]

class MovieListSerializer(serializers.ModelSerializer):
    genres = GenreSerializer(many=True, read_only=True)
    rating_avg = serializers.FloatField(read_only=True, allow_null=True)
    ratings_count = serializers.IntegerField(read_only=True)
    is_favorite = serializers.SerializerMethodField()
    class Meta:
        model = Movie
        fields = ["id", "title", "original_title", "slug", "description", "year", "country", "duration", "age_rating", "genres", "poster", "banner", "is_featured", "views_count", "rating_avg", "ratings_count", "is_favorite"]
    def get_is_favorite(self, obj) -> bool:
        user = self.context["request"].user
        return user.is_authenticated and obj.favorited_by.filter(user=user).exists()

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
    class Meta(MovieListSerializer.Meta):
        fields = MovieListSerializer.Meta.fields + ["director", "actors", "trailer_url", "player", "comments", "user_rating", "legal", "created_at"]
    def get_comments(self, obj) -> list: return CommentSerializer(obj.comments.filter(is_approved=True), many=True).data
    def get_player(self, obj) -> dict: return resolve_video(obj.source_type, obj.video_url)
    def get_user_rating(self, obj) -> int | None:
        user = self.context["request"].user
        rating = Rating.objects.filter(user=user, movie=obj).first() if user.is_authenticated else None
        return rating.value if rating else None

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
