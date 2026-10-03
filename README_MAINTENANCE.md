# README MAINTENANCE — QUY TẮC BẮT BUỘC DỰ ÁN 1988

> **BẮT BUỘC ĐỌC TRƯỚC KHI SỬA.**  
> Mục tiêu số 1: **sửa nhanh, đúng lớp, không làm gián đoạn phần đang chạy**.  
> Áp dụng cho mọi sửa chữa, tối ưu, migration, UI, data, kết nối, deploy, rollback và bảo trì repo `1sl2tp/1988`.

## 0. FAST REPAIR — quy trình ưu tiên ít gián đoạn

### 0.1. Trước khi viết code phải nói được 4 ý

1. **Lỗi thuộc lớp nào?** UI / Supabase / Render / Cloudflare / DNS-GitHub Pages.
2. **Bằng chứng ngắn nhất là gì?** Một endpoint, một log, một row DB, một screenshot, một workflow.
3. **Thay đổi nhỏ nhất có thể sửa lỗi là gì?**
4. **Rollback về đâu nếu sai?**

Người sửa/AI phải **gợi ý cách nhanh và an toàn hơn** nếu yêu cầu ban đầu có nguy cơ kéo dài downtime, gọi API thừa, sửa nhiều lớp hoặc làm phình dữ liệu. Không máy móc làm theo một cơ chế kém hơn khi đã thấy đường ngắn hơn.

### 0.2. 90 giây đầu: phân loại, không sửa lan

| Triệu chứng | Owner đầu tiên | Kiểm tra đầu tiên |
|---|---|---|
| Web 404 / domain | GitHub Pages + DNS | Pages run, custom domain, CNAME/HTTPS |
| UI lệch / click sai | Frontend | `index.html`, `src/**`, browser state |
| Feed/package cũ hoặc rỗng | Supabase | package hash/version + Edge Function |
| Tên/avatar/subscriber/tích xanh sai | Channel library | `yt1988-state.state.channelLibrary` + canonical tables |
| TikTok profile/video list sai | Render + Supabase canonical | library endpoint + `yt1988_tiktok_*` |
| TikTok LIVE/VOD không phát | Cloudflare edge | live state / video-stream / resolver |
| YouTube LIVE không hiện | YouTube live edge | edge live endpoint |
| DB/log/egress tăng | Writer/scheduler | job lặp, payload lớn, media bytes |

### 0.3. Khi production đang hỏng

- **Rollback trước, điều tra sau** nếu lỗi là regression từ deploy gần nhất và rollback rõ ràng.
- Không refactor, dọn file, đổi kiến trúc hoặc tối ưu thêm trong lúc production đang hỏng.
- Không chồng fix thứ hai lên fix thứ nhất nếu chưa biết fix thứ nhất có tác dụng.
- Nếu 2 deploy liên tiếp cùng incident đều fail: **dừng, quay về last-known-good**, thu bằng chứng rồi làm lại.
- Bản production cũ phải tiếp tục phục vụ cho tới khi bản mới PASS; không xóa fallback tốt trước deploy.

### 0.4. Khi production vẫn chạy

- **Một lỗi → một owner → một patch → một deploy owner.**
- Ưu tiên probe 1 kênh / 1 video / 1 endpoint; không scan toàn hệ thống để chẩn đoán.
- Migration phải **additive/backward-compatible trước**; deploy backend/schema trước, consumer UI sau; chỉ xóa field cũ ở đợt riêng khi đã verify.
- Không tạo thêm cache/package/table nếu source of truth đã tồn tại.
- Không deploy standby host khi production host không dùng nó.

### 0.5. Quy tắc commit/deploy nhanh

- Gom các file cùng một sửa chữa thành **một commit code chính** khi có thể.
- Không tạo chuỗi commit nhỏ trên `main` chỉ để thử từng ý; việc đó kích nhiều deploy và làm chậm.
- Frontend: chỉ commit cuối cần deploy Pages; run cũ được phép cancel khi commit mới hơn xuất hiện.
- Backend/Supabase/Worker: chỉ deploy runtime bị ảnh hưởng; không rebuild frontend nếu không đổi frontend.
- Commit tài liệu/nhật ký sau verify phải là **docs-only và không kích workflow production riêng**.
- Nếu GitHub vẫn tạo run **`pages build and deployment` event=`dynamic`** cho commit Markdown, repo đang còn Pages native/branch mode song song. Phải vào **Settings → Pages → Build and deployment → Source = GitHub Actions**. Không cố ép bằng `GITHUB_TOKEN`; quyền `pages:write` hiện trả 403 cho thao tác đổi source.
- Không kích Cloudflare static-site/Render static-site standby trong repair bình thường.

### 0.6. Trạng thái bắt buộc

Dùng đúng chuỗi trạng thái:
`DIAGNOSED → PATCHED → TEST PASS → DEPLOYED → PROD VERIFIED → DOC UPDATED`.

Chỉ được nói **“xong”** sau `PROD VERIFIED` và `DOC UPDATED`.

## 1. Nguồn sự thật

- **Source code:** GitHub repo `1sl2tp/1988`.
- **Production branch:** `main`.
- **Frontend production:** GitHub Pages tại `https://yt.taphoa.xyz/`.
- **Data/state/package:** Supabase.
- **TikTok metadata/session:** Render `1988-tiktok-session`.
- **Realtime/stream:** Cloudflare Workers theo từng chức năng.
- **Tài liệu vận hành:** Google Sheet **1988 - Vận hành kết nối bảo trì**  
  https://docs.google.com/spreadsheets/d/1lGx0zMSzqbUF2liGxWor4GxAdEZx2gHn73Ee6sySnuU/edit
- **Nhật ký:** `NHAT_KY.md`.
- **Rollback/checkpoint:** `CHECKPOINT.md`.

