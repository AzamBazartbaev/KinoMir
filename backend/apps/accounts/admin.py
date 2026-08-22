from django.contrib import admin

from .models import AccountActionToken


@admin.register(AccountActionToken)
class AccountActionTokenAdmin(admin.ModelAdmin):
    list_display = ["user", "purpose", "email", "created_at", "expires_at", "used_at"]
    list_filter = ["purpose", "used_at", "created_at"]
    search_fields = ["user__username", "user__email", "email"]
    readonly_fields = ["user", "purpose", "token_digest", "email", "created_at", "expires_at", "used_at"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
