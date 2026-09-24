import base64
import html
import os
import re
import time
import threading
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import unquote, urlparse

from flask import Flask, Response, jsonify, request, stream_with_context
import requests
import yt_dlp

app = Flask(__name__)

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
TIKTOK_HANDLE_RE = re.compile(r"^[A-Za-z0-9._-]{2,64}$")
TIKTOK_ID_RE = re.compile(r"^\d{12,24}$")
CACHE_TTL = 600
TIKTOK_CACHE_TTL = 5 * 60
YTDLP_BLOCK_TTL = 15 * 60
PIPED_EDGE = "https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988"
COOKIE_PATH = Path("/tmp/1988-ytdlp-cookies.txt")

_cache = {}
_tiktok_cache = {}
_tiktok_discovery_cache = {}
_tiktok_source_pool = {}
_lock = threading.Lock()
_ytdlp_blocked_until = 0


def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,HEAD,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Range,Content-Type"
    resp.headers["Access-Control-Expose-Headers"] = (
        "Content-Length,Content-Range,Accept-Ranges,Content-Type,"
        "ETag,Last-Modified,X-1988-Media,X-1988-Audio"
    )
    return resp


def valid_id(video_id):
    return bool(VIDEO_ID_RE.fullmatch(video_id or ""))


def valid_kind(kind):
    return kind in ("audio", "video")


def _proxy_url():
    return (
        os.environ.get("YTDLP_PROXY")
        or os.environ.get("HTTPS_PROXY")
        or os.environ.get("HTTP_PROXY")
        or ""
    ).strip()


def _requests_proxies():
    proxy = _proxy_url()
    if not proxy:
        return None
    return {"http": proxy, "https": proxy}


def _cookiefile():
    explicit = (os.environ.get("YTDLP_COOKIEFILE") or "").strip()
    if explicit:
        return explicit

    encoded = (os.environ.get("YTDLP_COOKIES_B64") or "").strip()
    if not encoded:
        return None

    try:
        decoded = base64.b64decode(encoded).decode("utf-8")
        if not COOKIE_PATH.exists() or COOKIE_PATH.read_text("utf-8") != decoded:
            COOKIE_PATH.write_text(decoded, encoding="utf-8")
            os.chmod(COOKIE_PATH, 0o600)
        return str(COOKIE_PATH)
    except Exception as exc:
        app.logger.warning("invalid YTDLP_COOKIES_B64: %s", exc)
        return None


def _cache_key(video_id, kind):
    return f"{kind}:{video_id}"


def _cache_put(video_id, kind, data):
    key = _cache_key(video_id, kind)
    with _lock:
        _cache[key] = {"at": time.time(), "data": data}
        if len(_cache) > 120:
            oldest = min(_cache.items(), key=lambda item: item[1]["at"])[0]
            _cache.pop(oldest, None)


def _cache_get(video_id, kind):
    key = _cache_key(video_id, kind)
    with _lock:
        row = _cache.get(key)
        if row and time.time() - row["at"] < CACHE_TTL:
            return row["data"]
    return None


def _cache_drop(video_id, kind):
    with _lock:
        _cache.pop(_cache_key(video_id, kind), None)


def _tiktok_timestamp_from_id(value):
    try:
        raw = int(str(value or "0"))
        ts = raw >> 32
        if 1_500_000_000 <= ts <= 2_500_000_000:
            return ts
    except Exception:
        pass
    return 0


def _tiktok_cache_get(handle, limit):
    key = f"{handle.lower()}:{limit}"
    with _lock:
        row = _tiktok_cache.get(key)
        if row and time.time() - row["at"] < TIKTOK_CACHE_TTL:
            return row["data"]
    return None


def _tiktok_cache_put(handle, limit, rows):
    key = f"{handle.lower()}:{limit}"
    with _lock:
        _tiktok_cache[key] = {"at": time.time(), "data": rows}
        if len(_tiktok_cache) > 80:
            oldest = min(_tiktok_cache.items(), key=lambda item: item[1]["at"])[0]
            _tiktok_cache.pop(oldest, None)


