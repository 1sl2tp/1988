# 1988 TikTok LIVE state edge

Cloudflare Worker control-plane for TikTok LIVE.

- TikTok `api-live/user/room` is the canonical LIVE/OFFLINE source.
- Runs every minute, checks at most 45 channels per invocation.
- Current LIVE channels are prioritized every sweep.
- Cold selected channels rotate so ~171 channels are covered in about 4 minutes.
- KV stores one compact snapshot and is written only when LIVE/OFFLINE/roomId/selection changes.
- Render remains the heavy media resolver only for channels confirmed LIVE.
- `/tiktok/live-now` merges edge-confirmed LIVE state with Render's verified FLV media rows.
- No video bytes are proxied by this Worker.

Wrangler auto-provisions the KV namespace on first deploy.
