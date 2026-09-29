#!/usr/bin/env python3
import json
import subprocess
import sys
import yt_dlp

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

def stream_type(url):
    value = str(url or "").lower()
    if ".m3u8" in value:
        return "hls"
    if ".flv" in value:
        return "flv"
    if ".mp4" in value:
        return "mp4"
    return "unknown"

def cli_fast_path(target_url):
    # This is deliberately the same simple yt-dlp -g route that proved able
    # to return TikTok's current LIVE media URL on this Render service.
    proc = subprocess.run(
        [
            "yt-dlp", "-g",
            "--no-warnings",
            "--socket-timeout", "8",
            "--retries", "1",
            "--extractor-retries", "1",
            target_url,
        ],
        capture_output=True,
        text=True,
        timeout=15,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "yt-dlp -g failed").strip())
    urls = [line.strip() for line in (proc.stdout or "").splitlines() if line.strip().startswith(("http://", "https://"))]
    if not urls:
        raise RuntimeError("yt-dlp -g returned no URL")
    url = next((u for u in urls if ".m3u8" in u.lower()), None)
    if not url:
        url = next((u for u in urls if ".flv" in u.lower()), None)
    if not url:
        url = urls[0]
    return {
        "success": True,
        "stream_url": url,
        "stream_type": stream_type(url),
        "is_live": True,
        "title": "",
        "uploader": "",
        "id": "",
        "method": "python_cli_g",
    }

def module_fallback(target_url):
    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "best",
        "socket_timeout": 8,
        "retries": 1,
        "extractor_retries": 1,
        "user_agent": UA,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(target_url, download=False) or {}

    candidates = []
    manifest = str(info.get("manifest_url") or "")
    if manifest:
        candidates.append(manifest)
    direct = str(info.get("url") or "")
    if direct:
        candidates.append(direct)
    for fmt in info.get("formats") or []:
        url = str(fmt.get("url") or "")
        if url:
            candidates.append(url)

    url = next((u for u in candidates if ".m3u8" in u.lower()), None)
    if not url:
        url = next((u for u in candidates if ".flv" in u.lower()), None)
    if not url and candidates:
        url = candidates[0]
    if not url:
        raise RuntimeError("Không tìm thấy URL luồng trực tiếp")

    return {
        "success": True,
        "stream_url": url,
        "stream_type": stream_type(url),
        "is_live": bool(info.get("is_live") or str(info.get("live_status") or "").lower() == "is_live" or url),
        "title": str(info.get("title") or ""),
        "uploader": str(info.get("uploader") or ""),
        "id": str(info.get("id") or ""),
        "method": "python_yt_dlp",
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "missing_url"}))
        return

    target_url = sys.argv[1].strip()
    first_error = ""
    try:
        result = cli_fast_path(target_url)
        print(json.dumps(result, ensure_ascii=False))
        return
    except Exception as exc:
        first_error = str(exc)

    try:
        result = module_fallback(target_url)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({
            "success": False,
            "error": str(exc),
            "fast_error": first_error,
        }, ensure_ascii=False))

if __name__ == "__main__":
    main()
