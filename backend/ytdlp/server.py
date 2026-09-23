import os
import re
import time
import threading
from flask import Flask, Response, jsonify, request, stream_with_context
import requests
import yt_dlp

app = Flask(__name__)

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")
CACHE_TTL = 600
YTDLP_BLOCK_TTL = 30 * 60
PIPED_EDGE = "https://gcnoahqsrquxkwkjbuxy.supabase.co/functions/v1/yt1988"
_cache = {}
_lock = threading.Lock()
_ytdlp_blocked_until = 0

def cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,HEAD,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Range,Content-Type"
    resp.headers["Access-Control-Expose-Headers"] = "Content-Length,Content-Range,Accept-Ranges,X-1988-Audio"
    return resp

def valid_id(video_id):
    return bool(VIDEO_ID_RE.fullmatch(video_id or ""))

def _cache_put(video_id, data):
    with _lock:
        _cache[video_id] = {"at": time.time(), "data": data}
        if len(_cache) > 80:
            oldest = min(_cache.items(), key=lambda item: item[1]["at"])[0]
            _cache.pop(oldest, None)


def _resolve_with_ytdlp(video_id):
    global _ytdlp_blocked_until

    url = f"https://www.youtube.com/watch?v={video_id}"
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
        "format": "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio",
        "extractor_args": {
            "youtube": {
                "player_client": ["web_safari", "android_vr", "ios"]
            }
        },
        "socket_timeout": 12,
        "retries": 1,
        "fragment_retries": 1,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        message = str(exc)
        if "not a bot" in message.lower() or "sign in to confirm" in message.lower():
            _ytdlp_blocked_until = time.time() + YTDLP_BLOCK_TTL
        raise

    stream_url = info.get("url") or ""
    if not stream_url:
        raise RuntimeError("no_audio_url")

    headers = dict(info.get("http_headers") or {})
    headers.setdefault("User-Agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")
    headers.setdefault("Accept", "*/*")

    ext = str(info.get("ext") or "").lower()
    acodec = str(info.get("acodec") or "").lower()
    if ext in ("m4a", "mp4") or "mp4a" in acodec:
        mime = "audio/mp4"
    elif ext == "webm" or "opus" in acodec:
        mime = "audio/webm"
    else:
        mime = "audio/mpeg"

    return {
        "id": video_id,
        "title": info.get("title") or "",
        "uploader": info.get("uploader") or info.get("channel") or "",
        "thumbnail": info.get("thumbnail") or "",
        "duration": info.get("duration") or 0,
        "mimeType": mime,
        "ext": ext,
        "acodec": acodec,
        "url": stream_url,
        "headers": headers,
        "engine": "yt-dlp",
    }


def _resolve_with_piped(video_id):
    response = requests.get(
        PIPED_EDGE,
        params={"action": "background", "id": video_id},
        headers={"Accept": "application/json"},
        timeout=(5, 15),
    )
    response.raise_for_status()
    payload = response.json()
    data = payload.get("data") or {}
    sources = [row for row in (data.get("sources") or []) if row.get("url")]
    if not sources:
        raise RuntimeError("no_piped_audio_source")

    def rank(row):
        mime = str(row.get("mimeType") or "").lower()
        if "audio/mp4" in mime or "m4a" in mime:
            type_score = 4
        elif "mpegurl" in mime or "m3u8" in mime:
            type_score = 3
        elif "audio/webm" in mime:
            type_score = 2
        else:
            type_score = 1
        return type_score * 1_000_000_000 + int(row.get("bitrate") or 0)

    source = sorted(sources, key=rank, reverse=True)[0]
    mime = str(source.get("mimeType") or "audio/mp4")

    return {
        "id": video_id,
        "title": data.get("title") or "",
        "uploader": data.get("uploader") or "",
        "thumbnail": data.get("thumbnailUrl") or "",
        "duration": data.get("duration") or 0,
        "mimeType": mime,
        "ext": "m4a" if "mp4" in mime else "",
        "acodec": "",
        "url": str(source["url"]),
        "headers": {
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
            "Accept": "*/*",
        },
        "engine": "piped-proxy",
    }


