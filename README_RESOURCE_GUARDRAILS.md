# 1988 — QUY TẮC CHỐNG PHÌNH EGRESS / LOG / DATA

> **Áp dụng bắt buộc cho production `1sl2tp/1988`.**
>
> Mục tiêu: giữ Supabase Free/Nano ổn định lâu dài, không để một thay đổi UI, polling, debug hoặc scheduler làm tăng Egress / Log Ingestion / Database / Storage ngoài kiểm soát.
>
> Quy tắc cốt lõi: **UI đọc package; server đóng package; Cloudflare phát hiện realtime; không truyền media bytes qua Supabase; không log từng item.**

## 0. Mốc sử dụng hiện tại

Mốc tham chiếu từ dashboard ngày **2026-10-03**:

| Tài nguyên | Đang dùng | Hạn mức hiển thị |
|---|---:|---:|
| Egress | 1.10 GB | 5 GB |
| Database size | 48 MB | 500 MB |
| File storage | 0.06 GB | 1 GB |
| Log Ingestion | 0.14 GB | 1 GB |
| Log Query | 17 GB | 100 GB |
| Monthly active users | 0 | 50,000 |

Mốc này chỉ là baseline để so xu hướng. Không dùng nó làm lý do tăng polling.

## 1. Luật kiến trúc bắt buộc

### 1.1. Danh sách YouTube trên UI chỉ đọc package

Các tab:

- Live
- Ngày
- Tuần
- Nhạc
- Phim
- Hài
- Teen
- Kid
- Review
- Sinh tồn
- Khám phá
- SHOWS
- Showbiz
- Công nghệ
- Thể thao
- các hashtag động

phải theo đúng luồng:

```text
server lấy dữ liệu
→ server lọc / dedupe / chọn item
→ server đóng package
→ manifest chỉ trả hash/version nhỏ
→ UI đọc package cache
→ hash đổi mới tải package mới
→ render
```

**Cấm** UI nhận hàng trăm video rồi tự lọc, dedupe hoặc chọn “mỗi kênh một video”.

### 1.2. LIVE

```text
Cloudflare = phát hiện kênh/video đang LIVE
Supabase = lọc + bổ sung metadata cần thiết + đóng package LIVE
UI = chỉ đọc package LIVE

Với YouTube package feed, `videoId/sourceId/sourceName/sourceAvatar/title` trong package là **authoritative cho card**. UI không được sửa/chữa các field đó bằng Cloudflare snapshot, channel library hay video metadata. Package có bao nhiêu LIVE thì UI phải render đủ bấy nhiêu LIVE; không được cắt membership bằng giới hạn render cứng.
```

Cloudflare **không phải feed trực tiếp của UI**.

### 1.2.1. Source state và LIVE kế thừa

```text
LIVE selected = union(selected mọi scope) - union(blocked mọi scope)
```

- `selected / blocked / normal` trong `yt1988_source_state` là canonical.
- Main UI và `/sources/` phải hiển thị cùng một trạng thái hiệu lực.
- LIVE inherited state phải ghi rõ là kế thừa; không được toggle `normal` ở LIVE để che một selected/blocked còn tồn tại ở scope khác.
- Mỗi thao tác `set_source` chỉ targeted-sync đúng channel vừa đổi ở Cloudflare.
- Không full-scan LIVE chỉ vì chọn/bỏ/chặn một channel.
- Nếu targeted sync làm snapshot LIVE thay đổi, Cloudflare mới wake package LIVE.
- Nếu LIVE không visible, browser không tải package LIVE trước; server vẫn cập nhật canonical state/snapshot/package theo user action.

Khi mở web:

1. vẽ package `latest` đã có;
2. **không preload / không wake LIVE chỉ vì app vừa mở**;
3. chỉ khi người dùng thật sự mở bề mặt LIVE và document còn visible mới chạy LIVE discovery;
4. mở YouTube LIVE → Cloudflare discovery → Supabase đóng package → UI chỉ nhận package/hash;
5. mở TikTok LIVE → edge scan theo demand → UI đọc snapshot LIVE;
6. ở lại LIVE visible → được phép scan lại tối đa khoảng 1 lần/phút;
7. đổi tab / hidden / đóng web → dừng LIVE discovery;
8. package LIVE cũ vẫn dùng cho tới khi package mới hoàn chỉnh;
9. **không bao giờ ghi package rỗng đè package LIVE tốt chỉ vì một lần probe lỗi/chưa hoàn tất**.

