from urllib.parse import parse_qs, urlparse

IFRAME_HOSTS = {"youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com", "player.vimeo.com"}

def resolve_video(source_type, url):
    if not url: return {"mode": "unavailable", "url": ""}
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}: return {"mode": "unavailable", "url": ""}
    host = parsed.netloc.lower().split(":")[0]
    if source_type == "youtube":
        video_id = parse_qs(parsed.query).get("v", [""])[0] if "youtube.com" in host else parsed.path.strip("/").split("/")[-1]
        return {"mode": "embed", "url": f"https://www.youtube.com/embed/{video_id}"} if video_id else {"mode": "unavailable", "url": ""}
    if source_type == "vimeo":
        video_id = parsed.path.strip("/").split("/")[-1]
        return {"mode": "embed", "url": f"https://player.vimeo.com/video/{video_id}"} if video_id.isdigit() else {"mode": "unavailable", "url": ""}
    if source_type == "direct" and parsed.path.lower().endswith((".mp4", ".webm", ".ogg")): return {"mode": "html5", "url": url}
    if source_type == "iframe" and host in IFRAME_HOSTS: return {"mode": "embed", "url": url}
    if source_type == "external": return {"mode": "external", "url": url}
    return {"mode": "unavailable", "url": ""}

