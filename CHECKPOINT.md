# CHECKPOINT — MAIN 1988

Ngày chốt: **2026-09-28 05:55 (UTC+7)**

## Baseline runtime

- Repo: `1sl2tp/1988`
- Branch production: `main`
- Runtime baseline commit: `4fc6a811064a9a78d1e1db3391da4aeaaa80fa07`
- Domain: `yt.taphoa.xyz`
- Hosting: **GitHub Pages**
- Backend: **Supabase**

## Bản được coi là MAIN chính

`index.html` = giao diện proof hiện tại từ `pip-simple-proof.html`.

Đây là mốc chuẩn để rollback khi một thay đổi mới làm hỏng:

- header / search / source rail;
- bố cục 1 cột, 2 cột;
- PiP;
- tỉ lệ video Ngang–Dọc;
- luồng package/search;
- PWA/cache.

## Hợp đồng media tại checkpoint

1. Server quản lý aspect theo `videoId`.
2. Package và search dùng chung `yt1988_video_meta`.
3. Client phát video ngay, không chờ dò aspect.
4. `videoContentRect` của đúng video đang phát là lớp xác nhận cuối.
5. Nếu player xác nhận khác server, client gửi correction về `yt1988-video-meta`.
6. MAIN / PiP / 2 cột không tự suy ra orientation độc lập.

## Rollback

Checkpoint branch được tạo từ MAIN sau khi ghi nhật ký/checkpoint này. Khi cần rollback UI, ưu tiên quay về checkpoint branch thay vì ghép lại từng commit cũ.