**LIVE Cloudflare không được có cron schedule.** Runtime production phải giữ schedule count = 0; nhiều browser chỉ được join/reuse work hiện có hoặc bị lease/dedupe chặn, không tạo crawler độc lập.

### 1.3. Ngoại lệ truy vấn trực tiếp

Chỉ các hành động có chủ ý của người dùng mới được gọi API trực tiếp:

- tìm kiếm;
- dán URL YouTube;
- mở một kênh;
- mở một video để lấy metadata/player cần thiết;
- thao tác quản lý nguồn.

Không biến những hành động này thành polling nền.

## 2. Lịch tải / refresh chuẩn

Mục tiêu là **stale-while-revalidate**: dùng gói hiện có trước, cập nhật nền sau.

| Scope | Package server due | Client |
|---|---:|---|
| LIVE | theo demand khi LIVE visible, tối đa khoảng 1 lần/phút | mở LIVE mới scan/wake; hidden/đổi tab/không có web = không discovery |
| Ngày / latest | 5 phút | mở tab đọc cache trước, check hash nền |
| Tuần / week | 30 phút | mở tab đọc cache trước, check hash nền |
| hashtag/content | 15 phút | chỉ refresh khi scope đến hạn |
| search | theo thao tác | không polling |
| channel open | theo thao tác | không polling |
| video metadata | theo video đang mở | không fan-out toàn feed |

### 2.1. Khi app hidden/offline

- Không polling package liên tục.
- Không scan LIVE từ browser.
- Không refresh toàn bộ scope.
- Khi quay lại foreground: chỉ check manifest/hash của scope cần dùng.
- Không tạo job mới nếu server đã có job cùng loại đang chạy.

## 3. Quy tắc Egress

### 3.1. Bắt buộc

1. **Hash trước, data sau.**
   - manifest nhỏ được phép check;
   - package chỉ tải khi hash/version đổi.

2. **Không tải cùng một package nhiều lần trong một lần mở app.**
   - RAM cache → IndexedDB → network là thứ tự ưu tiên.

3. **Không tải tất cả package ở mỗi interval.**
   - chỉ scope đang dùng;
   - không có LIVE warmup ở startup;
   - scope khác đọc cache và refresh khi mở.

4. **Không truyền media binary qua Supabase.**
   - không video;
   - không audio;
   - không thumbnail/avatar binary;
   - DB chỉ giữ URL/metadata cần thiết.

5. **Không proxy media qua Edge Function Supabase.**
   - media streaming thuộc CDN/Cloudflare/origin phù hợp.

6. **Không trả payload dư.**
   Package/card chỉ giữ field UI/player thực sự dùng.

7. **Không trả full canonical state nếu client chỉ cần 1 phần nhỏ.**
   Endpoint phải có scope/operation rõ ràng.

8. **Một người mở web không tạo một crawler riêng.**
   Browser chỉ “wake”; server lease/dedupe quyết định có job mới hay không.

### 3.2. Ngưỡng vận hành

| Mức | Egress 5 GB | Hành động |
|---|---:|---|
| Xanh | < 2.5 GB | bình thường |
| Vàng | 2.5–3.5 GB | rà payload + polling |
| Cam | 3.5–4.0 GB | giảm refresh không thiết yếu, tìm top endpoint |
| Đỏ | 4.0–4.5 GB | đóng debug/probe nền, chỉ giữ luồng production cần thiết |
| Khẩn | > 4.5 GB | freeze thay đổi làm tăng traffic, điều tra trước khi tiếp tục |

**Không chờ tới 5 GB mới xử lý.**

## 4. Quy tắc Log Ingestion

### 4.1. Production không log theo item

**Cấm:**

