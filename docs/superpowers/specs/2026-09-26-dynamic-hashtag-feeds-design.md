# 1988 v311 — Dynamic Hashtag Feeds

## Goal

Replace the current fixed content-tab model with a server-owned dynamic **#hashtag** model.

The user workflow becomes:

`+ hashtag -> enter display name -> add/select sources`

Everything else is automatic.

- `Live`, `Ngày`, and `Tuần` remain special system feeds.
- Every content tab is a dynamic hashtag.
- Every hashtag uses the same content window: **videos from the last 7 days only**.
- A hashtag with **zero selected sources is never scanned/refreshed**.
- As soon as a hashtag gets its first selected source, it enters the refresh pipeline automatically.
- Renaming a hashtag changes only its label, never its identity or filtering behavior.
- The browser remains download-only for shared feed data.

## Identity Model

Old semantic scope IDs must be retired so display names can never imply behavior.

Existing content tabs migrate as follows:

| Current label | Old scope ID | New stable hashtag ID |
|---|---|---|
| Khám phá | `news` | `hash_001` |
| Review | `economy` | `hash_002` |
| Hài | `law` | `hash_003` |
| Phim ngắn | `film` | `hash_004` |
| Nhạc | `music` | `hash_005` |
| Công nghệ | `tech` | `hash_006` |
| Thể thao | `sports` | `hash_007` |
| Showbiz | `entertainment` | `hash_008` |

The following IDs remain reserved system feeds:

- `live`
- `latest`
- `week`

New hashtags receive a generated stable ID such as `hash_<base36-id>`. The ID is immutable after creation. Only the label and ordering are editable.

## Server Data Model

Create `public.yt1988_hashtags`:

- `profile_key text`
- `hashtag_id text`
- `label text`
- `position integer`
- `enabled boolean default true`
- `created_at timestamptz`
- `updated_at timestamptz`
- primary key: `(profile_key, hashtag_id)`

Rules:

- hashtag IDs must match a neutral format such as `^hash_[a-z0-9]+$`.
- labels are presentation only.
- content behavior is not stored in the label.
- all hashtags use the same engine: `under_7d + adaptive learning`.

The existing `yt1988_source_state.scope`, `yt1988_packages.scope`, and `yt1988_refresh_config.scope` continue to use text IDs, but content scopes become hashtag IDs.

## Migration

Migration is transactional.

1. Insert the eight existing hashtags using the mapping above.
2. Rewrite matching `yt1988_source_state.scope` values from old semantic IDs to new hashtag IDs.
3. Rewrite matching `yt1988_packages.scope` values.
4. Rewrite matching `yt1988_refresh_config.scope` values.
5. Migrate persisted labels so current renamed labels are preserved.
6. Remove fixed-scope CHECK constraints that prevent dynamic hashtag IDs.
7. Update queue/refresh SQL so a valid scope is either:
   - one of `live/latest/week`, or
   - an enabled row in `yt1988_hashtags`.
8. Verify there are no remaining rows using old IDs before considering migration complete.

No selected/blocked source state may be lost during this migration.

## Shared Hashtag Engine

All dynamic hashtags use one content pipeline.

For hashtag `H`:

1. Read selected sources for `H`.
2. If selected source count = 0:
   - do not enqueue channel scans,
   - do not call YouTube/Piped/RSS,
   - UI shows the hashtag with an empty-source state,
   - stale package rows are ignored/cleared so old content is not shown.
3. If selected source count > 0:
   - reuse per-channel snapshots from `yt1988_channel_cache`,
   - refresh due channel snapshots,
   - keep last known good snapshot when an upstream request fails,
   - include only videos whose normalized age is <= 7 days,
   - exclude short-form videos whose verified duration is **under 60 seconds**,
   - duration exactly 60 seconds or longer remains eligible,
   - duration `0` / missing / unknown is never treated as "<60s"; resolve/enrich duration first when the row is otherwise eligible,
   - exclude blocked sources/videos,
   - deduplicate videos,
   - apply the existing common unwanted-content/ad/noise rules,
   - apply adaptive learning derived from the selected sources and their recent videos,
   - sort newest-first with the existing stable tie breakers,
   - commit a package only when safety guards pass.

There must be no branches such as `if review`, `if comedy`, or `if music` in the hashtag worker.

## Adaptive Learning

The hashtag name is not used to guess the topic.

The learning inputs are:

