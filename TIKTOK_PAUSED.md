# TikTok temporary shutdown — 2026-10-04

TikTok của dự án 1988 đang ở trạng thái tạm dừng toàn bộ kết nối.

- Frontend demo: chỉ hiển thị trang bảo trì, không gọi Render/Cloudflare/Supabase/TikTok.
- Main UI: `TIKTOK_UI_ENABLED=false`.
- Cloudflare Worker: hard maintenance, chỉ health không gọi upstream; mọi route TikTok khác trả 503.
- Render `1988-tiktok-session`: `TIKTOK_MAINTENANCE=1`, `TIKTOK_UPDATES_PAUSED=1`, `AUTO_COLLECT=0`; startup không đọc Supabase, không mở browser, không gọi TikTok.
- Supabase: dedicated TikTok Edge Functions trả 503; `yt1988-social-store` từ chối `platform=tiktok`; `yt1988-state` không đọc/merge TikTok; quyền bảng `yt1988_tiktok_*` đã revoke khỏi `anon` và `authenticated`.
- GitHub: auto deploy TikTok Edge và auto build Social Collector đã chuyển sang manual-only.
- Dữ liệu TikTok trong Supabase không bị xóa.

Khôi phục phải làm theo thứ tự ngược:
1. Khôi phục quyền bảng TikTok cho `anon`/`authenticated` theo policy cũ.
2. Khôi phục các Supabase Edge Functions TikTok và nhánh TikTok trong `yt1988-state` / `yt1988-social-store`.
3. Tắt `TIKTOK_MAINTENANCE`, `TIKTOK_UPDATES_PAUSED`; khôi phục Render env cần thiết.
4. Khôi phục Cloudflare Worker khỏi hard maintenance và deploy thủ công.
5. Khôi phục demo/UI TikTok.
6. Chỉ sau khi verify từng lớp mới bật lại auto workflows.
