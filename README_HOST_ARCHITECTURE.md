# 1988 — HOST / DATA / ACTION ARCHITECTURE

> Contract production. Mục tiêu: mỗi loại dữ liệu chỉ có **một owner**, mỗi user action chỉ đánh thức **đúng một việc**, và không host nào gánh sai vai trò.

## 1. Vai trò cố định

| Host/layer | Owner | Được giữ/làm | Không được giữ/làm |
|---|---|---|---|
| GitHub `1sl2tp/1988` | CODE | UI, Edge Function source, Worker source, test, migration, rule, bootstrap fixture | canonical channel/video/LIVE runtime, package history |
| Supabase | TRUTH + CURRENT YOUTUBE PACKAGE | channel canonical, YouTube source state, TikTok selected membership, video metadata cache, current YouTube package/hash, small config | media bytes, browser polling, realtime crawler |
| Cloudflare | REALTIME + EDGE CACHE + BOUNDED RESOLVER/RELAY | YouTube/TikTok LIVE transient state, lease/lock, KV/cache, TikTok origin/VOD resolver-relay theo request | canonical history, global cron discovery, full channel library, per-item logs |
| Render `1988-tiktok-session` / `one988-tiktok-session.onrender.com` | HEAVY TIKTOK SESSION/RESOLVER | TikTok session/browser/profile/library metadata và heavy resolution khi được gọi | global LIVE cron, canonical DB owner, media proxy nền |
| Browser/PWA | LOCAL CACHE + RENDER + DEMAND TRIGGER | IndexedDB package/library/state-lite, hash/version, player state, gọi scan khi bề mặt LIVE visible | canonical truth, crawler nền, server-side filtering |

## 2. Canonical data model

### Channel
One canonical row per identity.

- YouTube canonical: `yt1988_channel_directory(profile_key, channel_id)`. `channel_id` is the relationship key.
- TikTok canonical: `yt1988_tiktok_channels(id)`, where `id` is an internal stable UUID primary key.
  - `handle` remains a unique routing alias for TikTok URLs/API calls.
  - `user_id` and `sec_uid` are unique external identities, not child-table primary keys.
- Child/state/cache tables reference canonical identity by ID/FK.
- Name/avatar/profile must not be copied into source-state or cache rows. The only allowed duplication is a prepared package/read snapshot.

### Source / membership state

**YouTube** uses scoped source state:

`channelId + scope + status(selected|blocked|normal) + version`.

YouTube LIVE effective membership:

```text
union(selected all scopes) - union(blocked all scopes)
```

**TikTok** does not use the YouTube scoped-state contract for membership. Canonical selected membership is `yt1988_tiktok_channels.selected`.

Do not force TikTok membership into `yt1988_source_state` just to make the schemas look identical.

Identity invariants:
- `yt1988_source_state` contains only `profile_key + scope + channel_id + status + version + updated_at`.
- `yt1988_channel_cache` caches video/feed state by `channel_id`; it does not own channel name/avatar.
- legacy `yt1988_user_state.avatars/customSources` must remain empty.
- TikTok `yt1988_tiktok_live_channels`, `yt1988_tiktok_video_channels`, and `yt1988_tiktok_videos` carry `channel_id → yt1988_tiktok_channels.id` FKs.

### Video metadata
Keep only metadata needed for package/player/cache. No video/audio binary.

- YouTube video/feed cache is keyed to canonical YouTube `channel_id`.
- TikTok canonical video row is `yt1988_tiktok_videos(video_id)` plus `channel_id` FK.
- `yt1988_tiktok_video_channels` stores scan state/latest-video pointer only; it must not duplicate a `videos[]` JSON library or `sec_uid`.

### LIVE state
Transient. Cloudflare owns current realtime detection/snapshot. Ended rows disappear from the current snapshot; no unbounded history.

- YouTube LIVE snapshot is an input to Supabase package build.
- TikTok durable transient state uses `yt1988_tiktok_live_channels(channel_id)`; it does not duplicate canonical `selected` or profile/avatar fields.
- TikTok realtime snapshot is read from Cloudflare edge by the TikTok LIVE UI.

### Prepared products

**YouTube package** is the current server-prepared product:

`scope + hash + version + generatedAt + items[]`.

UI never rebuilds YouTube package membership.

Prepared packages are intentionally denormalized read products: they may include channel name/avatar so the UI can render without a per-card library join. Package identity is a snapshot copied **from canonical tables** and must never be written back as canonical truth.

**TikTok LIVE** is not a Supabase YouTube-style package. It is a bounded Cloudflare snapshot/KV product refreshed only by demand.

## 3. Read paths

### MAIN — YouTube package

```text
RAM / IndexedDB package
→ package manifest/hash
→ hash changed only: download complete package
→ atomic swap/render
```

Source controls:

```text
state manifest
→ stateHash same: cached lite state
→ stateHash changed: state-lite
```

MAIN must not download full channel library.

### /sources/

```text
IndexedDB cached library
→ state manifest
→ stateHash changed: lite
→ libraryHash changed: library
```

### Cloudflare — YouTube LIVE

```text
yt1988-state?view=lite
→ union selected / blocked / LIVE keywords
→ realtime verification
→ snapshot/KV
→ material snapshot changed only: wake Supabase LIVE package builder
```