def _normalize_tiktok_entry(entry, handle):
    if not isinstance(entry, dict):
        return None

    video_id = str(entry.get("id") or "").strip()
    if not TIKTOK_ID_RE.fullmatch(video_id):
        raw_url = str(entry.get("webpage_url") or entry.get("url") or "")
        match = re.search(r"/video/(\d{12,24})", raw_url)
        video_id = match.group(1) if match else ""

    if not TIKTOK_ID_RE.fullmatch(video_id):
        return None

    thumbnails = entry.get("thumbnails") if isinstance(entry.get("thumbnails"), list) else []
    thumbnail = str(entry.get("thumbnail") or "")
    if not thumbnail:
        for row in reversed(thumbnails):
            if isinstance(row, dict) and row.get("url"):
                thumbnail = str(row["url"])
                break

    title = str(
        entry.get("description")
        or entry.get("title")
        or entry.get("fulltitle")
        or ""
    ).strip()

    timestamp = int(
        entry.get("timestamp")
        or entry.get("release_timestamp")
        or _tiktok_timestamp_from_id(video_id)
        or 0
    )

    webpage_url = str(entry.get("webpage_url") or "").strip()
    if not webpage_url.startswith("http"):
        webpage_url = f"https://www.tiktok.com/@{handle}/video/{video_id}"

    return {
        "id": video_id,
        "platform": "tiktok",
        "handle": handle,
        "uploader": str(entry.get("uploader") or entry.get("creator") or entry.get("channel") or handle),
        "title": title,
        "description": title,
        "thumbnail": thumbnail,
        "duration": float(entry.get("duration") or 0),
        "timestamp": timestamp,
        "viewCount": int(entry.get("view_count") or entry.get("play_count") or 0),
        "likeCount": int(entry.get("like_count") or 0),
        "commentCount": int(entry.get("comment_count") or 0),
        "url": webpage_url,
        "embedUrl": (
            f"https://www.tiktok.com/player/v1/{video_id}"
            "?autoplay=1&controls=1&progress_bar=1&play_button=1"
            "&volume_control=1&fullscreen_button=1&timestamp=1"
            "&loop=0&music_info=0&description=0&rel=0"
            "&native_context_menu=0&closed_caption=0"
        ),
    }


def extract_tiktok_profile(handle, limit=12, force=False):
    handle = str(handle or "").strip().lstrip("@")
    if not TIKTOK_HANDLE_RE.fullmatch(handle):
        raise ValueError("invalid_tiktok_handle")

    limit = max(1, min(int(limit or 12), 30))
    if not force:
        cached = _tiktok_cache_get(handle, limit)
        if cached is not None:
            return cached

    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": limit,
        "socket_timeout": 18,
        "retries": 1,
        "ignoreerrors": True,
        "lazy_playlist": False,
    }

    proxy = _proxy_url()
    if proxy:
        opts["proxy"] = proxy

    cookiefile = _cookiefile()
    if cookiefile:
        opts["cookiefile"] = cookiefile

    impersonate = (os.environ.get("YTDLP_IMPERSONATE") or "").strip()
    if impersonate:
        opts["impersonate"] = impersonate

    profile_url = f"https://www.tiktok.com/@{handle}"
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(profile_url, download=False, process=False)

    entries = list((info or {}).get("entries") or [])
    rows = []
    seen = set()
    for entry in entries[:limit]:
        row = _normalize_tiktok_entry(entry, handle)
        if not row or row["id"] in seen:
            continue
        seen.add(row["id"])
        rows.append(row)

    rows.sort(key=lambda row: (int(row.get("timestamp") or 0), int(row.get("viewCount") or 0)), reverse=True)
    _tiktok_cache_put(handle, limit, rows)
    return rows


def _player_clients():
    raw = (os.environ.get("YTDLP_PLAYER_CLIENTS") or "").strip()
    if raw:
        rows = [x.strip() for x in raw.split(",") if x.strip()]
        if rows:
            return rows
    return ["tv", "web_embedded", "web_safari", "android_vr"]


def _format_selector(kind):
    if kind == "audio":
        return "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio"
    # Progressive video is intentional: one URL contains both image + audio,
    # so Safari/PiP can seek it with normal byte ranges without ffmpeg merging.
    return (
        "best[ext=mp4][vcodec!=none][acodec!=none]/"
        "best[vcodec!=none][acodec!=none]"
    )


def _mime_from_info(info, kind):
    ext = str(info.get("ext") or "").lower()
    acodec = str(info.get("acodec") or "").lower()
    vcodec = str(info.get("vcodec") or "").lower()
    protocol = str(info.get("protocol") or "").lower()

    if "m3u8" in protocol:
        return "application/vnd.apple.mpegurl"
    if kind == "audio":
        if ext in ("m4a", "mp4") or "mp4a" in acodec:
            return "audio/mp4"
        if ext == "webm" or "opus" in acodec:
            return "audio/webm"
        return "audio/mpeg"

    if ext in ("mp4", "m4v") or "avc" in vcodec or "h264" in vcodec:
        return "video/mp4"
    if ext == "webm":
        return "video/webm"
    return "video/mp4"


