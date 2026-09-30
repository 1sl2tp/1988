#!/usr/bin/env python3
import json
import sys
import time
import urllib.request
import urllib.error

API = "https://one988-tiktok-session.onrender.com"
ALLOWED = {
    "live_ready",
    "live_verifying_flv",
    "live_resolving_flv",
    "live_unverified",
    "offline",
    "unknown",
    "checking",
}

def get_json(path, timeout=30):
    req = urllib.request.Request(
        API + path,
        headers={"User-Agent": "1988-live-coverage-check/1.0", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)

def wait_statuses():
    last = None
    for i in range(32):
        try:
            data = get_json(f"/tiktok/live-statuses?refresh=1&t={int(time.time())}", timeout=30)
            last = data
            if data.get("ok") and data.get("exhaustive") and isinstance(data.get("items"), list):
                return data
        except Exception as e:
            last = repr(e)
        print(f"WAIT {i+1}/32 {last if isinstance(last,str) else 'endpoint_not_ready'}", flush=True)
        time.sleep(15)
    raise RuntimeError(f"live-statuses endpoint not ready: {last!r}")

def main():
    statuses = wait_statuses()
    library = get_json(f"/tiktok/library?v=-1&t={int(time.time())}", timeout=30)

    channels = library.get("channels") or []
    items = statuses.get("items") or []
    lib_handles = [str(x.get("handle") or "").lower() for x in channels if x.get("handle")]
    status_handles = [str(x.get("handle") or "").lower() for x in items if x.get("handle")]

    missing = sorted(set(lib_handles) - set(status_handles))
    extra = sorted(set(status_handles) - set(lib_handles))
    dupes = sorted({h for h in status_handles if status_handles.count(h) > 1})
    bad = [x for x in items if x.get("state") not in ALLOWED]

    print("LIBRARY_TOTAL", len(lib_handles))
    print("STATUS_TOTAL", len(status_handles))
    print("COUNTS", json.dumps(statuses.get("counts") or {}, ensure_ascii=False, sort_keys=True))
    print("MISSING", missing)
    print("EXTRA", extra)
    print("DUPLICATES", dupes)
    print("BAD_STATES", [(x.get("handle"), x.get("state")) for x in bad])

    for target in ("longgiatien", "giaodendoithuong79", "ongbodien"):
        row = next((x for x in items if str(x.get("handle") or "").lower() == target), None)
        print("TARGET", target, json.dumps(row, ensure_ascii=False, sort_keys=True) if row else "NOT_SELECTED")

    assert len(lib_handles) == len(set(lib_handles)), "duplicate handles in library"
    assert len(status_handles) == len(set(status_handles)), "duplicate handles in statuses"
    assert not missing, f"missing selected handles in status endpoint: {missing[:20]}"
    assert not extra, f"extra handles in status endpoint: {extra[:20]}"
    assert not dupes, f"duplicate handles in status endpoint: {dupes[:20]}"
    assert not bad, f"unrecognized states: {bad[:20]}"
    assert len(lib_handles) == len(status_handles), "status endpoint is not exhaustive"
    print("PASS exhaustive selected-channel LIVE coverage")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("FAIL", repr(e), file=sys.stderr)
        raise
