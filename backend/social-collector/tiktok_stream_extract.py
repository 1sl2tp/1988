#!/usr/bin/env python3
import json
import signal
import sys
import yt_dlp

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

class ExtractTimeout(Exception):
    pass

def _alarm_handler(signum, frame):
    raise ExtractTimeout("extract_timeout")

def detect_type(url):
    value = str(url or "").lower()
    if ".m3u8" in value:
        return "hls"
    if ".flv" in value:
        return "flv"
    if ".mp4" in value:
        return "mp4"
    return "unknown"

def choose_stream(info):
    info = info or {}
    candidates = []

    manifest = str(info.get("manifest_url") or "")
    if manifest:
        candidates.append(("hls" if ".m3u8" in manifest.lower() else detect_type(manifest), manifest))

    direct = str(info.get("url") or "")
    if direct:
        candidates.append((detect_type(direct), direct))

    for fmt in info.get("formats") or []:
        url = str(fmt.get("url") or "")
        if not url:
            continue
        protocol = str(fmt.get("protocol") or "").lower()
        ext = str(fmt.get("ext") or "").lower()
        kind = "hls" if ("m3u8" in protocol or ".m3u8" in url.lower()) else (
            "flv" if (ext == "flv" or ".flv" in url.lower()) else detect_type(url)
        )
        candidates.append((kind, url))

    for wanted in ("hls", "flv", "mp4", "unknown"):
        for kind, url in candidates:
            if kind == wanted and url:
                return url, kind
    return "", ""

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "missing_url"}))
        return

    target_url = sys.argv[1].strip()
    signal.signal(signal.SIGALRM, _alarm_handler)
    signal.alarm(18)

    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "best",
        "socket_timeout": 8,
        "retries": 0,
        "extractor_retries": 0,
        "user_agent": UA,
        "noplaylist": True,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(target_url, download=False) or {}

        stream_url, stream_type = choose_stream(info)
        if not stream_url:
            print(json.dumps({
                "success": False,
                "error": "stream_not_found",
                "is_live": bool(info.get("is_live")),
            }, ensure_ascii=False))
            return

        print(json.dumps({
            "success": True,
            "stream_url": stream_url,
            "stream_type": stream_type,
            "m3u8": stream_url if stream_type == "hls" else "",
            "flv": stream_url if stream_type == "flv" else "",
            "is_live": bool(
                info.get("is_live")
                or str(info.get("live_status") or "").lower() == "is_live"
                or stream_url
            ),
            "title": str(info.get("title") or ""),
            "uploader": str(info.get("uploader") or ""),
            "id": str(info.get("id") or ""),
            "method": "python_yt_dlp_extract_info",
        }, ensure_ascii=False))
    except ExtractTimeout:
        print(json.dumps({"success": False, "error": "extract_timeout"}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
    finally:
        signal.alarm(0)

if __name__ == "__main__":
    main()
