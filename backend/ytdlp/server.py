import base64
import os
import re
import time
import threading
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

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
