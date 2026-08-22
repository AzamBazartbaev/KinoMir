from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers, status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.movies.throttles import AuditedAnonRateThrottle, AuditedUserRateThrottle

from .serializers import EmailChangeConfirmSerializer, EmailChangeRequestSerializer, PasswordResetConfirmSerializer, PasswordResetRequestSerializer
from .services import InvalidAccountToken, confirm_email_change, request_email_change, request_password_reset, reset_password
from .throttles import EmailChangeRateThrottle, PasswordResetRateThrottle


MessageResponse = inline_serializer("AccountMessageResponse", {"detail": drf_serializers.CharField()})
PASSWORD_RESET_ACCEPTED = "Если аккаунт с таким email существует, мы отправили инструкции по восстановлению."
INVALID_TOKEN_MESSAGE = "Ссылка недействительна, уже использована или срок её действия истёк."


@extend_schema(request=PasswordResetRequestSerializer, responses={202: MessageResponse})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuditedAnonRateThrottle, PasswordResetRateThrottle])
def password_reset_request(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    request_password_reset(serializer.validated_data["email"])
    return Response({"detail": PASSWORD_RESET_ACCEPTED}, status=status.HTTP_202_ACCEPTED)


@extend_schema(request=PasswordResetConfirmSerializer, responses={200: MessageResponse})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuditedAnonRateThrottle, PasswordResetRateThrottle])
def password_reset_confirm(request):
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        reset_password(serializer.validated_data["token"], serializer.validated_data["password"])
    except InvalidAccountToken:
        return Response({"detail": INVALID_TOKEN_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
    except DjangoValidationError as error:
        return Response({"password": error.messages}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": "Пароль изменён. Теперь вы можете войти с новым паролем."})


@extend_schema(request=EmailChangeRequestSerializer, responses={202: MessageResponse})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([AuditedUserRateThrottle, EmailChangeRateThrottle])
def email_change_request(request):
    serializer = EmailChangeRequestSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    request_email_change(request.user, serializer.validated_data["email"])
    return Response({"detail": "Мы отправили письмо на новый адрес. Email изменится только после подтверждения."}, status=status.HTTP_202_ACCEPTED)


@extend_schema(request=EmailChangeConfirmSerializer, responses={200: MessageResponse})
@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([AuditedAnonRateThrottle, PasswordResetRateThrottle])
def email_change_confirm(request):
    serializer = EmailChangeConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        user = confirm_email_change(serializer.validated_data["token"])
    except InvalidAccountToken:
        return Response({"detail": INVALID_TOKEN_MESSAGE}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"detail": f"Email {user.email} подтверждён и сохранён."})