def _resolve_with_ytdlp(video_id, kind):
    global _ytdlp_blocked_until

    url = f"https://www.youtube.com/watch?v={video_id}"

    if kind == "audio":
        selectors = [
            "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio",
            "bestaudio/best",
        ]
    else:
        selectors = [
            "best[ext=mp4][vcodec!=none][acodec!=none]/best[vcodec!=none][acodec!=none]",
            "best[vcodec!=none][acodec!=none]/best",
            "best",
        ]

    configured_clients = _player_clients()
    client_sets = [
        configured_clients,
        ["ios", "android", "web_safari"],
        ["web", "mweb"],
        [],
    ]

    errors = []
    info = None

    for clients in client_sets:
        for selector in selectors:
            opts = {
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "skip_download": True,
                "format": selector,
                "socket_timeout": 18,
                "retries": 2,
                "fragment_retries": 2,
                "geo_bypass": True,
            }

            if clients:
                opts["extractor_args"] = {
                    "youtube": {
                        "player_client": clients,
                    }
                }

            proxy = _proxy_url()
            if proxy:
                opts["proxy"] = proxy

            cookiefile = _cookiefile()
            if cookiefile:
                opts["cookiefile"] = cookiefile

            impersonate = (os.environ.get("YTDLP_IMPERSONATE") or "").strip()
            if impersonate:
                opts["impersonate"] = impersonate

            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    candidate = ydl.extract_info(url, download=False)
                if candidate and candidate.get("url"):
                    info = candidate
                    break
                errors.append(
                    f"clients={','.join(clients) if clients else 'default'} "
                    f"format={selector}:no_direct_url"
                )
            except Exception as exc:
                message = str(exc)
                errors.append(
                    f"clients={','.join(clients) if clients else 'default'} "
                    f"format={selector}:{message}"
                )
                low = message.lower()
                if (
                    "not a bot" in low
                    or "sign in to confirm" in low
                    or "login_required" in low
                ):
                    _ytdlp_blocked_until = time.time() + YTDLP_BLOCK_TTL
            if info:
                break
        if info:
            break

    if not info:
        raise RuntimeError(" | ".join(errors[-6:]) or f"no_{kind}_format")

    stream_url = info.get("url") or ""
    if not stream_url:
        raise RuntimeError(f"no_{kind}_url")

    headers = dict(info.get("http_headers") or {})
    headers.setdefault(
        "User-Agent",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
        "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    )
    headers.setdefault("Accept", "*/*")

    return {
        "id": video_id,
        "kind": kind,
        "title": info.get("title") or "",
        "uploader": info.get("uploader") or info.get("channel") or "",
        "thumbnail": info.get("thumbnail") or "",
        "duration": info.get("duration") or 0,
        "mimeType": _mime_from_info(info, kind),
        "ext": str(info.get("ext") or "").lower(),
        "acodec": str(info.get("acodec") or "").lower(),
        "vcodec": str(info.get("vcodec") or "").lower(),
        "protocol": str(info.get("protocol") or "").lower(),
        "formatId": str(info.get("format_id") or ""),
        "url": stream_url,
        "headers": headers,
        "engine": "yt-dlp",
    }


def _resolve_with_piped(video_id, kind):
    action = "background" if kind == "audio" else "playback"
    response = requests.get(
        PIPED_EDGE,
        params={"action": action, "id": video_id},
        headers={"Accept": "application/json"},
        proxies=_requests_proxies(),
        timeout=(6, 18),
    )
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") or {}

    if kind == "audio":
        sources = [row for row in (data.get("sources") or []) if row.get("url")]
    else:
        sources = [
            row for row in (data.get("sources") or [])
            if row.get("url") and not bool(row.get("videoOnly"))
        ]

    if not sources:
        raise RuntimeError(f"no_piped_{kind}_source")

    def rank(row):
        mime = str(row.get("mimeType") or "").lower()
        bitrate = int(row.get("bitrate") or 0)
        quality = int(row.get("height") or row.get("quality") or 0)
        if kind == "audio":
            type_score = 4 if ("audio/mp4" in mime or "m4a" in mime) else 2
            return type_score * 1_000_000_000 + bitrate
        type_score = 5 if "video/mp4" in mime else 2
        return type_score * 1_000_000_000 + quality * 1_000_000 + bitrate

    source = sorted(sources, key=rank, reverse=True)[0]
    mime = str(source.get("mimeType") or ("audio/mp4" if kind == "audio" else "video/mp4"))

    return {
        "id": video_id,
        "kind": kind,
        "title": data.get("title") or "",
        "uploader": data.get("uploader") or "",
        "thumbnail": data.get("thumbnailUrl") or "",
        "duration": data.get("duration") or 0,
        "mimeType": mime,
        "ext": "m4a" if kind == "audio" and "mp4" in mime else "mp4",
        "acodec": "",
        "vcodec": "",
        "protocol": "",
        "formatId": str(source.get("itag") or source.get("quality") or ""),
        "url": str(source["url"]),
        "headers": {
            "User-Agent": (
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) "
                "AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"
            ),
            "Accept": "*/*",
        },
        "engine": "piped-proxy",
    }


