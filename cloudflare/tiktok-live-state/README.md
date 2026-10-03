# 1988 TikTok LIVE + video edge

Cloudflare Worker control-plane cho TikTok LIVE/VOD. Runtime này là **demand-only**: không có cron discovery và không tự chạy khi không có người dùng mở bề mặt cần dữ liệu.

## Ownership

- Supabase `yt1988_tiktok_channels.selected` là membership canonical của kênh TikTok đã chọn.
- Render production `https://one988-tiktok-session.onrender.com` giữ session/profile/library và trả membership metadata qua `/tiktok/live-statuses`; Render không phải scheduler LIVE.
- Cloudflare Worker xác minh LIVE, giữ snapshot/KV nhỏ và thực hiện resolver/relay media TikTok theo request.
- Browser chỉ gọi scan khi TikTok LIVE đang visible; đóng/ẩn/đổi tab thì không tạo discovery mới.

## LIVE demand flow

```text
TikTok LIVE visible
→ GET /sweep (bounded rotation batch, ưu tiên kênh đang LIVE)
→ TikTok room/status verification
→ material state changed only: write KV snapshot
→ GET /tiktok/live-now
→ UI render TikTok LIVE snapshot
```

- `/sweep` kiểm tra tối đa 40 channel cho mỗi demand call; LIVE hiện tại được ưu tiên trước.
- UI hiện gọi lại khoảng tối đa một lần/phút khi LIVE vẫn visible.
- Không có browser mở LIVE → không có `/sweep` định kỳ.
- `/refresh?user=@handle` là targeted check đúng một kênh.
- Unknown/upstream failure không được xóa last-known-good chỉ vì một probe lỗi.

## Video fingerprint

Video change detection dùng TikTok `api/post/item_list?count=1` và chỉ giữ latest video ID trong KV state. Mỗi demand sweep xoay tối đa 6 channel cho fingerprint; đây **không phải cron nền**. Khi fingerprint thực sự đổi, Worker mới wake targeted Render refresh cho channel đó.

## VOD/media

Worker còn có các đường TikTok origin/resolver/relay theo request, gồm `/tiktok/video-origin`, `/tiktok/video-direct`, `/tiktok/video-stream` và các helper liên quan. Media bytes không đi qua Supabase.

## Deploy guard

- `wrangler.toml` bắt buộc `crons = []`.
- Worker không được export `scheduled()`.
- Workflow `deploy-tiktok-live-state-edge.yml` sau deploy chủ động PUT schedules về `[]` và verify Cloudflare trả schedule count = 0.
- Contract `demand-only-contract.test.cjs` khóa ba điều trên để cron không thể vô tình quay lại.
