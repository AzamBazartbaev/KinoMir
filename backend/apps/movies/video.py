import re
from urllib.parse import parse_qs, urlparse

IFRAME_HOSTS = {
    "youtube.com", "www.youtube.com", "youtu.be",
    "vimeo.com", "www.vimeo.com", "player.vimeo.com",
    "etnomedia.tv", "www.etnomedia.tv",
}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be"}
VIMEO_HOSTS = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}

def resolve_video(source_type, url):
    if not url: return {"mode": "unavailable", "url": ""}
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}: return {"mode": "unavailable", "url": ""}
    host = parsed.netloc.lower().split(":")[0]
    if source_type == "youtube" and host in YOUTUBE_HOSTS:
        path_parts = [part for part in parsed.path.strip("/").split("/") if part]
        if host == "youtu.be":
            video_id = path_parts[0] if path_parts else ""
        else:
            video_id = parse_qs(parsed.query).get("v", [""])[0]
            if not video_id and len(path_parts) >= 2 and path_parts[0] in {"embed", "shorts", "live"}:
                video_id = path_parts[1]
        return {"mode": "embed", "url": f"https://www.youtube.com/embed/{video_id}"} if re.fullmatch(r"[A-Za-z0-9_-]{6,20}", video_id) else {"mode": "unavailable", "url": ""}
    if source_type == "vimeo" and host in VIMEO_HOSTS:
        video_id = parsed.path.strip("/").split("/")[-1]
        return {"mode": "embed", "url": f"https://player.vimeo.com/video/{video_id}"} if video_id.isdigit() else {"mode": "unavailable", "url": ""}
    if source_type == "direct" and parsed.path.lower().endswith((".mp4", ".webm", ".ogg")): return {"mode": "html5", "url": url}
    if source_type == "iframe" and host in IFRAME_HOSTS: return {"mode": "embed", "url": url}
    if source_type == "external": return {"mode": "external", "url": url}
    return {"mode": "unavailable", "url": ""}