def resolve_media(video_id, kind, force=False):
    global _ytdlp_blocked_until

    if not force:
        cached = _cache_get(video_id, kind)
        if cached:
            return cached

    errors = []
    now = time.time()

    # If an outbound proxy/cookie is configured, always retry yt-dlp. Those
    # settings can move extraction away from a previously blocked Render IP.
    allow_ytdlp = bool(_proxy_url() or _cookiefile()) or now >= _ytdlp_blocked_until
    if allow_ytdlp:
        try:
            data = _resolve_with_ytdlp(video_id, kind)
            _cache_put(video_id, kind, data)
            return data
        except Exception as exc:
            errors.append(f"yt-dlp:{exc}")

    try:
        data = _resolve_with_piped(video_id, kind)
        _cache_put(video_id, kind, data)
        return data
    except Exception as exc:
        errors.append(f"piped:{exc}")

    raise RuntimeError(" | ".join(errors) or f"no_{kind}_source")


def upstream_request(info, method="GET"):
    headers = dict(info["headers"])
    incoming_range = request.headers.get("Range")
    if incoming_range:
        headers["Range"] = incoming_range

    return requests.request(
        method,
        info["url"],
        headers=headers,
        proxies=_requests_proxies(),
        stream=(method == "GET"),
        allow_redirects=True,
        timeout=(10, 60),
    )


def _direct_stream_args(video_id, kind):
    fmt = (
        "bestaudio[ext=m4a]/bestaudio"
        if kind == "audio"
        else (
            "best[ext=mp4][vcodec!=none][acodec!=none]/"
            "best[vcodec!=none][acodec!=none]"
        )
    )
    args = [
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",
        "--no-progress",
        "-f",
        fmt,
        "-o",
        "-",
        f"https://www.youtube.com/watch?v={video_id}",
    ]

    proxy = _proxy_url()
    if proxy:
        args[1:1] = ["--proxy", proxy]

    cookiefile = _cookiefile()
    if cookiefile:
        args[1:1] = ["--cookies", cookiefile]

    return args, fmt


def direct_stream_response(video_id, kind):
    if request.method == "OPTIONS":
        return Response(status=204)

    if not valid_id(video_id):
        return jsonify({"ok": False, "error": "invalid_video"}), 400
    if kind not in ("video", "audio"):
        return jsonify({"ok": False, "error": "invalid_kind"}), 400

    args, fmt = _direct_stream_args(video_id, kind)
    app.logger.info("direct %s stream %s", kind, video_id)

    proc = subprocess.Popen(
        args,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
        env=os.environ.copy(),
    )

    if request.method == "HEAD":
        try:
            proc.kill()
        except Exception:
            pass
        return Response(
            status=200,
            headers={
                "Content-Type": "audio/mp4" if kind == "audio" else "video/mp4",
                "Cache-Control": "no-store",
                "X-1988-Stream": "audio" if kind == "audio" else "video-av",
                "X-1988-Format": fmt,
            },
        )

    @stream_with_context
    def generate():
        try:
            if not proc.stdout:
                return
            while True:
                chunk = proc.stdout.read(128 * 1024)
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                if proc.poll() is None:
                    proc.kill()
            except Exception:
                pass
            try:
                stderr = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
                if stderr:
                    app.logger.warning("yt-dlp %s %s: %s", kind, video_id, stderr[-1600:])
            except Exception:
                pass

    return Response(
        generate(),
        status=200,
        headers={
            "Content-Type": "audio/mp4" if kind == "audio" else "video/mp4",
            "Cache-Control": "no-store",
            "Content-Disposition": "inline",
            "X-1988-Stream": "audio" if kind == "audio" else "video-av",
            "X-1988-Format": fmt,
        },
    )


def media_response(video_id, kind):
    if request.method == "OPTIONS":
        return Response(status=204)

    if not valid_id(video_id):
        return jsonify({"ok": False, "error": "invalid_video"}), 400
    if not valid_kind(kind):
        return jsonify({"ok": False, "error": "invalid_kind"}), 400

    last_error = None
    for attempt in range(2):
        try:
            info = resolve_media(video_id, kind, force=(attempt == 1))
            upstream = upstream_request(info, method=request.method)

            if upstream.status_code in (401, 403, 410) and attempt == 0:
                upstream.close()
                _cache_drop(video_id, kind)
                continue

            if upstream.status_code >= 400:
                body = upstream.text[:240] if request.method == "GET" else ""
                upstream.close()
                return jsonify({
                    "ok": False,
                    "error": "upstream_http",
                    "status": upstream.status_code,
                    "detail": body,
                    "kind": kind,
                }), 502

            passthrough = {}
            for name in (
                "Content-Type",
                "Content-Length",
                "Content-Range",
                "Accept-Ranges",
                "ETag",
                "Last-Modified",
            ):
                value = upstream.headers.get(name)
                if value:
                    passthrough[name] = value

            passthrough["Content-Type"] = passthrough.get("Content-Type") or info["mimeType"]
            passthrough["Accept-Ranges"] = passthrough.get("Accept-Ranges") or "bytes"
            passthrough["Cache-Control"] = "no-store"
            passthrough["X-1988-Media"] = info.get("engine") or "1988-proxy"
            if kind == "audio":
                passthrough["X-1988-Audio"] = passthrough["X-1988-Media"]

            if request.method == "HEAD":
                upstream.close()
                return Response(status=upstream.status_code, headers=passthrough)

            @stream_with_context
            def generate():
                try:
                    for chunk in upstream.iter_content(chunk_size=128 * 1024):
                        if chunk:
                            yield chunk
                finally:
                    upstream.close()

            return Response(generate(), status=upstream.status_code, headers=passthrough)

        except Exception as exc:
            last_error = exc
            _cache_drop(video_id, kind)

    app.logger.error("%s proxy failed: %s", kind, last_error)
    return jsonify({
        "ok": False,
        "error": f"{kind}_proxy_failed",
        "detail": str(last_error)[:400],
    }), 502


