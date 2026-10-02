# 1988 TikTok LIVE + video state edge

Cloudflare Worker control-plane for TikTok.

- TikTok `api-live/user/room` remains the canonical LIVE/OFFLINE source.
- LIVE sweep checks at most 40 channels per minute; current LIVE channels are prioritized.
- Video change detection uses TikTok `api/post/item_list` with `count=1` and only stores the latest video ID.
- Video checks rotate 6 channels per minute, so ~171 selected channels are covered in about 29 minutes.
- The first observed video ID is only a baseline; it does not backfill old/missing videos.
- When a later video ID changes, Cloudflare queues a targeted Render refresh for that one channel.
- At most one Render wake is sent per minute to stay under the Worker subrequest budget.
- KV is written only when LIVE state, selection, video fingerprint, or pending refresh state materially changes.
- Render remains session/metadata/resolver only; media bytes stay off Render.
- `/tiktok/live-now` resolves current LIVE media directly from TikTok.
- No recurring TikTok video crawl runs on Render.
