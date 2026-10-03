# 1988 TikTok LIVE + video edge

## LOCKED LIVE CONTRACT — direct TikTok response only

TikTok LIVE phải giữ đúng luồng này:

```text
GET TikTok /api-live/user/room?aid=1988&sourceType=54&uniqueId=<handle>
→ đọc data.liveRoom
→ status === 2
→ collect FLV/HLS trực tiếp từ liveRoom.streamData / pull_data
→ trả cùng response Cloud cho UI/player
```

Không được thêm lại vào LIVE targeted path:
- Render LIVE resolver;
- `resolveTikTokLiveEdge()` sau status check;
- TikTok API call thứ hai để lấy media;
- HEAD/GET probe media trước khi trả item;
- `/tiktok/live-now` như resolver trung gian cho một handle vừa check;
- click-to-resolve;
- full sweep khi user chỉ check một handle.

`status=4` = OFFLINE. UNKNOWN/upstream failure = UNKNOWN, không tự đổi thành OFFLINE.

Player dùng FLV bằng `mpegts.js`; HLS chỉ là lựa chọn native khi HLS đã có trong **cùng user-room response**. Media bytes không qua Supabase. Render chỉ phục vụ profile/video-list/VOD metadata khi cần.

## Runtime ownership

- Cloudflare: targeted TikTok LIVE status + direct media URL từ cùng TikTok response.
- TikTok CDN: media bytes.
- Render: profile/video list/VOD metadata; **không tham gia đường LIVE direct**.
- Supabase: canonical metadata/state khi cần; **không proxy LIVE media**.

## Demand-only

- Không cron.
- Không có người dùng/bề mặt LIVE → không discovery.
- Một input/handle → một targeted check.
- Không fan-out ẩn.

## VOD/media

VOD là nhánh khác hoàn toàn với LIVE. Worker có thể giữ các đường VOD resolver/relay theo request như `/tiktok/video-stream`, nhưng các resolver VOD không được tái sử dụng để làm phức tạp TikTok LIVE.

## Deploy guard

- `wrangler.toml` bắt buộc `crons = []`.
- Worker không được export `scheduled()`.
- Workflow deploy phải verify schedule count = 0.
- Contract test phải khóa direct LIVE rule nêu trên.
