# Server Resource Guardrails

Canonical operating standard for SHOP88 / TAPHOA services.

## Non-negotiable rules

1. **Demand before work**
   - No background fetch just to discover whether data changed.
   - Prefer version/hash/updated-at checks.
   - Hidden/inactive clients do not poll.

2. **Single-flight + cooldown**
   - Every recurring worker must have a lock or single-flight guard.
   - Retries use backoff.
   - A failed upstream must never create an immediate retry loop.

3. **Direct media first**
   - Video/audio bytes must not cross Supabase Edge Functions.
   - Render/Cloudflare media proxy routes are compatibility fallbacks only.
   - Fallback proxy concurrency must be bounded.

4. **Package before UI**
   - Server builds a complete package.
   - Validate before swap.
   - Hash/version unchanged means no write and no download.
   - Failure keeps the previous complete package.

5. **Logs are exceptions**
   - Do not log every successful request/item/range.
   - Keep errors, startup/shutdown, state transitions and periodic batch summaries.
   - Never use broad log queries as health monitoring.

6. **Cron must be useful**
   - Idle cron ticks must not make network requests.
   - Keepalive interval must be the longest safe interval.
   - Heavy verification workflows are manual, not push-triggered.

7. **Storage retention**
   - Hot state is bounded.
   - History/cache tables have retention rules.
   - Watch physical table bloat; compact only when measurable bloat exists.

8. **Provider guardrails**
   - Supabase: no media relay; bounded Edge fanout; narrow DB selects.
   - Render: direct CDN first; bounded media fallback; no per-range success logs.
   - LiveKit: short-lived tokens, microphone-only publish grant, cached warm checks.
   - Cloudflare: control/metadata preferred; avoid full media tunneling.
   - GitHub Actions: path filters, cancel-in-progress, heavy probes manual.

## Current defaults

- TikTok LIVE active viewer sweep: 30 seconds.
- TikTok LIVE idle sweep: 3 minutes.
- Render media fallback max concurrency: 4.
- Zalo keepalive: 10 minutes.
- LiveKit warm cache: 10 minutes.
- Getlink daily worker: cron may tick every 5 minutes in the window, but HTTP is sent only while a run is due/running.