@app.after_request
def add_cors(resp):
    return cors(resp)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "service": "1988-media",
        "engine": "yt-dlp+piped-proxy+stdout",
        "streamCompat": True,
        "videoMode": "muxed-av",
        "ytDlpBlocked": time.time() < _ytdlp_blocked_until,
        "proxyConfigured": bool(_proxy_url()),
        "cookiesConfigured": bool(_cookiefile()),
        "playerClients": _player_clients(),
        "version": getattr(yt_dlp.version, "__version__", "unknown"),
    })



def _tiktok_handle_from_url(value):
    text = str(value or "")
    match = re.search(r"tiktok\.com/@([A-Za-z0-9._-]{2,64})", text, re.I)
    return match.group(1) if match else ""


def _discover_tiktok_links(query, limit=24):
    try:
        response = requests.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 Chrome/153 Safari/537.36"
                ),
                "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.6",
            },
            proxies=_requests_proxies(),
            timeout=(6, 16),
        )
        response.raise_for_status()
        body = html.unescape(response.text)
        for _ in range(2):
            body = unquote(body)
    except Exception as exc:
        app.logger.warning("tiktok web discovery failed %s: %s", query, exc)
        return []

    pattern = re.compile(
        r"https?://(?:www\.)?tiktok\.com/@([A-Za-z0-9._-]{2,64})"
        r"(?:/video/(\d{12,24})|/live)?",
        re.I,
    )
    rows = []
    seen = set()
    for match in pattern.finditer(body):
        handle = match.group(1)
        post_id = match.group(2) or ""
        url = (
            f"https://www.tiktok.com/@{handle}/video/{post_id}"
            if post_id
            else f"https://www.tiktok.com/@{handle}"
        )
        key = (handle.lower(), post_id)
        if key in seen:
            continue
        seen.add(key)
        rows.append({"handle": handle, "id": post_id, "url": url})
        if len(rows) >= limit:
            break
    return rows


def _extract_tiktok_post_url(url):
    handle = _tiktok_handle_from_url(url)
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 15,
        "retries": 1,
    }
    proxy = _proxy_url()
    if proxy:
        opts["proxy"] = proxy
    cookiefile = _cookiefile()
    if cookiefile:
        opts["cookiefile"] = cookiefile

    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)

    row = _normalize_tiktok_entry(info or {}, handle)
    if not row:
        return None
    row["shareCount"] = int((info or {}).get("repost_count") or (info or {}).get("share_count") or 0)
    return row


def _tiktok_discovery_cache_get(key, ttl=300):
    with _lock:
        row = _tiktok_discovery_cache.get(key)
        if row and time.time() - row["at"] < ttl:
            return row["data"]
    return None


def _tiktok_discovery_cache_put(key, data):
    with _lock:
        _tiktok_discovery_cache[key] = {"at": time.time(), "data": data}
        if len(_tiktok_discovery_cache) > 40:
            oldest = min(_tiktok_discovery_cache.items(), key=lambda item: item[1]["at"])[0]
            _tiktok_discovery_cache.pop(oldest, None)


def _remember_tiktok_sources(rows):
    now = time.time()
    with _lock:
        for row in rows:
            handle = str(row.get("handle") or "").strip().lstrip("@")
            if TIKTOK_HANDLE_RE.fullmatch(handle):
                _tiktok_source_pool[handle.lower()] = {"handle": handle, "at": now}
        expired = [
            key for key, value in _tiktok_source_pool.items()
            if now - float(value.get("at") or 0) > 24 * 60 * 60
        ]
        for key in expired:
            _tiktok_source_pool.pop(key, None)


