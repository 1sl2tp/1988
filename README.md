# 1988

Web xem và tìm kiếm YouTube theo hướng mobile-first, không dùng YouTube player làm lõi.

## Kiến trúc

- Frontend: GitHub Pages tại `yt.taphoa.xyz`.
- API điều phối: Supabase Edge Function `yt1988`.
- Nguồn dữ liệu/stream: Piped public instances.
- Player: Piped embed mở ngay bằng video ID; metadata tải nền.
- Search hỗ trợ video, kênh và danh sách phát.
- Có trang kênh, playlist, lịch sử xem và danh sách gần đây.
- SponsorBlock lấy từ Piped và player Piped có tích hợp chặn tài trợ.

Frontend không thử tuần tự nhiều Piped instance. Edge Function tự chọn instance khỏe, cache lựa chọn và failover khi nguồn lỗi.
