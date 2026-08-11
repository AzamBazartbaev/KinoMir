from rest_framework.exceptions import ValidationError
from .models import Comment, Favorite, Rating

def toggle_favorite(user, movie):
    favorite, created = Favorite.objects.get_or_create(user=user, movie=movie)
    if not created: favorite.delete()
    return created

def set_rating(user, movie, value):
    if value not in range(1, 6): raise ValidationError({"value": "Оценка должна быть от 1 до 5."})
    return Rating.objects.update_or_create(user=user, movie=movie, defaults={"value": value})[0]

def add_comment(user, movie, text):
    text = (text or "").strip()
    if not text or len(text) > 1000: raise ValidationError({"text": "Введите от 1 до 1000 символов."})
    return Comment.objects.create(user=user, movie=movie, text=text)