def _headline_tokens_tiktok(row):
    text = str(row.get("title") or row.get("description") or "")
    text = re.sub(r"[^0-9A-Za-zÀ-ỹ]+", " ", text.lower())
    stop = {
        "viet", "nam", "moi", "nhat", "hom", "nay", "tin", "tuc", "video",
        "clip", "chinh", "thuc", "cap", "nhat", "va", "cua", "cho", "voi",
        "tai", "trong", "mot", "cac", "khi", "tu", "den", "theo"
    }
    return {token for token in text.split() if len(token) >= 3 and token not in stop}


def _rank_tiktok_rows(rows, mode):
    now = time.time()
    tokens = [_headline_tokens_tiktok(row) for row in rows]
    handles = [str(row.get("handle") or row.get("uploader") or "").lower() for row in rows]
    coverage = []

    for i, mine in enumerate(tokens):
        related = set()
        if len(mine) >= 2:
            for j, theirs in enumerate(tokens):
                if i == j or handles[i] == handles[j]:
                    continue
                common = len(mine.intersection(theirs))
                threshold = max(2, int(min(len(mine), len(theirs)) * 0.34 + 0.999))
                if common >= threshold and handles[j]:
                    related.add(handles[j])
        coverage.append(len(related))

    def score(index):
        row = rows[index]
        views = max(0, int(row.get("viewCount") or 0))
        ts = max(0, int(row.get("timestamp") or 0))
        hours = max(1.0, (now - ts) / 3600.0) if ts else 9999.0
        velocity = views / hours
        cov = coverage[index]

        if mode == "views":
            return (views, ts)
        if mode == "trending":
            return ((0 if velocity <= 0 else __import__("math").log10(velocity + 1)) * 24 + cov * 8 - hours / 24, ts)
        if mode == "interest":
            return (cov * 100 + (0 if views <= 0 else __import__("math").log10(views + 10)) * 7 - hours / 36, ts)
        if mode == "top":
            return (
                (0 if views <= 0 else __import__("math").log10(views + 10)) * 11
                + (0 if velocity <= 0 else __import__("math").log10(velocity + 1)) * 15
                + cov * 14
                - hours / 30,
                ts,
            )
        return (ts, views)

    order = sorted(range(len(rows)), key=score, reverse=True)
    return [rows[index] for index in order]


def discover_tiktok_feed(mode="latest", limit=50):
    mode = mode if mode in ("latest", "top", "trending", "interest", "views") else "latest"
    key = f"discover:{mode}:{limit}"
    cached = _tiktok_discovery_cache_get(key, ttl=5 * 60)
    if cached is not None:
        return cached

    queries = [
        'site:tiktok.com/@ "video" "Việt Nam" "tin tức" hôm nay',
        'site:tiktok.com/@ "video" "Việt Nam" "thời sự" mới nhất',
        'site:tiktok.com/@ "video" "Việt Nam" "tin nóng"',
        'site:tiktok.com/@ "video" "Việt Nam" "quốc tế"',
        'site:tiktok.com/@ "video" "Việt Nam" "thể thao"',
        'site:tiktok.com/@ "video" "Việt Nam" "công nghệ"',
    ]

    discovered = []
    seen_urls = set()
    for query in queries:
        for row in _discover_tiktok_links(query, limit=20):
            if not row.get("id"):
                continue
            url = row["url"]
            if url in seen_urls:
                continue
            seen_urls.add(url)
            discovered.append(url)
            if len(discovered) >= 72:
                break
        if len(discovered) >= 72:
            break

    rows = []
    enriched_urls = set()
    workers = min(6, max(1, len(discovered)))
    if discovered:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            future_map = {pool.submit(_extract_tiktok_post_url, url): url for url in discovered}
            for future in as_completed(future_map):
                url = future_map[future]
                try:
                    row = future.result()
                    if row:
                        rows.append(row)
                        enriched_urls.add(url)
                except Exception as exc:
                    app.logger.debug("tiktok post enrich failed %s: %s", url, exc)

    # Direct TikTok post embeds only need the post ID. If yt-dlp cannot enrich
    # metadata for a post, keep the discovered post instead of dropping the feed.
    for url in discovered:
        if url in enriched_urls:
            continue
        match = re.search(r"tiktok\.com/@([A-Za-z0-9._-]{2,64})/video/(\d{12,24})", url, re.I)
        if not match:
            continue
        handle, post_id = match.group(1), match.group(2)
        rows.append({
            "id": post_id,
            "platform": "tiktok",
            "handle": handle,
            "uploader": handle,
            "title": "",
            "description": "",
            "thumbnail": "",
            "duration": 0,
            "timestamp": _tiktok_timestamp_from_id(post_id),
            "viewCount": 0,
            "likeCount": 0,
            "commentCount": 0,
            "shareCount": 0,
            "url": url,
            "embedUrl": (
                f"https://www.tiktok.com/player/v1/{post_id}"
                "?autoplay=1&controls=1&progress_bar=1&play_button=1"
                "&volume_control=1&fullscreen_button=1&timestamp=1"
                "&loop=0&music_info=0&description=0&rel=0"
                "&native_context_menu=0&closed_caption=0"
            ),
        })

    now = int(time.time())
    max_age = 72 * 3600 if mode == "latest" else 7 * 24 * 3600
    rows = [
        row for row in rows
        if int(row.get("timestamp") or 0)
        and -6 * 3600 <= now - int(row.get("timestamp") or 0) <= max_age
    ]

    seen = set()
    unique = []
    for row in rows:
        post_id = str(row.get("id") or "")
        if not post_id or post_id in seen:
            continue
        seen.add(post_id)
        unique.append(row)

    ranked = _rank_tiktok_rows(unique, mode)[: max(1, min(int(limit or 50), 80))]
    _remember_tiktok_sources(ranked)
    payload = {"items": ranked, "sources": sorted({str(row.get("handle") or "") for row in ranked if row.get("handle")})}
    _tiktok_discovery_cache_put(key, payload)
    return payload