- `console.log` mỗi video;
- log mỗi kênh trong loop;
- log mỗi segment/media request;
- log HTML/JSON response đầy đủ;
- log package đầy đủ;
- log thumbnail/avatar URL hàng loạt;
- log signed URL/token/cookie/auth header;
- log binary/base64;
- log cùng một lỗi lặp lại mỗi vài giây.

### 4.2. Mỗi job chỉ cần summary

Mẫu:

```json
{
  "job": "yt1988-refresh",
  "scope": "live",
  "ok": true,
  "checked": 251,
  "published": 29,
  "changed": true,
  "duration_ms": 8230
}
```

Một job bình thường nên có tối đa:

- 1 dòng start nếu thực sự cần;
- 1 dòng summary cuối;
- 1 dòng error compact nếu fail.

### 4.3. Error phải compact và dedupe

Cho phép:

```text
youtube_live_probe_failed code=upstream_timeout channel=UC...
```

Không cho phép dump:

- full response body;
- full stack lặp lại hàng trăm lần;
- toàn bộ request headers;
- HTML YouTube;
- signed media URL.

Cùng một `error_code + endpoint + channel/source` nên rate-limit log theo cửa sổ thời gian, thay vì ghi mọi lần retry.

### 4.4. Debug

- Debug mặc định **OFF** ở production.
- Debug chỉ bật cho một incident có thời hạn.
- Probe dùng 1–3 mẫu, không scan toàn hệ thống.
- Xong incident phải tắt debug.
- Workflow `*-once.yml` không được biến thành cron liên tục nếu không có lý do rõ ràng.

### 4.5. Ngưỡng Log Ingestion

| Mức | Log Ingestion 1 GB | Hành động |
|---|---:|---|
| Xanh | < 0.40 GB | bình thường |
| Vàng | 0.40–0.60 GB | kiểm tra function/job nhiều log nhất |
| Cam | 0.60–0.75 GB | tắt debug, gom log summary |
| Đỏ | 0.75–0.90 GB | chỉ giữ error cần thiết |
| Khẩn | > 0.90 GB | freeze logging không bắt buộc |

## 5. Database / Storage

### 5.1. Canonical giữ, dữ liệu tạm phải có giới hạn

**Không xóa để tiết kiệm:**

- selected/blocked;
- channel library chuẩn;
- canonical metadata cần thiết;
- đơn hàng/chat/business data thuộc hệ thống khác.

**Phải giới hạn/TTL:**

- discovery state;
- refresh queue/state;
- cache tạm;
- probe result;
- expired URL;
- temporary session/resolver data;
- dữ liệu debug.

### 5.2. Package

- Mỗi scope chỉ cần **package hiện hành**.
- Không tạo lịch sử package vô hạn trong DB.
- Version/hash dùng để swap, không cần giữ toàn bộ các bản cũ.
- Browser có fallback local; server không cần nhân bản nhiều package giống nhau.

### 5.3. Hình ảnh/media

- Lưu URL gốc/canonical khi cần.
- Không đưa ảnh/video/audio binary vào Postgres log/table.
- File storage chỉ dùng khi có lý do rõ ràng; phải có owner + retention.

### 5.4. Ngưỡng DB

| Mức | DB 500 MB | Hành động |
|---|---:|---|
| Xanh | < 250 MB | bình thường |
| Vàng | 250–350 MB | rà bảng tăng nhanh |
| Cam | 350–400 MB | dọn cache/temporary rows |
| Đỏ | 400–450 MB | chặn writer gây phình |
| Khẩn | > 450 MB | freeze writer không thiết yếu |

## 6. Quy tắc scheduler / cron