def resolve_audio(video_id, force=False):
    global _ytdlp_blocked_until

    now = time.time()
    if not force:
        with _lock:
            row = _cache.get(video_id)
            if row and now - row["at"] < CACHE_TTL:
                return row["data"]

    errors = []

    if now >= _ytdlp_blocked_until:
        try:
            data = _resolve_with_ytdlp(video_id)
            _cache_put(video_id, data)
            return data
        except Exception as exc:
            errors.append(f"yt-dlp:{exc}")

    try:
        data = _resolve_with_piped(video_id)
        _cache_put(video_id, data)
        return data
    except Exception as exc:
        errors.append(f"piped:{exc}")

    raise RuntimeError(" | ".join(errors) or "no_audio_source")

def upstream_request(info, method="GET"):
    headers = dict(info["headers"])
    incoming_range = request.headers.get("Range")
    if incoming_range:
        headers["Range"] = incoming_range

    return requests.request(
        method,
        info["url"],
        headers=headers,
        stream=(method == "GET"),
        allow_redirects=True,
        timeout=(10, 45),
    )

@app.after_request
def add_cors(resp):
    return cors(resp)

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": True,
        "service": "1988-audio",
        "engine": "yt-dlp+piped-proxy",
        "ytDlpBlocked": time.time() < _ytdlp_blocked_until,
        "version": getattr(yt_dlp.version, "__version__", "unknown"),
    })

@app.route("/resolve", methods=["GET"])
def resolve():
    video_id = (request.args.get("id") or "").strip()
    if not valid_id(video_id):
        return jsonify({"ok": False, "error": "invalid_video"}), 400
    try:
        info = resolve_audio(video_id)
        return jsonify({
            "ok": True,
            "data": {
                "id": video_id,
                "title": info["title"],
                "uploader": info["uploader"],
                "thumbnailUrl": info["thumbnail"],
                "duration": info["duration"],
                "mimeType": info["mimeType"],
                "ext": info["ext"],
                "acodec": info["acodec"],
                "engine": info.get("engine") or "",
                "audioUrl": f"/audio?id={video_id}",
            },
        })
    except Exception as exc:
        app.logger.exception("resolve failed")
        return jsonify({"ok": False, "error": "resolve_failed", "detail": str(exc)[:240]}), 502

@app.route("/audio", methods=["GET", "HEAD", "OPTIONS"])
def audio():
    if request.method == "OPTIONS":
        return Response(status=204)

    video_id = (request.args.get("id") or "").strip()
    if not valid_id(video_id):
        return jsonify({"ok": False, "error": "invalid_video"}), 400

    last_error = None
    for attempt in range(2):
        try:
            info = resolve_audio(video_id, force=(attempt == 1))
            upstream = upstream_request(info, method=request.method)

            if upstream.status_code in (401, 403, 410) and attempt == 0:
                upstream.close()
                with _lock:
                    _cache.pop(video_id, None)
                continue

            if upstream.status_code >= 400:
                body = upstream.text[:180] if request.method == "GET" else ""
                upstream.close()
                return jsonify({
                    "ok": False,
                    "error": "upstream_http",
                    "status": upstream.status_code,
                    "detail": body,
                }), 502

            passthrough = {}
            for name in ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"):
                value = upstream.headers.get(name)
                if value:
                    passthrough[name] = value

            passthrough["Content-Type"] = passthrough.get("Content-Type") or info["mimeType"]
            passthrough["Accept-Ranges"] = passthrough.get("Accept-Ranges") or "bytes"
            passthrough["Cache-Control"] = "no-store"
            passthrough["X-1988-Audio"] = info.get("engine") or "1988-proxy"

            if request.method == "HEAD":
                upstream.close()
                return Response(status=upstream.status_code, headers=passthrough)

            @stream_with_context
            def generate():
                try:
                    for chunk in upstream.iter_content(chunk_size=64 * 1024):
                        if chunk:
                            yield chunk
                finally:
                    upstream.close()

            return Response(generate(), status=upstream.status_code, headers=passthrough)

        except Exception as exc:
            last_error = exc
            with _lock:
                _cache.pop(video_id, None)

    app.logger.exception("audio proxy failed", exc_info=last_error)
    return jsonify({"ok": False, "error": "audio_proxy_failed", "detail": str(last_error)[:240]}), 502

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "10000"))
    app.run(host="0.0.0.0", port=port, threaded=True)