def _probe_tiktok_live(handle):
    handle = str(handle or "").strip().lstrip("@")
    if not TIKTOK_HANDLE_RE.fullmatch(handle):
        return None

    url = f"https://www.tiktok.com/@{handle}/live"
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 14,
        "retries": 1,
    }
    proxy = _proxy_url()
    if proxy:
        opts["proxy"] = proxy
    cookiefile = _cookiefile()
    if cookiefile:
        opts["cookiefile"] = cookiefile

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        low = str(exc).lower()
        if "not currently live" not in low:
            app.logger.debug("tiktok live probe failed %s: %s", handle, exc)
        return None

    if not info:
        return None

    formats = list(info.get("formats") or [])
    hls = None
    for fmt in sorted(formats, key=lambda row: int(row.get("height") or 0), reverse=True):
        protocol = str(fmt.get("protocol") or "").lower()
        ext = str(fmt.get("ext") or "").lower()
        candidate = str(fmt.get("url") or "")
        if candidate and ("m3u8" in protocol or ext == "m3u8" or ".m3u8" in candidate):
            hls = candidate
            break

    return {
        "id": str(info.get("id") or handle),
        "platform": "tiktok",
        "live": True,
        "handle": handle,
        "uploader": str(info.get("uploader") or info.get("creator") or handle),
        "title": str(info.get("title") or f"@{handle} đang LIVE"),
        "thumbnail": str(info.get("thumbnail") or ""),
        "viewCount": int(info.get("concurrent_view_count") or info.get("view_count") or 0),
        "timestamp": int(info.get("timestamp") or time.time()),
        "url": url,
        "streamUrl": hls or "",
    }


def discover_tiktok_live(limit=20):
    key = f"live:{limit}"
    cached = _tiktok_discovery_cache_get(key, ttl=60)
    if cached is not None:
        return cached

    handles = []
    with _lock:
        handles.extend(value["handle"] for value in _tiktok_source_pool.values())

    if len(handles) < 12:
        for query in (
            'site:tiktok.com/@ "live" "Việt Nam" tin tức',
            'site:tiktok.com/@ "live" "Việt Nam"',
            'site:tiktok.com/@ "LIVE" "Việt Nam" truyền hình',
        ):
            for row in _discover_tiktok_links(query, limit=24):
                handle = row.get("handle") or ""
                if handle and handle.lower() not in {item.lower() for item in handles}:
                    handles.append(handle)
            if len(handles) >= 28:
                break

    handles = handles[:28]
    rows = []
    if handles:
        with ThreadPoolExecutor(max_workers=min(8, len(handles))) as pool:
            futures = {pool.submit(_probe_tiktok_live, handle): handle for handle in handles}
            for future in as_completed(futures):
                try:
                    row = future.result()
                    if row:
                        rows.append(row)
                except Exception:
                    pass

    rows.sort(key=lambda row: int(row.get("viewCount") or 0), reverse=True)
    payload = {"items": rows[: max(1, min(int(limit or 20), 40))], "sources": handles}
    _tiktok_discovery_cache_put(key, payload)
    return payload


@app.route("/tiktok/discover", methods=["GET"])
def tiktok_discover():
    mode = (request.args.get("mode") or "latest").strip().lower()
    limit = max(1, min(int(request.args.get("limit") or "50"), 80))
    try:
        return jsonify({"ok": True, "data": discover_tiktok_feed(mode, limit)})
    except Exception as exc:
        app.logger.warning("tiktok discover failed: %s", exc)
        return jsonify({"ok": False, "error": "tiktok_discover_failed", "detail": str(exc)[:300]}), 502