1. Một chức năng chỉ có **một owner scheduler**.
2. LIVE YouTube/TikTok là **demand-only**: Cloudflare schedule phải bằng 0; không có người dùng mở LIVE thì không discovery.
3. Không để cùng lúc GitHub cron + Supabase cron + browser polling cùng làm một việc.
4. Browser chỉ wake scope đang visible; server/edge cycle + lease chống trùng.
5. Job B thấy job A cùng scope đang chạy → không tạo job mới.
6. Retry phải bounded; không `while(true)`. Cùng một cơ chế fail 2 lần trong một incident thì áp dụng `README_NO_WAIT_WORKFLOW.md`: dừng retry mù và đổi đường/owner.
7. Job/lease đang chạy → không poll dồn và không tạo job thứ hai; chuyển sang việc độc lập khác rồi mới check trạng thái.
8. Fail upstream → giữ last-known-good; không ghi rỗng.
9. Không refresh mọi kênh nếu chỉ một scope đang cần.
10. Kênh mới do search/LIVE phát hiện có thể được hydrate một lần rồi ghi canonical library; không hydrate lại mọi lần render.

## 7. Quy tắc payload

Trước khi thêm field vào package/API phải trả lời:

1. UI có dùng field này không?
2. Player có dùng field này không?
3. Có thể lấy từ channel library thay vì lặp lại trên mọi video không?
4. Field có phải URL tạm/signed URL không?
5. Có làm package tăng theo số item không?

Nếu câu trả lời là “không cần” → **không thêm**.

## 8. Quy tắc log query / dashboard

- Không chạy truy vấn log diện rộng nhiều lần để “xem thử”.
- Luôn thu hẹp bằng:
  - time window;
  - function/service;
  - error code;
  - request/job id.
- Điều tra production dùng mẫu nhỏ nhất đủ chứng minh.
- Không refresh dashboard log liên tục trong thời gian dài.

## 9. Checklist trước khi merge/deploy

### Egress

- [ ] UI có tải lại package dù hash không đổi không?
- [ ] Có polling mới không?
- [ ] Polling có dừng khi hidden/offline không?
- [ ] Có endpoint trả payload lớn hơn trước không?
- [ ] Có media bytes đi qua Supabase không?
- [ ] Có fan-out theo số user/browser không?

### Log

- [ ] Có `console.log` trong loop không?
- [ ] Có log raw body/HTML/package không?
- [ ] Có lỗi retry lặp lại không?
- [ ] Có debug production không?
- [ ] Có workflow probe/cron mới không?

### Data

- [ ] Có table/cache mới không?
- [ ] Cache mới có TTL/cleanup không?
- [ ] Có writer append vô hạn không?
- [ ] Có giữ last-known-good khi upstream lỗi không?

Nếu một mục nguy hiểm = **không merge cho tới khi có giới hạn rõ ràng**.

## 10. Khi Egress/Log tăng bất thường

Chỉ làm theo thứ tự:

```text
1. xác định thời điểm bắt đầu tăng
2. tìm deploy/job/scheduler gần thời điểm đó
3. tìm owner duy nhất
4. tắt hoặc rollback writer/poller gây tăng
5. kiểm tra lại tốc độ tăng
6. mới tối ưu tiếp
```

Không sửa đồng thời UI + DB + Cloudflare + Render chỉ vì thấy dashboard tăng.

## 11. Quy tắc 1988 phải nhớ

> **SERVER QUYẾT ĐỊNH DỮ LIỆU — UI CHỈ HIỂN THỊ.**

> **HASH KHÔNG ĐỔI → KHÔNG TẢI PACKAGE.**

> **KHÔNG AI MỞ LIVE → KHÔNG LIVE DISCOVERY.**

> **MỘT JOB ĐANG CHẠY → KHÔNG TẠO JOB THỨ HAI.**

> **UPSTREAM LỖI → GIỮ LAST-KNOWN-GOOD, KHÔNG GHI RỖNG.**

> **KHÔNG MEDIA BYTES TRONG SUPABASE.**

> **KHÔNG LOG TỪNG ITEM.**

> **DEBUG XONG PHẢI TẮT.**

## 12. Review định kỳ

Mỗi tuần hoặc sau thay đổi scheduler/backend:

- chụp lại Egress / DB size / File storage / Log Ingestion;
- so với baseline gần nhất;
- nếu tốc độ tăng thay đổi rõ rệt, tìm nguyên nhân trước khi thêm tính năng nền mới;
- ghi nhận thay đổi có ảnh hưởng resource trong `NHAT_KY.md`.

Tài liệu này là guardrail bắt buộc cùng với `README_MAINTENANCE.md`.
