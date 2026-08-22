from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from pathlib import PurePosixPath

from django.core.files.base import ContentFile
from PIL import Image, ImageOps


POSTER_WIDTHS = {240, 480, 720}
IMAGE_FORMATS = {
    "avif": ("AVIF", "image/avif", {"quality": 62}),
    "webp": ("WEBP", "image/webp", {"quality": 78, "method": 6}),
}


@dataclass(frozen=True)
class PosterVariant:
    file: object
    content_type: str
    etag: str


def _variant_name(source_name: str, width: int, image_format: str) -> str:
    source = PurePosixPath(source_name)
    fingerprint = sha256(source_name.encode("utf-8")).hexdigest()[:12]
    return str(source.parent / "variants" / f"{source.stem}-{fingerprint}-{width}.{image_format}")


def get_poster_variant(poster, width: int, image_format: str) -> PosterVariant:
    if not poster or width not in POSTER_WIDTHS or image_format not in IMAGE_FORMATS:
        raise ValueError("Unsupported poster variant")

    storage = poster.storage
    variant_name = _variant_name(poster.name, width, image_format)
    pil_format, content_type, save_options = IMAGE_FORMATS[image_format]
    if not storage.exists(variant_name):
        with storage.open(poster.name, "rb") as source:
            image = ImageOps.exif_transpose(Image.open(source)).convert("RGB")
            target_height = max(1, round(image.height * width / image.width))
            image = image.resize((width, target_height), Image.Resampling.LANCZOS)
            output = BytesIO()
            image.save(output, format=pil_format, **save_options)
        variant_name = storage.save(variant_name, ContentFile(output.getvalue()))

    return PosterVariant(
        file=storage.open(variant_name, "rb"),
        content_type=content_type,
        etag=sha256(variant_name.encode("utf-8")).hexdigest(),
    )


def generate_poster_variants(poster) -> None:
    if not poster:
        return
    for image_format in IMAGE_FORMATS:
        for width in POSTER_WIDTHS:
            variant = get_poster_variant(poster, width, image_format)
            variant.file.close()
