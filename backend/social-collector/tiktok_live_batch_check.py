#!/usr/bin/env python3
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import yt_dlp

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


def detect_type(url):
    value = str(url or "").lower()
    if ".flv" in value:
        return "flv"
    if ".m3u8" in value:
        return "hls"
    if ".mp4" in value:
        return "mp4"
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
            elif "m3u8" in protocol or ".m3u8" in url.lower():
                kind = "hls"
            else:
                kind = detect_type(url)

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

    direct = str(info.get("url") or "")
    if direct:
        add(direct, source="direct_url")

    manifest = str(info.get("manifest_url") or "")
    if manifest:
        add(manifest, detect_type(manifest), source="manifest_url")

    for fmt in info.get("formats") or []:
        add(fmt.get("url"), fmt=fmt, source="format")

    def score(row):
        s = 0
        # Prefer FLV for this project. HLS is kept as fallback.
        if row["kind"] == "flv":
            s += 12000
        elif row["kind"] == "hls":
            s += 8000
        elif row["kind"] == "mp4":
            s += 3000

        vc = row["vcodec"]
        if any(x in vc for x in ("avc", "h264", "avc1")):
            s += 4000
        elif any(x in vc for x in ("hevc", "h265", "hev1", "hvc1")):
            s -= 4000
        elif vc in ("", "none"):
            s += 300

        fid = row["format_id"].lower()
        if "audio" in fid or fid == "ao":
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


def process(username):
    username = str(username or "").strip().replace("@", "")
    target = f"https://www.tiktok.com/@{username}/live"
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "socket_timeout": 4,
        "retries": 0,
        "extractor_retries": 0,
        "user_agent": UA,
        "noplaylist": True,
    }

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(target, download=False) or {}

        stream_url, stream_type, selected = choose_stream(info)
        live_flag = bool(
            info.get("is_live")
            or str(info.get("live_status") or "").lower() == "is_live"
            or stream_url
        )

        if not live_flag or not stream_url:
            return {
                "username": username,
                "status": "OFFLINE",
                "live": False,
                "stream_url": "",
                "stream_type": "",
                "message": "not_live",
            }

        return {
            "username": username,
            "status": "LIVE",
            "live": True,
            "stream_url": stream_url,
            "stream_type": stream_type,
            "selected": selected,
            "title": str(info.get("title") or ""),
            "message": "stream_found",
        }
    except yt_dlp.utils.DownloadError as exc:
        message = str(exc)
        low = message.lower()
        offline_markers = (
            "not live",
            "isn't live",
            "is not live",
            "offline",
            "video unavailable",
            "this live has ended",
        )
        status = "OFFLINE" if any(x in low for x in offline_markers) else "ERROR"
        return {
            "username": username,
            "status": status,
            "live": False,
            "stream_url": "",
            "stream_type": "",
            "message": message[:300],
        }
    except Exception as exc:
        return {
            "username": username,
            "status": "ERROR",
            "live": False,
            "stream_url": "",
            "stream_type": "",
            "message": str(exc)[:300],
        }


def main():
    handles = [x.strip().replace("@", "") for x in sys.argv[1:] if x.strip()]
    handles = list(dict.fromkeys(handles))[:10]
    if not handles:
        print("[]")
        return

    results = []
    workers = min(5, len(handles))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        future_map = {executor.submit(process, handle): handle for handle in handles}
        for future in as_completed(future_map):
            try:
                results.append(future.result())
            except Exception as exc:
                results.append({
                    "username": future_map[future],
                    "status": "ERROR",
                    "live": False,
                    "stream_url": "",
                    "stream_type": "",
                    "message": str(exc)[:300],
                })

    order = {handle: index for index, handle in enumerate(handles)}
    results.sort(key=lambda row: order.get(str(row.get("username") or ""), 999))
    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
