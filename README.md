# 1988

Web xem YouTube và phát âm thanh nền theo hướng mobile-first.

## Kiến trúc

- Frontend: GitHub Pages tại `yt.taphoa.xyz`.
- API điều phối: Supabase Edge Function `yt1988`.
- Tìm kiếm / metadata / audio stream: API `yt1988` với failover nguồn ở backend.
- Foreground: YouTube IFrame API để mở video nhanh.
- Background: thư viện riêng `src/html5-background.js` dùng HTML5 `<audio>` + Media Session API.
- PWA: manifest + service worker + icon iOS/Android.

## Phát nền

Khi người dùng bấm **Phát nền**:

1. Lấy thời điểm hiện tại từ YouTube.
2. Thư viện HTML5 của 1988 mở audio stream qua `yt1988?action=media&kind=audio`.
3. Seek audio đến đúng thời điểm.
4. Khi audio đã phát, pause YouTube.
5. Media Session cung cấp Play/Pause/Seek trên màn hình khóa.
6. Khi chọn **Xem video**, lấy `audio.currentTime`, seek YouTube tới đó rồi tiếp tục hình.

Dự án không dùng NewPipe/NewPipeExtractor.