- names of selected sources,
- titles/metadata of recent videos from those selected sources,
- existing manual selected/blocked source history,
- existing common duplicate/noise/ad rules.

Therefore:

- renaming `Review` to `Đánh giá` does not change content,
- creating `#Ô tô` does not require writing an `automotive` profile,
- the user only needs to add the relevant sources.

The learning model/cache is keyed by `hashtag_id` and source signature, never by label text.

## Short-video Exclusion

Dynamic hashtag feeds do not include short videos under 60 seconds.

Canonical rule:

- verified duration `1..59` seconds => reject;
- verified duration `>=60` seconds => keep eligible;
- live streams are handled by their own live semantics, not by the short-duration rule;
- duration `0`, missing, malformed, or unknown => do not reject solely from duration; attempt metadata enrichment first;
- if a row is explicitly marked as a YouTube Short but duration is not yet known, resolve duration before package commit so an unknown value cannot bypass or falsely trigger the rule.

This filter is applied centrally in the shared hashtag engine, before adaptive learning/package commit, so every existing and future hashtag inherits it automatically.

## LIVE-specific Filtering

LIVE is a system feed and does **not** use the 7-day hashtag rules.

### Only currently-live streams may be shown

The current implementation must not treat a cached `isLive=true`, `duration<0`, or `uploaded=-1` flag as sufficient proof that a stream is still live.

For every LIVE package commit:

1. Discover candidate livestreams from search/selected LIVE sources.
2. Revalidate candidate video IDs with fresh video/stream metadata using a short no-store TTL.
3. A row is eligible only when fresh metadata still indicates an active livestream.
4. Prefer a positive active-live signal such as current livestream state plus a usable live/HLS stream.
5. If fresh metadata reports the stream ended, became a replay/VOD, or no longer has an active-live signal, remove it immediately.
6. If verification fails or times out, do **not** keep the row visible merely because an older cache said it was live.
7. LIVE snapshots have a short hard expiry and are not allowed to use the normal stale-while-revalidate behavior used by 7-day hashtag/channel snapshots.

This makes LIVE intentionally fail closed: it is better to temporarily omit an unverifiable stream than to keep an already-ended livestream on screen.

### LIVE blocked keywords

Add a server-owned LIVE keyword block list in Quản lý nguồn → Live.

UI:

- section label: `Từ khóa chặn`;
- one compact input that accepts one phrase at a time;
- Enter / add button saves a keyword;
- saved keywords render as removable chips;
- examples: `xổ số`, `cây cảnh`;
- matching is case-insensitive and accent-insensitive, so `xo so` and `xổ số` are equivalent for matching;
- keywords are shared across PC, mobile web, and PWA.

Matching:

- compare against normalized video title;
- compare against normalized source/channel name;
- optionally compare description only when description metadata is already available; never fetch descriptions solely for keyword blocking;
- phrase matching is literal after normalization — do not let AI invent broader blocked topics;
- manual blocked channel IDs still take precedence and remain separate from keyword blocks.

If any saved LIVE keyword matches, exclude the stream before package commit and before it is offered as a Live source suggestion.

The keyword list is presentation-independent and stored on the server, not only in localStorage.

### LIVE refresh behavior

- LIVE refresh remains independent from dynamic hashtags.
- Ended-live verification should run more frequently than content hashtag refresh.
- Keyword changes trigger an immediate LIVE package rebuild.
- Removing a keyword also triggers an immediate LIVE rebuild.
- A LIVE package with zero verified active streams is valid and should render an empty LIVE state rather than stale ended streams.

## Refresh Scheduling

`Live/Ngày/Tuần` retain system-feed scheduling.

Dynamic hashtags:

- zero selected sources => never due;
- first selected source => enqueue immediately;
- source add/remove/block change => enqueue that hashtag;
- scheduled refresh only includes enabled hashtags with at least one selected source;
- interval remains configurable in `yt1988_refresh_config`;
- default hashtag interval: 10 minutes unless changed later;
- the worker may batch multiple due hashtags, but source snapshots are shared across hashtags.

Deleting/archiving a hashtag stops refresh. Prefer archive/disable over destructive deletion.

## State API

`yt1988-state` GET returns:

- system source state,
- dynamic hashtag list,
- scoped selected/blocked source state,
- source metadata.

POST supports:

- create hashtag,
- rename hashtag,
- reorder hashtag,
- enable/archive hashtag,
- set source state for a hashtag.

