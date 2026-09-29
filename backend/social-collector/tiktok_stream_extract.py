#!/usr/bin/env python3
import json
import sys
import yt_dlp

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def pick_stream(info):
    formats = info.get("formats") or []
    hls = []
    flv = []
    for f in formats:
        url = str(f.get("url") or "")
        protocol = str(f.get("protocol") or "").lower()
        ext = str(f.get("ext") or "").lower()
        if "m3u8" in protocol or ".m3u8" in url.lower():
            hls.append(f)
        elif ext == "flv" or ".flv" in url.lower():
            flv.append(f)

    # Prefer an HLS manifest because browsers can play it through hls.js.
    for value in (info.get("manifest_url"),):
        value = str(value or "")
        if ".m3u8" in value.lower():
            return value, "hls"

    if hls:
        return str(hls[-1].get("url") or ""), "hls"
    if flv:
        return str(flv[-1].get("url") or ""), "flv"

    value = str(info.get("url") or "")
    if ".m3u8" in value.lower():
        return value, "hls"
    if ".flv" in value.lower():
        return value, "flv"
    return value, "unknown" if value else ""

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "missing_url"}))
        return

    target_url = sys.argv[1].strip()
    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "best",
        "socket_timeout": 12,
        "retries": 1,
        "extractor_retries": 1,
        "user_agent": UA,
        "noplaylist": True,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(target_url, download=False)
        stream_url, stream_type = pick_stream(info or {})
        if not stream_url:
            print(json.dumps({"success": False, "error": "stream_not_found"}))
            return
        print(json.dumps({
            "success": True,
            "stream_url": stream_url,
            "stream_type": stream_type,
            "is_live": bool((info or {}).get("is_live") or str((info or {}).get("live_status") or "").lower() == "is_live"),
            "title": str((info or {}).get("title") or ""),
            "uploader": str((info or {}).get("uploader") or ""),
            "id": str((info or {}).get("id") or ""),
        }, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
