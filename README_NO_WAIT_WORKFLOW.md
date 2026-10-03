# README NO-WAIT WORKFLOW — QUY TẮC LÀM VIỆC KHÔNG ĐỨNG CHỜ

> **BẮT BUỘC đọc cùng `CURRENT_WORK.md` trước mọi sửa chữa / deploy / migration / probe dài.**
>
> Mục tiêu: công việc luôn tiến về phía trước, không đứng chờ một job, không spam retry để vượt giới hạn, không tạo job trùng, không làm người dùng phải nhắc lại “làm tiếp”.
>
> **Không né hard limit bằng cách gọi dồn / tạo nhiều job / đổi tài khoản vô hạn.** Thay vào đó phải thiết kế để không chạm giới hạn: batch, cache, lease, fallback, đổi đúng runtime owner, giữ last-known-good.

## 1. Quy tắc số 1 — KHÔNG CHỜ THỤ ĐỘNG

Nếu một việc đang chạy ở GitHub / Supabase / Cloudflare / Render:

1. chỉ tạo **một** job đúng owner;
2. ghi lại job/run/request id;
3. **không ngồi poll liên tục**;
4. chuyển ngay sang việc độc lập còn lại:
   - đọc code liên quan;
   - chuẩn bị test;
   - kiểm tra source of truth;
   - chuẩn bị rollback;
   - cập nhật contract/rule;
   - kiểm tra dữ liệu mẫu khác;
5. khi phần độc lập xong mới kiểm tra trạng thái job một lần.

**Cấm** trả lời kiểu “đợi deploy xong”, “chờ vài phút”, “để lát kiểm tra lại” nếu vẫn còn việc có thể làm ngay.

## 2. Một owner / scope chỉ có một work item đang chạy

- Một scope đang có refresh lease → không tạo refresh thứ hai.
- Một deploy cùng runtime đang chạy → không tạo deploy thử thứ hai.
- Một scan LIVE đang chạy → browser/job khác join/reuse hoặc bỏ qua.
- Một migration đang chạy → không chồng migration khác cùng bảng.
- Một incident → một owner → một patch → một deploy.

Nếu thấy `already_running`, `lease_locked`, `queued`, `in_progress`:
- **không retry ngay**;
- chuyển sang việc khác;
- chỉ quay lại khi cần verify.

## 3. Retry phải bounded — cùng một cách fail 2 lần thì đổi đường

Cùng một cơ chế fail **2 lần liên tiếp** trong cùng incident:

- dừng retry cơ chế đó;
- đọc error/log ngắn nhất;
- xác định nguyên nhân;
- đổi sang owner/runtime/source phù hợp hơn hoặc rollback.

Ví dụ:
- Supabase IP bị YouTube/Google block → không gọi InnerTube tiếp từ Supabase; chuyển realtime verification về Cloudflare.
- GitHub raw private repo không tải được trong workflow → không curl lại nhiều lần; dùng checkout/mirror/pinned artifact đúng quyền.
- Pages deploy fail ở cùng bước 2 lần → rollback/đổi đúng deploy owner, không tạo thêm commit thử.

**Cấm** vòng `while(true)`, retry vô hạn, hoặc gọi API mỗi vài giây chỉ để “mong lần sau được”.

## 4. Hard limit là constraint thiết kế, không phải lý do đứng lại

Khi gặp:
- 429 / quota;
- 403 / permission;
- CAPTCHA / automated-query block;
- bandwidth / egress / log limit;
- deploy queue;
- provider timeout;

phải làm theo thứ tự:

```text
xác định limit thuộc owner nào
→ dừng spam request
→ giữ last-known-good
→ giảm/batch payload
→ dùng cache/hash/lease
→ nếu kiến trúc đã có runtime phù hợp hơn thì chuyển đúng owner
→ tiếp tục các phần việc không phụ thuộc limit
```

Không “vượt giới hạn” bằng:
- tạo nhiều account/job song song;
- đổi IP vô hạn;
- fan-out browser;
- tăng polling;
- tăng log/debug;
- retry nhanh.

## 5. Batch trước, gọi ít lần hơn

Trước khi gọi tool/API phải hỏi:

1. Có thể lấy nhiều file/row/status trong **một** call không?
2. Có thể query đúng 1 video/1 channel/1 time window không?
3. Có cache/hash/version để tránh tải full data không?
4. Có thể dùng kết quả vừa có thay vì gọi lại không?

Ưu tiên:
- một SQL query lấy các row liên quan;
- một tool call đọc nhiều rule/file;
- một log query có time window + function id;
- một package/hash check thay vì tải full package.

## 6. Không scan toàn hệ thống để chữa một lỗi nhỏ

