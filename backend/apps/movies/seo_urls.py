from django.urls import path

from . import seo_views


urlpatterns = [
    path("films/<str:slug>/", seo_views.movie_page, name="seo_movie"),
    path("robots.txt", seo_views.robots_txt, name="robots_txt"),
    path("sitemap.xml", seo_views.sitemap_xml, name="sitemap_xml"),
]