Cloudflare YouTube LIVE must never fetch default/full `yt1988-state`.

### Cloudflare — TikTok LIVE

```text
TikTok LIVE visible in browser
→ demand GET /sweep
→ selected handles from Render /tiktok/live-statuses
   (backed by Supabase yt1988_tiktok_channels.selected)
→ bounded TikTok room/status checks
→ material change only: write KV snapshot
→ GET /tiktok/live-now
→ TikTok UI render
```

Current `/sweep` checks at most 40 handles per demand call and prioritizes channels already known LIVE. Video fingerprint rotates up to 6 channels in the same demand sweep.

No visible TikTok LIVE surface = no periodic sweep.

### TikTok VOD/media

```text
explicit user/feed demand
→ Render metadata/session and/or Cloudflare TikTok origin resolver
→ Cloudflare direct/relay path when required
→ browser player
```

This path is request-driven. It must not become a global background crawler.

## 4. Action paths

### Open non-LIVE YouTube tab
Paint cache first. Check manifest. Wake package builder only at scope cadence:

- latest: 5 min
- week: 30 min
- content/hashtag: 15 min

Focus/visibility does not reset the cadence.

### Open YouTube LIVE
Paint last committed package immediately → one logical Cloudflare demand scan → changed snapshot wakes Supabase package build → hash change → UI downloads complete package then swaps.

Wake ownership:

- explicit tab-open may do one catch-up package wake;
- Cloudflare snapshot change owns later LIVE package wake;
- browser focus/timer only checks hash;
- source edit uses targeted Cloudflare sync; it does not pre-refresh LIVE from stale state.

### Open TikTok LIVE
Render last edge snapshot → while LIVE is visible, browser may call one bounded demand sweep about once/minute → refresh `/tiktok/live-now`.

Hidden/closed/changed away from TikTok LIVE = browser stops TikTok LIVE discovery.

### Select/block/unblock YouTube channel
Write one canonical `yt1988_source_state` row → targeted sync exactly one channel into YouTube LIVE → rebuild package only if effective LIVE set changed.

### Select/add TikTok channel
Write canonical `yt1988_tiktok_channels.selected`. Explicit add/refresh may check that handle directly. The next visible TikTok LIVE demand cycle reads the current selected membership; no global cron is created.

### Search/open channel/open video
Direct user action may call API. It must not fan out hidden background resolver work over every returned card.

## 5. Media

- Supabase: metadata/URL only.
- YouTube playback: origin/player path.
- TikTok heavy session/profile/library: Render when requested.
- TikTok realtime/origin/VOD resolution/relay: Cloudflare when requested.
- No video/audio binary through Supabase Edge Functions/Postgres/logs.
- Render must not become a background media proxy unless an explicit incident temporarily requires it.

## 6. Cache/version rules

- Hash before payload.
- RAM → IndexedDB → network.
- `stateHash` changes on YouTube source/config state.
- `libraryHash` changes only on canonical channel/profile library changes, not selected/blocked-only edits.
- YouTube package hash changes only after a complete package is ready.
- TikTok KV writes only on material LIVE/fingerprint state changes.
- Channel/avatar changes update the canonical channel row once; the next prepared package copies the new snapshot.
- Temporary signed TikTok MP4 URLs are cache only and must be cleared after expiry.
- Upstream failure keeps last-known-good.

## 7. Scheduler / deploy invariants

YouTube LIVE and TikTok LIVE are **demand-only**.

- Cloudflare LIVE schedule count must be `0`.
- TikTok `cloudflare/tiktok-live-state/wrangler.toml` must keep `crons = []`.
- TikTok Worker must not export `scheduled()`.
- TikTok deploy workflow must actively PUT schedules to `[]` and verify Cloudflare still reports zero schedules.
- Browser visibility/demand is the trigger; GitHub/Supabase/Cloudflare cron must not duplicate that trigger.
- One active scan/lease per logical LIVE cycle; do not create one crawler per browser.

## 8. Legacy/static data

`src/channel-library.js` is a **legacy generated seed**. Current production entrypoints `index.html` and `/sources/` must not load it. It is not canonical and must never overwrite Supabase channel directory.

## 9. Cost guardrails

The current database size is not the bottleneck. The primary risk is repeated response bytes and invocation/log volume.

Therefore:

- no full state on MAIN/Cloudflare YouTube LIVE;
- no per-card metadata warm fan-out;
- no package refresh wake more often than scope cadence;
- no LIVE cron;
- no full scan for one source edit;
- no package/history append loops;
- no per-item production logs;
- no TikTok resolver/media work unless a visible/user action needs it;
- no avatar/name mirror in source-state/channel-cache;
- no TikTok profile/LIVE/video-library duplication across canonical/state tables.

## 10. One-line architecture

```text
GitHub = CODE
Supabase = TRUTH + CURRENT YOUTUBE PACKAGE
Cloudflare = REALTIME + EDGE CACHE + BOUNDED RESOLVER/RELAY
Render = HEAVY TIKTOK SESSION/RESOLVER
Browser = LOCAL CACHE + RENDER + DEMAND TRIGGER
```
