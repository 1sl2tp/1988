# 1988 — HOST / DATA / ACTION ARCHITECTURE

> Contract production. Mục tiêu: mỗi loại dữ liệu chỉ có **một owner**, mỗi user action chỉ đánh thức **đúng một việc**, và không host nào gánh sai vai trò.

## 1. Vai trò cố định

| Host/layer | Owner | Được giữ/làm | Không được giữ/làm |
|---|---|---|---|
| GitHub `1sl2tp/1988` | CODE | UI, Edge Function source, Worker source, test, migration, rule, bootstrap fixture | canonical channel/video/LIVE runtime, package history |
| Supabase | TRUTH | channel canonical, source state, video metadata cache, current package/hash, small config | media bytes, browser polling, realtime crawler |
| Cloudflare | REALTIME + CACHE | YouTube/TikTok LIVE transient state, lease/lock, edge cache, lightweight delivery | canonical history, per-item logs, full channel library |
| Render `1988-tiktok-session` | HEAVY RESOLVER | TikTok session/browser/profile/media resolution when requested | global polling/cron discovery, canonical DB |
| Browser/PWA | LOCAL CACHE + RENDER | IndexedDB package/library/state-lite, hash/version, player state | canonical truth, crawler, server-side filtering |

## 2. Canonical data model

### Channel
One row per identity:
`platform + channelId/handle + name + avatar + profile URL + stats + checkedAt`.

- YouTube: `yt1988_channel_directory`.
- TikTok: `yt1988_tiktok_channels`.
- Other tables reference channel identity by ID; do not duplicate full profile unless a package needs display fields.

### Source state
`channelId + scope + status(selected|blocked|normal) + version`.

LIVE effective:
```text
union(selected all scopes) - union(blocked all scopes)
```

### Video metadata
Keep only metadata needed for package/player/cache. No video/audio binary.

### LIVE state
Transient. Cloudflare owns current detection. Ended rows disappear from snapshot; no unbounded history.

### Package
Current prepared product only:
`scope + hash + version + generatedAt + items[]`.

UI never rebuilds package membership.

## 3. Read paths

### MAIN
```text
IndexedDB/RAM package
→ package manifest/hash
→ changed only: download full package
```

Source controls:
```text
state manifest
→ hash same: cached lite state
→ hash changed: state-lite
```

MAIN must not download full channel library.

### /sources/
```text
IndexedDB cached library
→ state manifest
→ stateHash changed: lite
→ libraryHash changed: library
```

### Cloudflare LIVE
```text
state-lite only
→ selected/blocked/keywords
→ verify realtime
→ snapshot/KV
→ changed only: wake package builder
```

## 4. Action paths

### Open non-LIVE tab
Paint cache first. Check manifest. Wake package builder only at scope cadence:
- latest: 5 min
- week: 30 min
- content/hashtag: 15 min

Focus/visibility does not reset the cadence.

### Open LIVE
Paint last package immediately → one logical Cloudflare scan → Supabase package build → hash change → UI downloads complete package then swaps.

Hidden/closed = browser stops LIVE work.

### Select/block/unblock channel
Write one canonical source row → targeted sync exactly one channel into LIVE → rebuild package only if effective LIVE set changed.

### Search/open channel/open video
Direct user action may call API. It must not fan out background resolver work over every returned card.

## 5. Media

- Supabase: metadata/URL only.
- YouTube playback: origin/player path.
- TikTok heavy link/session resolution: Render/Cloudflare path as designed.
- No video/audio binary through Supabase Edge Functions/Postgres/logs.

## 6. Cache/version rules

- Hash before payload.
- RAM → IndexedDB → network.
- `stateHash` changes on source/config state.
- `libraryHash` changes only on canonical channel/profile library changes, not selected/blocked edits.
- Package hash changes only after complete package is ready.
- Upstream failure keeps last-known-good.

## 7. Legacy/static data

`src/channel-library.js` is a **legacy generated seed**. Current production entrypoints `index.html` and `/sources/` must not load it. It is not canonical and must never overwrite Supabase channel directory.

## 8. Cost guardrails

The current database size is not the bottleneck. The primary risk is repeated response bytes and invocation/log volume.

Therefore:
- no full state on MAIN/Cloudflare;
- no per-card metadata warm fan-out;
- no package refresh wake more often than scope cadence;
- no LIVE cron;
- no full scan for one source edit;
- no package/history append loops;
- no per-item production logs.

## 9. One-line architecture

```text
GitHub = CODE
Supabase = TRUTH + CURRENT PACKAGE
Cloudflare = REALTIME + EDGE CACHE
Render = HEAVY RESOLVER
Browser = LOCAL CACHE + RENDER
```
