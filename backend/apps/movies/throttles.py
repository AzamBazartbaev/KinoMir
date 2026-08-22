import logging

from django.core.cache import cache
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle


security_logger = logging.getLogger("security")


class SecurityAuditMixin:
    """Записывает каждую блокировку и отмечает повторные нарушения."""

    audit_ttl = 60 * 60

    def allow_request(self, request, view):
        allowed = super().allow_request(request, view)
        if not allowed:
            self.audit_denial(request)
        return allowed

    def audit_denial(self, request):
        scope = getattr(self, "scope", self.__class__.__name__)
        identity = str(request.user.pk) if request.user.is_authenticated else self.get_ident(request)
        audit_key = f"security:throttle:{scope}:{identity}"
        violations = cache.get(audit_key, 0) + 1
        cache.set(audit_key, violations, self.audit_ttl)
        security_logger.warning(
            "api_throttle_blocked scope=%s identity=%s authenticated=%s repeated=%s violations=%s method=%s path=%s",
            scope,
            identity,
            request.user.is_authenticated,
            violations > 1,
            violations,
            request.method,
            request.path,
        )


class AuditedAnonRateThrottle(SecurityAuditMixin, AnonRateThrottle):
    scope = "anon"


class AuditedUserRateThrottle(SecurityAuditMixin, UserRateThrottle):
    scope = "user"


class EndpointRateThrottle(SecurityAuditMixin, SimpleRateThrottle):
    def get_cache_key(self, request, view):
        if request.user.is_authenticated:
            identity = f"user-{request.user.pk}"
        else:
            identity = f"ip-{self.get_ident(request)}"
        return self.cache_format % {"scope": self.scope, "ident": identity}


class LoginRateThrottle(EndpointRateThrottle):
    scope = "login"


class RegisterRateThrottle(EndpointRateThrottle):
    scope = "register"


class CommentRateThrottle(EndpointRateThrottle):
    scope = "comments"
