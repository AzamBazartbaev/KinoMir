from apps.movies.throttles import SecurityAuditMixin
from rest_framework.throttling import SimpleRateThrottle, UserRateThrottle


class PasswordResetRateThrottle(SecurityAuditMixin, SimpleRateThrottle):
    scope = "password_reset"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class EmailChangeRateThrottle(SecurityAuditMixin, UserRateThrottle):
    scope = "email_change"
