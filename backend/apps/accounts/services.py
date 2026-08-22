import hashlib
import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.mail import EmailMessage
from django.db import transaction
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework.authtoken.models import Token

from .models import AccountActionToken


logger = logging.getLogger(__name__)
User = get_user_model()


class InvalidAccountToken(Exception):
    pass


def token_digest(raw_token):
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def issue_token(user, purpose, email=""):
    now = timezone.now()
    lifetime = settings.PASSWORD_RESET_TIMEOUT if purpose == AccountActionToken.Purpose.PASSWORD_RESET else settings.EMAIL_CONFIRMATION_TIMEOUT
    AccountActionToken.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(used_at=now)
    raw_token = secrets.token_urlsafe(32)
    AccountActionToken.objects.create(
        user=user,
        purpose=purpose,
        email=email,
        token_digest=token_digest(raw_token),
        expires_at=now + timedelta(seconds=lifetime),
    )
    return raw_token


def frontend_link(route, raw_token):
    base_url = settings.FRONTEND_URL.rstrip("/")
    return f"{base_url}/#/{route}?{urlencode({'token': raw_token})}"


def send_account_email(subject, template_name, recipient, context):
    message = EmailMessage(
        subject=subject,
        body=render_to_string(template_name, context),
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[recipient],
    )
    message.send(fail_silently=False)


def request_password_reset(email):
    user = User.objects.filter(email__iexact=email, is_active=True).order_by("pk").first()
    if not user:
        return
    raw_token = issue_token(user, AccountActionToken.Purpose.PASSWORD_RESET)
    try:
        send_account_email(
            "КиноОрдо: сброс пароля / сырсөздү калыбына келтирүү",
            "emails/password_reset.txt",
            user.email,
            {"username": user.username, "reset_url": frontend_link("password-reset-confirm", raw_token)},
        )
    except Exception:
        logger.exception("password_reset_email_failed")


def _locked_token(raw_token, purpose):
    action = AccountActionToken.objects.select_for_update().select_related("user").filter(
        token_digest=token_digest(raw_token), purpose=purpose
    ).first()
    if not action or not action.is_valid:
        raise InvalidAccountToken
    return action


@transaction.atomic
def reset_password(raw_token, password):
    action = _locked_token(raw_token, AccountActionToken.Purpose.PASSWORD_RESET)
    validate_password(password, user=action.user)
    action.user.set_password(password)
    action.user.save(update_fields=["password"])
    Token.objects.filter(user=action.user).delete()
    action.used_at = timezone.now()
    action.save(update_fields=["used_at"])


def request_email_change(user, email):
    raw_token = issue_token(user, AccountActionToken.Purpose.EMAIL_CONFIRMATION, email=email)
    try:
        send_account_email(
            "КиноОрдо: подтверждение email / email дарегин ырастоо",
            "emails/email_confirmation.txt",
            email,
            {"username": user.username, "email": email, "confirm_url": frontend_link("email-confirm", raw_token)},
        )
    except Exception:
        logger.exception("email_confirmation_email_failed")


@transaction.atomic
def confirm_email_change(raw_token):
    action = _locked_token(raw_token, AccountActionToken.Purpose.EMAIL_CONFIRMATION)
    if User.objects.filter(email__iexact=action.email).exclude(pk=action.user_id).exists():
        raise InvalidAccountToken
    action.user.email = User.objects.normalize_email(action.email)
    action.user.save(update_fields=["email"])
    action.used_at = timezone.now()
    action.save(update_fields=["used_at"])
    return action.user
