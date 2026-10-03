# 1988

> ## ⚠️ BẮT BUỘC TRƯỚC KHI SỬA / DEPLOY
>
> Đọc **[README_MAINTENANCE.md](./README_MAINTENANCE.md)**, đặc biệt mục **FAST REPAIR**.
> Trước mọi thay đổi liên quan polling, scheduler, package, API, cache, log hoặc media phải đọc thêm **[README_RESOURCE_GUARDRAILS.md](./README_RESOURCE_GUARDRAILS.md)**.
> Quy tắc mặc định: **một lỗi → một owner → một patch → một deploy**; production hỏng thì rollback trước, điều tra sau.
> Sau repair/deploy phải cập nhật `NHAT_KY.md` và Google Sheet **1988 - Vận hành kết nối bảo trì**.
> Chưa verify production + chưa cập nhật tài liệu thì chưa được coi là “xong”.

Web tổng hợp YouTube/TikTok theo hướng mobile-first.

## Kiến trúc production

- Frontend: GitHub Pages tại `https://yt.taphoa.xyz/`.
- Data/state/package: Supabase.
- TikTok profile/library/session: Render `1988-tiktok-session`.
- TikTok LIVE/VOD edge và YouTube LIVE realtime: Cloudflare Workers.
- PWA: manifest + service worker + icon iOS/Android.

## Thư viện kênh chuẩn dùng chung

UI không tự ghép identity riêng ở từng màn hình.

- YouTube canonical: `yt1988_channel_directory`.
- TikTok canonical: `yt1988_tiktok_channels`.
- API chung: `yt1988-state → state.channelLibrary`.
- MAIN và `sources/` phải ưu tiên cùng thư viện này.
- Contract chung:
  - `key`, `platform`, `id`, `userId`, `handle`;
  - `name`, `description`, `profileUrl`;
  - `avatar.url/sourceUrl/storedUrl`;
  - `verification.known`, `verified`, `badges`;
  - `stats.followers/subscribers/following/likes/views/videos`;
  - `status.selected/blocked/suggested` + scope arrays;
  - `source`, `checkedAt`, `updatedAt`.
- Dữ liệu chưa biết phải để unknown/null; không được coi “chưa kiểm tra” là “không verified”.

## Quy tắc sửa nhanh

1. Xác định owner layer bằng một bằng chứng nhỏ.
2. Nếu production hỏng do regression: rollback last-known-good trước.
3. Sửa đúng một lớp; không refactor/dọn dẹp ngoài incident.
4. Test đúng contract.
5. Chỉ deploy runtime bị ảnh hưởng.
6. Probe production nhỏ nhất.
7. Sau khi ổn mới cập nhật nhật ký/tài liệu bằng docs-only commit.
8. GitHub Pages production phải dùng **Source = GitHub Actions**; nếu thấy run `pages build and deployment` event=`dynamic` cho Markdown thì còn branch/native deploy song song.

Chi tiết xem `README_MAINTENANCE.md`.


## Guardrail tài nguyên

- Supabase là data/state/package, **không phải media proxy**.
- UI YouTube đọc package; hash không đổi thì không tải lại package.
- LIVE: Cloudflare phát hiện → Supabase đóng package → UI đọc package.
- Không log từng video/kênh/segment; production chỉ giữ summary/error compact.
- Không cho một browser tạo crawler/job riêng; server lease/dedupe chống trùng.
- Chi tiết ngưỡng Egress/Log/DB và checklist deploy: [README_RESOURCE_GUARDRAILS.md](./README_RESOURCE_GUARDRAILS.md).