@app.route("/tiktok/live", methods=["GET"])
def tiktok_live():
    limit = max(1, min(int(request.args.get("limit") or "20"), 40))
    try:
        return jsonify({"ok": True, "data": discover_tiktok_live(limit)})
    except Exception as exc:
        app.logger.warning("tiktok live discover failed: %s", exc)
        return jsonify({"ok": False, "error": "tiktok_live_failed", "detail": str(exc)[:300]}), 502


@app.route("/tiktok/profile", methods=["GET"])
def tiktok_profile():
    handle = (request.args.get("handle") or "").strip().lstrip("@")
    limit = request.args.get("limit") or "12"
    try:
        rows = extract_tiktok_profile(handle, int(limit))
        return jsonify({"ok": True, "data": {"handle": handle, "items": rows}})
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception as exc:
        app.logger.warning("tiktok profile failed %s: %s", handle, exc)
        return jsonify({
            "ok": False,
            "error": "tiktok_profile_failed",
            "handle": handle,
            "detail": str(exc)[:400],
        }), 502


@app.route("/tiktok/feed", methods=["GET"])
def tiktok_feed():
    handles_raw = (request.args.get("handles") or "").strip()
    limit = max(1, min(int(request.args.get("limit") or "8"), 16))
    handles = []
    for raw in handles_raw.split(","):
        handle = raw.strip().lstrip("@")
        if TIKTOK_HANDLE_RE.fullmatch(handle) and handle not in handles:
            handles.append(handle)
    handles = handles[:16]

    if not handles:
        return jsonify({"ok": False, "error": "missing_tiktok_handles"}), 400

    items = []
    errors = []
    workers = min(5, len(handles))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_map = {
            pool.submit(extract_tiktok_profile, handle, limit): handle
            for handle in handles
        }
        for future in as_completed(future_map):
            handle = future_map[future]
            try:
                items.extend(future.result())
            except Exception as exc:
                errors.append({"handle": handle, "error": str(exc)[:180]})

    seen = set()
    merged = []
    for row in sorted(
        items,
        key=lambda item: (int(item.get("timestamp") or 0), int(item.get("viewCount") or 0)),
        reverse=True,
    ):
        video_id = str(row.get("id") or "")
        if not video_id or video_id in seen:
            continue
        seen.add(video_id)
        merged.append(row)

    return jsonify({
        "ok": True,
        "data": {
            "items": merged[:80],
            "sources": handles,
            "errors": errors,
        },
    })


@app.route("/resolve", methods=["GET"])
def resolve():
    video_id = (request.args.get("id") or "").strip()
    kind = (request.args.get("kind") or "audio").strip().lower()
    if not valid_id(video_id):
        return jsonify({"ok": False, "error": "invalid_video"}), 400
    if not valid_kind(kind):
        return jsonify({"ok": False, "error": "invalid_kind"}), 400

    try:
        info = resolve_media(video_id, kind)
        endpoint = "audio" if kind == "audio" else "video"
        return jsonify({
            "ok": True,
            "data": {
                "id": video_id,
                "kind": kind,
                "title": info["title"],
                "uploader": info["uploader"],
                "thumbnailUrl": info["thumbnail"],
                "duration": info["duration"],
                "mimeType": info["mimeType"],
                "ext": info["ext"],
                "acodec": info["acodec"],
                "vcodec": info["vcodec"],
                "protocol": info["protocol"],
                "formatId": info["formatId"],
                "engine": info.get("engine") or "",
                "mediaUrl": f"/{endpoint}?id={video_id}",
                "audioUrl": f"/audio?id={video_id}" if kind == "audio" else "",
                "videoUrl": f"/video?id={video_id}" if kind == "video" else "",
            },
        })
    except Exception as exc:
        app.logger.exception("resolve failed")
        return jsonify({
            "ok": False,
            "error": "resolve_failed",
            "kind": kind,
            "detail": str(exc)[:400],
        }), 502


@app.route("/media", methods=["GET", "HEAD", "OPTIONS"])
def media():
    video_id = (request.args.get("id") or "").strip()
    kind = (request.args.get("kind") or "video").strip().lower()
    return media_response(video_id, kind)


@app.route("/stream", methods=["GET", "HEAD", "OPTIONS"])
def stream():
    video_id = (request.args.get("v") or request.args.get("id") or "").strip()
    # Resolve before writing a 200 response. If YouTube blocks the Render IP,
    # media_response returns a real 502 instead of a misleading 200/0-byte body.
    return media_response(video_id, "video")


@app.route("/audio", methods=["GET", "HEAD", "OPTIONS"])
def audio():
    video_id = (request.args.get("v") or request.args.get("id") or "").strip()
    return media_response(video_id, "audio")


@app.route("/video", methods=["GET", "HEAD", "OPTIONS"])
def video():
    video_id = (request.args.get("v") or request.args.get("id") or "").strip()
    return media_response(video_id, "video")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port, threaded=True)
