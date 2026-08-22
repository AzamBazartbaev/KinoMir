from django.urls import path

from . import views


urlpatterns = [
    path("password-reset/request/", views.password_reset_request, name="password-reset-request"),
    path("password-reset/confirm/", views.password_reset_confirm, name="password-reset-confirm"),
    path("email-change/request/", views.email_change_request, name="email-change-request"),
    path("email-change/confirm/", views.email_change_confirm, name="email-change-confirm"),
]
