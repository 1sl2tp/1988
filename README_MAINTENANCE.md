# README MAINTENANCE — QUY TẮC BẮT BUỘC DỰ ÁN 1988

> **BẮT BUỘC ĐỌC TRƯỚC KHI SỬA.**  
> Áp dụng cho mọi sửa chữa, tối ưu, migration, thay đổi UI, data, kết nối, deploy, rollback và bảo trì dự án `1sl2tp/1988`.

## 1. Nguồn sự thật

- **Source code:** GitHub repo `1sl2tp/1988`.
- **Production branch:** `main`.
- Nếu sửa trên proof/branch khác, phải ghi đúng tên branch đó. Chưa merge `main` thì **không được ghi là production đã sửa**.
- **Tài liệu vận hành:** Google Sheet **1988 - Vận hành kết nối bảo trì**  
  https://docs.google.com/spreadsheets/d/1lGx0zMSzqbUF2liGxWor4GxAdEZx2gHn73Ee6sySnuU/edit
- **Nhật ký trong repo:** `NHAT_KY.md`.
- **Checkpoint/rollback:** `CHECKPOINT.md` và commit/branch rollback được ghi trong từng lần sửa.

## 2. Trước mọi lần sửa

Phải làm đủ các bước sau trước khi thay đổi code/data/runtime:

1. Đọc `README_MAINTENANCE.md`.
2. Đọc tab **README Quy tac** trong Google Sheet.
3. Đọc các tab liên quan đến phần sắp sửa:
   - UI/web: `02 Web va the`, `07 Sua Deploy`, `09 Su co`.
   - Database/Supabase: `03 Database`, `08 Bao tri`.
   - Render: `04 Render`.
   - TikTok: `05 TikTok`.
   - YouTube: `06 YouTube`.
4. Xác định rõ:
   - branch nguồn;
   - base/head commit;
   - file/thư mục sẽ sửa;
   - source of truth của dữ liệu;
   - endpoint/service liên quan;
   - cách rollback.
5. Kiểm tra hiện trạng trước khi sửa. Không sửa UI để chữa lỗi data/server nếu dữ liệu nguồn đang sai.

## 3. Nguyên tắc khi sửa

- Sửa đúng lớp chịu trách nhiệm:
  - UI chỉ render/interaction.
  - Supabase giữ canonical data/state/package.
  - Render xử lý session/metadata/resolver theo đúng vai trò.
  - Cloudflare xử lý realtime/edge/stream theo thiết kế hiện hành.
- Không tạo thêm bảng/cache/package nếu dữ liệu đã có source of truth.
- Không ghi binary/video/audio vào database hoặc log.
- Không giữ URL tạm/đã hết hạn trong package UI nếu browser không dùng.
- Không tạo polling/job trùng; ưu tiên on-demand, hash/version và lock.
- Không xóa canonical channels/videos/source selected/blocked chỉ để giảm dung lượng.
- Dọn cache phải có retention rõ ràng và ghi số liệu trước/sau.
- Không ghi secret, token, cookie, password vào GitHub, Sheet hoặc log.
- Runtime production phải quay về source trong GitHub; tránh sửa tay làm drift.
- Mọi thay đổi schema phải có migration/source tương ứng trong repo.

## 4. Kiểm thử và deploy

Trước khi coi là hoàn tất:

1. Chạy contract/integration test liên quan.
2. Workflow GitHub tương ứng phải PASS.
3. Xác nhận đúng service đã deploy đúng image/commit.
4. Kiểm tra endpoint production.
5. Kiểm tra UI production khi thay đổi ảnh hưởng frontend.
6. Nếu deploy fail hoặc production sai: rollback trước, không chồng nhiều sửa mới lên lỗi chưa rõ.

## 5. BẮT BUỘC sau mỗi repair/deploy

Sau **mỗi lần sửa chữa**, kể cả sửa nhỏ, phải cập nhật **cả hai nơi**:

### A. `NHAT_KY.md`

Ghi ngắn gọn:
- ngày/giờ;
- branch;
- commit;
- phần đã sửa;
- lý do;
- test/deploy;
- trạng thái production;
- rollback nếu cần.

### B. Google Sheet **1988 - Vận hành kết nối bảo trì**

Append một dòng vào tab **Nhat ky sua chua** với tối thiểu:

- Thời gian
- Branch nguồn
- Base commit
- Commit sửa
- Lớp: UI / Data / Supabase / Render / Cloudflare / GitHub
- File hoặc bảng/endpoint thay đổi
- Lỗi/nguyên nhân
- Nội dung sửa
- Test
- Workflow/run/deploy
- Trạng thái production
- Ảnh hưởng data
- Rollback
- Các tab tài liệu đã cập nhật

Nếu sửa làm thay đổi kiến trúc hoặc trạng thái hệ thống thì **phải cập nhật thêm tab chuyên môn tương ứng**, không chỉ ghi nhật ký.

## 6. Quy tắc theo branch

- `main`: production.
- Branch/proof khác: thử nghiệm, phải ghi rõ **NOT PRODUCTION**.
- Khi merge/cherry-pick vào `main`, tạo một dòng nhật ký production mới với commit `main`.
- Commit trong Sheet phải là commit thực tế chứa thay đổi; không ghi commit dự kiến.
- Nếu một thay đổi gồm nhiều commit, ghi commit cuối và liệt kê các commit liên quan trong ghi chú.

## 7. Điều kiện được phép nói “xong”

Chỉ được coi là **xong** khi đồng thời:

- source đã commit vào đúng branch;
- test/workflow cần thiết đã PASS;
- deploy đúng runtime;
- production đã verify;
- `NHAT_KY.md` đã cập nhật;
- Google Sheet **Nhat ky sua chua** đã cập nhật;
- tab kiến trúc/data/kết nối liên quan đã được chỉnh nếu cấu trúc thay đổi.

Thiếu một mục thì trạng thái phải ghi là **chưa hoàn tất**.

## 8. Mẫu nhật ký

```text
Thời gian:
Branch:
Base commit:
Commit:
Lớp:
File/bảng/endpoint:
Nguyên nhân:
Thay đổi:
Test:
Workflow/deploy:
Production:
Ảnh hưởng data:
Rollback:
Tab Sheet cập nhật:
```

## 9. Mục tiêu

Một lần sửa phải để người khác có thể trả lời ngay 5 câu hỏi:

1. Sửa từ branch/commit nào?
2. Sửa file/data nào?
3. Tại sao phải sửa?
4. Đã test/deploy/verify bằng gì?
5. Muốn rollback hoặc bảo trì tiếp thì đọc ở đâu?

Nếu không trả lời được đủ 5 câu này thì tài liệu bảo trì chưa đạt.
