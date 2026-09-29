# CHECKPOINT — MAIN 1988

Ngày chốt: **2026-09-29**

## Mốc hiện tại

- Repo: `1sl2tp/1988`
- Production: `main`
- Commit nền checkpoint: `15bc1ac91bd57e71aef6bffc9305968902413d62`
- Backup branch: `backup-2026-09-29-0137-stable`
- Domain: `yt.taphoa.xyz`
- Hosting: GitHub Pages
- Backend: Supabase
- Service worker: `1988-simple-media-v34`

## Kiến trúc chốt

- Một Rail media core chung cho MAIN 1 cột / PiP / MAIN 2 cột.
- Feed/package do server chuẩn bị; browser chỉ sync bằng manifest hash và đọc RAM/IndexedDB.
- Package là canonical card data.
- Piped nằm ở backend cho search/metadata; deep-link dùng `video_meta` nhanh, không chờ stream.
- Source selected/blocked theo scope ở server.
- Search local/cache trước, global backend sau.
- Download hiện chỉ dùng `yt1988-getlink → GenDownload`.
- Runtime `yt1988 v32` và `yt1988-getlink v2` đã sync source vào repo trong checkpoint này.

## Tài liệu chi tiết

Xem:

`docs/PROJECT_CHECKPOINT_2026-09-29.md`

Tài liệu này ghi đầy đủ:
- mục đích dự án;
- video/player;
- card;
- Piped;
- package/hash sync;
- 1 cột / 2 cột;
- search;
- nguồn data;
- download;
- phần đang tốt/chưa tốt;
- rủi ro;
- hướng phát triển tiếp theo.

## Rollback

Nếu bản sau bị hỏng:

```text
backup-2026-09-29-0137-stable
```

Commit gốc:

```text
15bc1ac91bd57e71aef6bffc9305968902413d62
```

Không ghép lại nhiều commit cũ nếu không cần thiết.