## 2. Trước mọi lần sửa

1. **Bắt buộc đọc `CURRENT_WORK.md` trước** để biết incident/trạng thái/commit/runtime gần nhất. Không được sửa chỉ dựa vào trí nhớ hội thoại.
2. Đọc file này và tab **README Quy tac** trong Sheet.
3. Nếu thay đổi liên quan **polling / scheduler / package / API / cache / log / media / Supabase traffic**, bắt buộc đọc `README_RESOURCE_GUARDRAILS.md` và kiểm tra checklist Egress/Log/Data trước khi merge.
4. Đọc tab liên quan:
   - UI/web: `02 Web va the`, `07 Sua Deploy`, `09 Su co`.
   - DB/Supabase: `03 Database`, `08 Bao tri`.
   - Render: `04 Render`.
   - TikTok: `05 TikTok`.
   - YouTube: `06 YouTube`.
5. Ghi nhận branch, HEAD/base commit, last-known-good, file/bảng/endpoint cần sửa.
6. Kiểm tra source of truth trước. **Không sửa UI để chữa dữ liệu nguồn sai.**
7. Nêu patch nhỏ nhất và rollback trước khi chỉnh production.

## 3. Nguyên tắc dữ liệu và channel library

- YouTube canonical: `yt1988_channel_directory`.
- TikTok canonical: `yt1988_tiktok_channels`.
- Web nhận schema chung qua `yt1988-state.state.channelLibrary`.
- UI identity phải ưu tiên `channelLibrary`; metadata video/package chỉ fallback.
- Chuẩn chung gồm: `key/platform/id/userId/handle/name/description/profileUrl/avatar/verification/verified/badges/stats/status/source/checkedAt/updatedAt`.
- `verification.known=false` nghĩa là **chưa có nguồn xác nhận**, không được hiểu thành “không verified”.
- Field chưa biết dùng `null`/rỗng đúng contract; **không bịa số 0 thành dữ liệu thật**.
- Không tạo bảng channel-library thứ ba. Chỉ normalize khi đọc.
- Không ghi binary/video/audio vào database hoặc log.
- Không giữ URL tạm/đã hết hạn trong package UI nếu browser không dùng.
- Cache phải có TTL/retention; không xóa canonical channel/video/selected/blocked chỉ để giảm dung lượng.

## 4. Sửa đúng lớp chịu trách nhiệm

- UI: render/interaction/cache client.
- Supabase: canonical data/state/package/schema/Edge Functions.
- Render: TikTok session/profile/library metadata; không gánh media bytes nếu không cần.
- Cloudflare: realtime LIVE/stream/VOD resolver.
- GitHub Pages + DNS: frontend hosting/domain.

**Một lỗi không được sửa đồng thời ở 3–4 lớp chỉ để “thử xem”.**

## 5. Kiểm thử và deploy

1. Chạy đúng contract/integration test của lớp thay đổi.
2. Workflow/deploy tương ứng phải PASS.
3. Xác nhận đúng commit/image/function version đã live.
4. Probe production bằng mẫu nhỏ nhất.
5. UI change: kiểm tra production web.
6. Data change: kiểm tra row/contract thực tế.
7. Nếu deploy fail hoặc production sai: rollback trước, không chồng nhiều sửa mới.
8. Docs-only không được kích production deployment.

## 6. BẮT BUỘC sau mỗi repair/deploy

Cập nhật **cả hai**:

### A. `CURRENT_WORK.md` + `NHAT_KY.md`

- `CURRENT_WORK.md`: cập nhật incident gần nhất, owner, bằng chứng, commit/runtime, production verify, việc còn lại và next probe để chat sau đọc là tiếp tục được ngay.
- `NHAT_KY.md`: ghi thời gian, branch, base/commit, owner layer, nguyên nhân, patch, test, deploy, production, data impact, rollback.

### B. Google Sheet **1988 - Vận hành kết nối bảo trì**

Append tab **Nhat ky sua chua** với:
- thời gian;
- branch/base/commit;
- layer;
- file/bảng/endpoint;
- nguyên nhân;
- patch;
- test;
- workflow/deploy;
- trạng thái production;
- ảnh hưởng data;
- rollback;
- tab tài liệu đã cập nhật.

Nếu kiến trúc/UI/data/kết nối thay đổi thì cập nhật thêm tab chuyên môn tương ứng.

## 7. Quy tắc theo branch

- `main` = production.
- Branch khác = NOT PRODUCTION cho tới khi merge/cherry-pick vào `main`.
- Không để branch/proof tự publish vào production.
- Không dùng proof/demo file trong artifact production.
- Commit ghi trong Sheet phải là commit thật chứa thay đổi.

## 8. Điều kiện được nói “xong”

Phải đủ:
- code đúng branch;
- test PASS;
- runtime đúng commit/version đã deploy;
- production verified;
- không tạo deploy thừa ở runtime khác;
- `NHAT_KY.md` cập nhật;
- Sheet cập nhật;
- tab chuyên môn cập nhật nếu contract thay đổi.

Thiếu một mục → **chưa hoàn tất**.

## 9. Mẫu FAST REPAIR

```text
Triệu chứng:
Owner nghi ngờ:
Bằng chứng:
Last-known-good:
Patch nhỏ nhất:
Test:
Deploy owner:
Production probe:
Rollback:
Docs cập nhật:
```

## 10. Mục tiêu

Mỗi repair phải trả lời được ngay:
1. Lỗi ở đâu?
2. Bằng chứng gì?
3. Patch nhỏ nhất là gì?
4. Deploy đúng runtime nào?
5. Production đã verify chưa?
6. Rollback về đâu?
7. Tài liệu đã cập nhật chưa?