Một card sai → probe đúng videoId.

Một kênh LIVE thiếu → probe đúng channelId.

Một deploy fail → xem đúng run/job/step.

Một bảng phình → tìm đúng writer/top table.

Chỉ scan rộng khi probe nhỏ đã chứng minh lỗi là hệ thống-wide.

## 7. Timeout ngắn + fallback

Mọi network/probe production phải:
- có timeout hữu hạn;
- có fallback/last-known-good;
- fail thì trả trạng thái rõ;
- không giữ UI chờ vô hạn.

LIVE/package:
- scan chưa xong → giữ package cũ;
- metadata chưa xác minh → không publish row mới;
- upstream lỗi → không ghi `[]` đè data tốt.

## 8. Deploy không được tạo hàng đợi vô ích

- Gom patch cùng owner thành một commit code khi có thể.
- Chỉ deploy runtime bị đổi.
- Commit docs sau verify không được cố tạo deploy production mới.
- Nếu run cũ bị supersede bởi commit mới thì cancel/reuse theo workflow; không giữ nhiều deploy cùng một mục tiêu.
- Không commit từng ý nhỏ chỉ để kích workflow “xem thử”.

## 9. Khi job đang chạy, checklist việc phải làm ngay

Trong thời gian job chạy, chọn việc độc lập theo thứ tự:

1. xác minh source of truth;
2. đọc diff/runtime source;
3. chuẩn bị production probe;
4. chuẩn bị rollback;
5. kiểm tra data impact;
6. cập nhật test/contract;
7. cập nhật handoff/rule nếu kiến trúc đã rõ;
8. sau đó mới check job.

Nếu không còn việc độc lập nào:
- kiểm tra job **một lần**;
- nếu vẫn chưa xong, ghi blocker + job id + next verification vào `CURRENT_WORK.md`;
- không tạo job mới để lấp thời gian.

## 10. Không hỏi lại khi đã đủ dữ kiện

Nếu yêu cầu rõ và thay đổi:
- nhỏ;
- có rollback;
- không destructive;
- đúng owner;

thì thực hiện luôn.

Chỉ hỏi lại khi:
- có nhiều production target thật sự không phân biệt được;
- thao tác destructive/irreversible;
- thiếu secret/quyền bắt buộc mà không có đường thay thế an toàn.

## 11. Chat/handoff không được mất nhịp

Trước sửa:
1. đọc `CURRENT_WORK.md`;
2. đọc `README_MAINTENANCE.md`;
3. đọc file này;
4. nếu liên quan polling/API/package/cache/log/media/traffic → đọc `README_RESOURCE_GUARDRAILS.md`.

Sau mỗi thay đổi đáng kể:
- cập nhật `CURRENT_WORK.md` ngay khi trạng thái/owner/next probe thay đổi;
- sau repair/deploy cập nhật `NHAT_KY.md`;
- không để chat sau phải đọc lại toàn repo để biết đang làm gì.

## 12. Trạng thái thực thi chuẩn

```text
READ RULE
→ MINIMAL PROBE
→ OWNER
→ PATCH
→ TEST
→ START ONE DEPLOY/JOB
→ DO INDEPENDENT WORK
→ CHECK ONCE
→ PROD VERIFY
→ DOC/HANDOFF
```

Không có bước “ngồi chờ”.

## 13. Quy tắc riêng cho AI / tool workflow

- Không hứa “làm nền” nếu không có automation thực.
- Không nói “chờ mình” rồi dừng.
- Không lặp cùng tool call chỉ vì chưa thấy kết quả.
- Giữ update tiến độ ngắn khi task dài, nhưng update phải kèm việc đã làm/đang làm.
- Khi một tool/service bị giới hạn, tiếp tục phần có thể làm bằng source/data đã có.
- Chỉ nói **xong** khi production verify + docs/handoff hoàn tất theo Maintenance rule.

## 14. Câu nhớ nhanh

> **JOB ĐANG CHẠY → KHÔNG TẠO JOB THỨ HAI.**

> **CÒN VIỆC ĐỘC LẬP → KHÔNG ĐƯỢC ĐỨNG CHỜ.**

> **CÙNG MỘT CÁCH FAIL 2 LẦN → ĐỔI ĐƯỜNG, KHÔNG RETRY MÙ.**

> **LIMIT → GIẢM / BATCH / CACHE / ĐỔI ĐÚNG OWNER, KHÔNG SPAM.**

> **UPSTREAM CHƯA CHẮC → GIỮ LAST-KNOWN-GOOD.**

> **CHAT SAU PHẢI ĐỌC RULE LÀ LÀM TIẾP ĐƯỢC NGAY.**
