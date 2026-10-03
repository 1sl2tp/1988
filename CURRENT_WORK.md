# CURRENT WORK — 1988 HANDOFF

> **BẮT BUỘC ĐỌC FILE NÀY TRƯỚC MỌI LẦN SỬA.**
>
> Mục tiêu: khi đổi chat / đổi người sửa / quay lại sau một thời gian, chỉ cần đọc file này + `README_MAINTENANCE.md` là biết production đang chạy theo kiến trúc nào, lỗi gần nhất là gì, đã sửa đến đâu và bước tiếp theo phải kiểm tra ở đâu.
>
> **Không được sửa production chỉ dựa vào trí nhớ hội thoại.**

Cập nhật gần nhất: **2026-10-03**

## 1. Trình tự bắt buộc trước mọi sửa chữa

Đọc theo đúng thứ tự:

1. `CURRENT_WORK.md` — trạng thái gần nhất và việc đang làm.
2. `README_MAINTENANCE.md` — FAST REPAIR / owner / rollback / deploy.
3. Nếu đụng package, polling, API, cache, log, media, Supabase traffic: đọc thêm `README_RESOURCE_GUARDRAILS.md`.
4. Nếu cần rollback: đọc `CHECKPOINT.md`.
5. Chỉ sau đó mới probe source of truth và viết patch.

Nếu chưa đọc đủ các file bắt buộc thì **không sửa**.

## 2. Sau mỗi lần sửa

Bắt buộc cập nhật:

- `CURRENT_WORK.md`:
  - lỗi vừa xử lý;
  - owner layer;
  - bằng chứng;
  - commit/runtime version;
  - production verify;
  - việc còn lại / next probe.
- `NHAT_KY.md`.
- Google Sheet vận hành theo `README_MAINTENANCE.md` nếu connector khả dụng.

Nếu kiến trúc thay đổi thì cập nhật thêm README/rule chuyên môn tương ứng.

## 3. Kiến trúc YouTube hiện tại — không được tự ý đổi

### Feed/tab

```text
Server lọc + dedupe + đóng package
→ manifest/hash
→ UI tải package
→ UI chỉ render
```

Các tab YouTube chính gồm Live / Ngày / Tuần / Nhạc / Phim / Hài / Teen / Kid / Review / ... đều theo package-only.

UI **không**:
- tự chọn mỗi kênh 1 video;
- tự lọc LIVE;
- tự ghép channel identity cho cả feed;
- dùng Cloudflare snapshot làm feed.

### LIVE

```text
Cloudflare = phát hiện candidate đang LIVE
Supabase yt1988-refresh = xác minh / lọc / đóng package LIVE
UI = chỉ đọc package LIVE
```

Package LIVE cũ phải tiếp tục dùng cho tới khi package mới hoàn chỉnh. Không ghi `[]` đè package tốt khi upstream lỗi/chưa xong.

### Identity

Nguồn sự thật của card video:

```text
videoId → exact channelId/sourceId → channel library → name/avatar
```

**Thumbnail không phải nguồn sự thật của tên kênh.**

Nếu một card LIVE có thumbnail của kênh A nhưng tên/avatar của kênh B:
1. lấy đúng `videoId`;
2. kiểm tra package row;
3. exact-search đúng `videoId`;
4. so `sourceId`;
5. sửa package builder / source data;
6. không sửa CSS/fallback UI để che lỗi.

## 4. Incident gần nhất — LIVE gắn sai kênh

Triệu chứng:
- video LIVE `t7goDOQdn9U` (ChimSeDiNang AOE) từng bị package gắn thành `Hillsong Worship`.

Bằng chứng:
- Cloudflare snapshot từng chứa **cùng một videoId** `t7goDOQdn9U` cho hai channel:
  - sai: `UCTSkEZ84nY5gBjiXekhkgmQ` / Hillsong Worship;
  - đúng: `UCXH0kpsCwpoh94iQfGEokOA` / ChimSeDiNang AOE.
- Exact video-id search trả:
  - uploader/channel đúng: `UCXH0kpsCwpoh94iQfGEokOA`;
  - channel: `ChimSeDiNang AOE`;
  - title: `Trực Tiếp | Thiên Khôi CUP | 4v4 Random | SPartacus Gaming vs Thiên Khôi | Ngày 03/10/2026`;
  - viewers tại lần probe: 9659.

Owner đã sửa:
- **Supabase package builder `yt1988-refresh`**.
- Cloudflare chỉ là candidate discovery; Supabase không được tin channel identity mù quáng khi cùng videoId bị nhiều channel claim.

Patch:
- commit: `7bd7e3eddcc4ec6991c5fb8600d3b752a85a2b56`
- runtime: `yt1988-refresh v21`
- khi một `videoId` bị nhiều `channelId` claim:
  - exact-search videoId một lần;
  - lấy owner `sourceId` thật;
  - chỉ giữ claim đúng owner trước khi đóng package.

Production verify:
- package LIVE sau refresh:
  - hash: `11dikh9`
  - `t7goDOQdn9U`
  - sourceId: `UCXH0kpsCwpoh94iQfGEokOA`
  - sourceName: `ChimSeDiNang AOE`
  - title: `Thiên Khôi CUP | 4v4 Random | SPartacus Gaming vs Thiên Khôi | Ngày 03/10/2026`
  - viewerCount/views: `9659`

## 5. Nếu lỗi LIVE sai kênh xuất hiện lại

Probe nhỏ nhất, không scan toàn hệ thống:

1. Query đúng package row theo `videoId`.
2. Query exact video-id metadata.
3. Nếu package sourceId != exact sourceId:
   - lỗi nằm ở package builder / identity merge.
4. Nếu package đúng mà UI sai:
   - lúc đó mới kiểm tra IndexedDB/package cache/client merge.
5. Nếu Cloudflare snapshot có duplicate claim:
   - package builder phải vẫn chọn exact owner đúng;
   - không được để duplicate claim quyết định identity.
6. Không thêm polling/fan-out metadata toàn LIVE chỉ để chữa một card.

## 6. Trạng thái vận hành cần nhớ

- Production branch: `main`.
- Frontend: `https://yt.taphoa.xyz/`.
- YouTube tab UI: package-only.
- Supabase project production: project ref `mstltsunsawqomzniqok`.
- Resource guardrail đang áp dụng:
  - hash không đổi → không tải package;
  - không media bytes qua Supabase;
  - không log từng item;
  - browser không tạo crawler riêng;
  - upstream lỗi → giữ last-known-good.

## 7. Mẫu cập nhật file này sau repair

```text
Thời gian:
Triệu chứng:
Owner:
Bằng chứng:
Base/commit:
Patch:
Runtime/deploy:
Production verify:
Data impact:
Rollback:
Còn lại:
Next probe:
```

**Quy tắc cuối:** trước khi sửa phải đọc rule; sau khi sửa phải để lại handoff đủ rõ để chat sau không phải đoán lại.
