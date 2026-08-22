import json
from urllib.parse import urljoin
from xml.etree.ElementTree import Element, SubElement, tostring

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, render
from django.urls import reverse
from django.utils.html import strip_tags
from django.utils.text import Truncator

from .models import Movie


def site_url(path=""):
    return urljoin(f"{settings.PUBLIC_SITE_URL}/", path.lstrip("/"))


def movie_page(request, slug):
    movie = get_object_or_404(Movie.objects.prefetch_related("genres"), slug=slug, is_published=True)
    canonical_url = site_url(reverse("seo_movie", kwargs={"slug": movie.slug}))
    description = Truncator(f"{movie.title} ({movie.year}). {strip_tags(movie.description)}").chars(160)
    image_url = site_url(movie.poster.url) if movie.poster else site_url("social-card.svg")
    structured_data = json.dumps({
        "@context": "https://schema.org",
        "@type": "Movie",
        "name": movie.title,
        "alternateName": movie.original_title or movie.title_ky or movie.title,
        "description": description,
        "dateCreated": str(movie.year),
        "duration": f"PT{movie.duration}M",
        "countryOfOrigin": movie.country,
        "genre": [genre.name for genre in movie.genres.all()],
        "director": {"@type": "Person", "name": movie.director} if movie.director else None,
        "image": image_url,
        "url": canonical_url,
    }, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return render(request, "movies/movie_seo.html", {
        "movie": movie,
        "page_title": f"{movie.title} ({movie.year}) — КиноОрдо",
        "description": description,
        "canonical_url": canonical_url,
        "image_url": image_url,
        "frontend_url": settings.PUBLIC_SITE_URL,
        "structured_data": structured_data,
    })


def robots_txt(request):
    content = "\n".join([
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin/",
        "Disallow: /api/",
        f"Sitemap: {site_url('sitemap.xml')}",
        "",
    ])
    return HttpResponse(content, content_type="text/plain; charset=utf-8")


def sitemap_xml(request):
    root = Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    home = SubElement(root, "url")
    SubElement(home, "loc").text = site_url()
    SubElement(home, "changefreq").text = "weekly"
    SubElement(home, "priority").text = "1.0"
    for movie in Movie.objects.filter(is_published=True).only("slug", "updated_at").order_by("slug"):
        item = SubElement(root, "url")
        SubElement(item, "loc").text = site_url(reverse("seo_movie", kwargs={"slug": movie.slug}))
        SubElement(item, "lastmod").text = movie.updated_at.date().isoformat()
        SubElement(item, "changefreq").text = "monthly"
        SubElement(item, "priority").text = "0.8"
    return HttpResponse(tostring(root, encoding="utf-8", xml_declaration=True), content_type="application/xml; charset=utf-8")
