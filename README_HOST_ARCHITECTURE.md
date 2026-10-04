# 1988 — HOST / DATA / ACTION ARCHITECTURE

> **Current production contract.**
>
> External-data master rule: `1sl2tp/infrastructure/rules/02-EXTERNAL-DATA-SINGLE-SOURCE-OF-TRUTH.md`.

## 1. Active topology

| Layer | Role | Allowed | Forbidden |
|---|---|---|---|
| GitHub `1sl2tp/1988` | CODE | UI, tests, migrations, Supabase function source | runtime business database, scheduled scraping |
| GitHub Pages | PRODUCTION FRONTEND | static web/PWA | background data work |
| Supabase 1988 | CANONICAL MEDIA CONTROL DATA | YouTube channel directory, source state, metadata cache, current packages, small config | media bytes, crawler loops |
| Cloudflare YouTube LIVE | REALTIME EDGE | demand-only LIVE detection, bounded lease/cache | cron discovery, canonical history, media archive |
| Browser/PWA | LOCAL CACHE + RENDER | IndexedDB/RAM package cache, hash/version check, explicit user demand | canonical truth, crawler background |
| Render | NO ACTIVE 1988 PRODUCTION OWNER | none in current contract | second frontend host, TikTok runtime, canonical store |

TikTok was retired from the active runtime. Do not reintroduce TikTok through old Render, Cloudflare, Supabase or GitHub paths without a new explicit architecture decision and a central external-data registry entry.

## 2. Canonical data

### YouTube channels

Canonical identity: `yt1988_channel_directory(profile_key, channel_id)`.

- name/avatar/profile/stats belong to canonical directory;
- source selection belongs to `yt1988_source_state`;
- cache rows may reference identity but do not become identity owner;
- unknown values remain null/unknown, not fabricated zeroes.

### Source state

```text
channel_id + scope + status(selected|blocked|normal) + version
```

LIVE effective membership:

```text
union(selected all scopes) - union(blocked all scopes)
```

### Packages

Server owns package membership and normalization.

```text
server source/cache
→ filter + dedupe
→ complete package
→ manifest/hash
→ UI downloads package only when hash changes
```

A package is a denormalized read product. It may contain render fields such as channel name/avatar, but it never writes back as canonical truth.

## 3. Read paths

### Normal feed

```text
RAM / IndexedDB
→ manifest/hash
→ unchanged: stop
→ changed: download package
→ atomic swap/render
```

### Source manager

```text
cached library
→ state manifest
→ stateHash changed: fetch lite state
→ libraryHash changed: fetch library
```

No page downloads the whole library merely to ask whether it changed.

## 4. YouTube LIVE

LIVE is demand-only.

```text
user opens LIVE while document visible
→ one logical Cloudflare scan
→ Cloudflare verifies bounded candidates
→ material snapshot change only
→ wake Supabase LIVE package builder
→ package hash changes
→ UI downloads complete package
```

Locked rules:

- Cloudflare schedule count = 0.
- No browser = no LIVE discovery.
- Hidden/closed LIVE surface stops discovery.
- Multiple browsers reuse lease/in-progress work.
- Source edit targets only the changed channel.
- Browser focus/timer checks manifest/hash; it does not become a second package wake owner.
- Failed probe keeps last-known-good package/snapshot.

## 5. User actions

Direct API work is allowed only for an explicit action such as:

- search;
- open one channel;
- open one video;
- select/block/unblock one source;
- open LIVE.

A result list must not create hidden per-card resolver/meta fan-out.

## 6. Media

- Media bytes never pass through Supabase Postgres/Edge just for relay.
- YouTube player/origin path owns playback.
- Metadata/cache contains only fields required for UI/player/package.
- No per-segment or per-item success logs.

## 7. Scheduler ownership

Active recurring scheduler in 1988 Supabase: retention cleanup only.

YouTube LIVE has no Supabase/Cloudflare/GitHub cron.

One-shot incident workflows are removed after use. Cloudflare deployment is centrally owned by `1sl2tp/infrastructure`, not by a second 1988 workflow.

GitHub Pages is the only production frontend deployment owner. Cloudflare static-site and Render static-site are not production owners.

## 8. Cache / retention

- hash before payload;
- RAM → IndexedDB → network;
- transient cache has TTL/version/overwrite;
- operational rows have bounded retention;
- canonical channel/source rows are not deleted to improve quota charts;
- upstream failure never overwrites last-known-good with empty data.

## 9. Removed runtime

TikTok/News are not active 1988 runtime domains.

- TikTok canonical tables were removed by the current migration.
- TikTok Edge Functions return a removed/410 tombstone where legacy URLs may still be hit.
- TikTok Cloudflare Worker/KV/schedules are retired.
- No TikTok Render wake is allowed.
- Historical migrations remain for audit only.

## 10. One-line architecture

```text
GitHub = CODE
GitHub Pages = FRONTEND
Supabase 1988 = CANONICAL YOUTUBE CONTROL DATA + CURRENT PACKAGES
Cloudflare = DEMAND-ONLY YOUTUBE LIVE EDGE
Browser = CACHE + RENDER + USER DEMAND
```