The server validates hashtag IDs against `yt1988_hashtags`; clients cannot invent arbitrary scopes.

## Frontend

The frontend no longer hard-codes eight content tabs.

It renders:

1. system tabs: Live, Ngày, Tuần;
2. enabled hashtags from server in `position` order.

The same hashtag list drives:

- main navigation,
- Quản lý nguồn tabs,
- source picker menus,
- source counts,
- package hydration.

Add a compact `+` control after the hashtag list.

Create flow:

`+ -> enter label -> server creates hashtag ID -> tab appears -> user adds sources`

No advanced profile/rule form is required.

## Source Manager UI Fixes

Implement the four agreed UI fixes in the same v311 change.

### 1. Rename empty state

Replace `Chưa chọn` with **`Gợi ý nguồn`**.

### 2. Explicit back navigation

When a channel preview is open, show a visible **`← Quay lại`** control on desktop and mobile.

Back returns to the previous source/search result state instead of clearing the user's query unnecessarily.

### 3. Content search resolves channels

Searching a phrase such as `Anh trai vượt chông gai` must return:

- related channels,
- related videos.

Videos are used to resolve uploader/channel IDs. Related channels remain directly selectable as sources for the active hashtag.

### 4. Video preview always shows source

When opening a video inside source management, the player header must show:

- source avatar,
- source name,
- target hashtag,
- `Chọn` / `Đã chọn` action.

If the initial video row lacks a channel ID, resolve the source before hiding the action. Do not silently show `Nguồn YouTube` with no selectable source when the source can be resolved.

## Package/API Compatibility

During rollout, the package endpoint may temporarily accept both old and new IDs for read compatibility, but all writes after migration use only new hashtag IDs.

Once verification shows no old scope rows remain, remove compatibility aliases.

Browser clients compare package hashes exactly as today. Dynamic hashtags use their stable hashtag ID as the package key.

## Cache Versioning

Bump browser/local schema generation for v311.

The automatic local-data migration clears only volatile feed/package caches. Manual selected/blocked source state remains server-authoritative and must not be lost.

## Safety / Failure Rules

- A partial upstream failure cannot shrink a good package catastrophically.
- A missing/failed channel keeps its last known good snapshot.
- A hashtag with zero sources never scans.
- A hashtag with zero sources never shows stale historical package content as current.
- Renaming a hashtag never triggers a semantic/profile change.
- Changing the order of hashtags never rebuilds content packages.
- Removing the last source stops future scans for that hashtag.

## Verification

### Database

Verify:

- 8 legacy content tabs exist under `hash_001..hash_008`.
- old IDs `news/economy/law/film/music/tech/sports/entertainment` have zero rows in source/package/refresh tables.
- selected/blocked source counts before and after migration are identical by migrated tab.
- zero-source hashtag is not returned by the due-refresh query.
- first-source selection queues that hashtag immediately.

### Worker

Tests must prove:

- one generic hashtag path handles all hashtag IDs;
- all hashtag videos are <= 7 days old;
- no committed hashtag package contains a video with verified duration `1..59` seconds;
- a 60-second video remains eligible;
- unknown duration is enriched or preserved for later validation rather than being misclassified as a short;
- zero-source hashtag performs no channel fetch;
- package safety guard prevents catastrophic shrink;
- a shared channel cache can serve more than one hashtag.

### Frontend

Tests must prove:

- LIVE management exposes server-backed blocked-keyword chips and add/remove behavior;
- a keyword such as `xổ số` blocks normalized `xo so` title/source matches;
- LIVE cards whose fresh verifier says ended/replay are removed even if stale cache still has `isLive=true`;
- an unverifiable stale LIVE candidate is omitted instead of retained;
- dynamic hashtags render without changing JS constants;
- rename changes label only;
- source manager uses `Gợi ý nguồn`;
- preview has a back action on desktop and mobile;
- video search exposes related source/channel actions;
- player preview source action remains visible after source resolution;
- creating a new hashtag makes it available in both navigation and source manager after state refresh.

### Rollout

1. Deploy DB migration.
2. Deploy state + refresh/package functions with dynamic hashtag support.
3. Verify migrated counts and packages.
4. Deploy frontend v311.
5. Force one local cache-generation rotation.
6. Verify PC, mobile web, and PWA consume the same dynamic hashtag manifest.
