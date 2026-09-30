#!/usr/bin/env python3
import json
import os
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
    if ".flv" in value:
        return "flv"
    return "unknown"

def choose_stream(info):
    info = info or {}
    candidates = []

    def add(url, kind="", fmt=None, source=""):
        url = str(url or "")
        if not url:
            return
        fmt = fmt or {}
        protocol = str(fmt.get("protocol") or "").lower()
        ext = str(fmt.get("ext") or "").lower()
        vcodec = str(fmt.get("vcodec") or fmt.get("video_codec") or "").lower()
        acodec = str(fmt.get("acodec") or fmt.get("audio_codec") or "").lower()
        format_id = str(fmt.get("format_id") or "")
        height = int(fmt.get("height") or 0)
        tbr = float(fmt.get("tbr") or 0)
        if not kind:
            if ext == "flv" or ".flv" in url.lower():
                kind = "flv"
            else:
                kind = detect_type(url)
        # TikTok LIVE playback is FLV-only. Ignore every non-FLV candidate
        # so no downstream code can accidentally promote it to LIVE media.
        if kind != "flv":
            return
        candidates.append({
            "url": url,
            "kind": kind,
            "vcodec": vcodec,
            "acodec": acodec,
            "format_id": format_id,
            "height": height,
            "tbr": tbr,
            "source": source,
        })

    manifest = str(info.get("manifest_url") or "")
    if manifest and ".flv" in manifest.lower():
        add(manifest, "flv", source="manifest_url")

    direct = str(info.get("url") or "")
    if direct:
        add(direct, source="direct_url")

    for fmt in info.get("formats") or []:
        add(fmt.get("url"), fmt=fmt, source="format")

    def score(row):
        s = 0
        # FLV is the only accepted TikTok LIVE transport.
        if row["kind"] == "flv":
            s += 12000

        # Critical: Chrome/Safari compatibility. Prefer AVC/H.264 and avoid HEVC
        # unless it is the only available stream.
        vc = row["vcodec"]
        if any(x in vc for x in ("avc", "h264", "avc1")):
            s += 4000
        elif any(x in vc for x in ("hevc", "h265", "hev1", "hvc1")):
            s -= 3000
        elif vc in ("", "none"):
            s += 300

        # Prefer normal main video qualities over audio-only or odd variants.
        fid = row["format_id"].lower()
        if "audio" in fid or "ao" == fid:
            s -= 5000
        if row["height"]:
            s += min(row["height"], 1080)
        s += min(int(row["tbr"] or 0), 3000) / 10
        if row["source"] == "format":
            s += 200
        return s

    candidates.sort(key=score, reverse=True)
    best = candidates[0] if candidates else None
    if not best:
        return "", "", {}

    return best["url"], best["kind"], {
        "vcodec": best["vcodec"],
        "acodec": best["acodec"],
        "format_id": best["format_id"],
        "height": best["height"],
        "tbr": best["tbr"],
        "source": best["source"],
        "candidate_count": len(candidates),
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "missing_url"}))
        return

    target_url = sys.argv[1].strip()
    signal.signal(signal.SIGALRM, _alarm_handler)
    signal.alarm(18)

    cookie_header = str(os.environ.get("TIKTOK_COOKIE_HEADER") or "").strip()
    http_headers = {
        "User-Agent": UA,
        "Referer": target_url,
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.7,en;q=0.5",
    }
    if cookie_header:
        http_headers["Cookie"] = cookie_header

    opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "FULL_HD1/HD1/best",
        "socket_timeout": 8,
        "retries": 0,
        "extractor_retries": 0,
        "user_agent": UA,
        "http_headers": http_headers,
        "noplaylist": True,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(target_url, download=False) or {}

        stream_url, stream_type, selected = choose_stream(info)
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
            "flv": stream_url if stream_type == "flv" else "",
            "is_live": bool(
                info.get("is_live")
                or str(info.get("live_status") or "").lower() == "is_live"
                or stream_url
            ),
            "title": str(info.get("title") or ""),
            "thumbnail": str(
                info.get("thumbnail")
                or (info.get("thumbnails") or [{}])[-1].get("url")
                or ""
            ),
            "uploader": str(info.get("uploader") or ""),
            "id": str(info.get("id") or ""),
            "method": "python_yt_dlp_extract_info",
            "selected": selected,
        }, ensure_ascii=False))
    except ExtractTimeout:
        print(json.dumps({"success": False, "error": "extract_timeout"}, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"success": False, "error": str(exc)}, ensure_ascii=False))
    finally:
        signal.alarm(0)

if __name__ == "__main__":
    main()
