from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers


User = get_user_model()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        return User.objects.normalize_email(value.strip())


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=32, max_length=200, trim_whitespace=True)
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirm"]:
            raise serializers.ValidationError({"password_confirm": "Пароли не совпадают."})
        return attrs


class EmailChangeRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        value = User.objects.normalize_email(value.strip())
        user = self.context["request"].user
        if value.casefold() == (user.email or "").casefold():
            raise serializers.ValidationError("Этот email уже используется в вашем аккаунте.")
        if User.objects.filter(email__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError("Этот email уже используется.")
        return value


class EmailChangeConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=32, max_length=200, trim_whitespace=True)
