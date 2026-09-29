# NHẬT KÝ 1988

## 2026-09-28 — Chốt giao diện proof làm MAIN chính

Trạng thái được chốt: **MAIN production chính thức**.

Runtime baseline trước các commit chỉ ghi tài liệu: `4fc6a811064a9a78d1e1db3391da4aeaaa80fa07`.

### Frontend / production

- `yt.taphoa.xyz` chạy bằng **GitHub Pages** từ branch `main`.
- `index.html` hiện là chính giao diện đã hoàn thiện ở `pip-simple-proof.html`.
- Không dùng Vercel.
- Header/search/source rail, bố cục 1 cột / 2 cột / PiP và logic video hiện tại của proof được coi là chuẩn MAIN để tiếp tục phát triển.
- PWA đã chuyển sang cache `1988-simple-media-v1` để tránh giữ giao diện cũ.
- Workflow Pages đã được đổi integration contract cho giao diện production mới và đã chạy xanh.

### Media aspect / Ngang–Dọc

- Aspect thuộc về **videoId**, không thuộc mode UI.
- Tạo bảng Supabase `yt1988_video_meta`.
- Tạo Edge Function `yt1988-video-meta`.
- `yt1988-packages` và `yt1988` search cùng đọc chung cache aspect theo videoId.
- Package/search có thể trả `aspectRatio`, `mediaKind`, `videoWidth`, `videoHeight`, `aspectSource`.
- UI không còn tự import `yt-local.js` để đo aspect trước khi click.
- Click video phát ngay; aspect server chỉ dùng để chọn layout ban đầu.
- Sau khi YouTube player phát đúng video, `videoContentRect` có quyền xác nhận/sửa aspect và gửi correction ngược về server.
- MAIN / PiP / 2 cột dùng cùng một `mediaKind` của video hiện tại.

### Backend đồng bộ source

Các Edge Function đang chạy trên Supabase đã được đồng bộ lại về repo:

- `supabase/functions/yt1988/index.ts`
- `supabase/functions/yt1988-packages/index.ts`
- `supabase/functions/yt1988-video-meta/index.ts`
- migration: `supabase/migrations/20260927225000_yt1988_video_meta.sql`

### Quy ước từ checkpoint này

- Mọi sửa đổi tiếp theo phải lấy **MAIN hiện tại** làm gốc.
- Không quay lại kiến trúc UI cũ trong `src/app.js` trừ khi có yêu cầu rõ ràng.
- Không tạo lại nhánh đo Ngang/Dọc riêng ở client nếu server đã có metadata.
- Nếu thử nghiệm lớn, làm trên proof/branch riêng trước; chỉ nhập vào MAIN khi đã kiểm tra.


## 2026-09-28 — Đóng các luồng GitHub cũ

- GitHub chỉ còn workflow production `.github/workflows/pages.yml`, trigger trên `main`.
- Không có cron/lịch lấy dữ liệu trên GitHub.
- Đã đóng toàn bộ PR cũ còn mở (#140, #122, #32, #24, #16, #2).
- Các branch thử nghiệm cũ chỉ còn là lịch sử ref, không chạy workflow và không tham gia runtime.
- Dữ liệu tự động tiếp tục do Supabase đảm nhiệm: cron `yt1988-refresh-every-minute` → `yt1988-refresh` → `yt1988_packages`.
- Kiểm tra sau khi dọn: package `live/latest/week` vẫn cập nhật bình thường; workflow production run #2083 SUCCESS.


## 2026-09-28 — Chuẩn hóa policy đóng gói server

- Rà toàn bộ package hiện tại: không còn title/source chỉ là số, không còn exact duplicate sau chuẩn hóa, không còn title bắt đầu lặp đúng tên kênh.
- Tăng semantic dedupe cho title ngắn/cùng nguồn và giữ bảo vệ tập/episode khác nhau.
- Dọn tên kênh khỏi đầu title ngay ở server, kể cả trường hợp không có dấu `-/:|`.
- Bổ sung chặn title/source rác hoặc chỉ số trước khi ghi package.
- English-only chỉ lọc ở các feed hệ thống `live/latest/week`; các nguồn nội dung được chọn như Nhạc/Phim/Review không bị xóa mù quáng.
- Chuẩn hóa blacklist LIVE thành từng keyword/phrase riêng và áp dụng cho cả LIVE tìm ngoài lẫn LIVE từ kênh đã chọn.
- `general` blocked channel được áp dụng toàn bộ scope; blocked theo scope vẫn được giữ riêng.
- Mọi package bắt buộc có channel display name hợp lệ trước khi publish.
- Pipeline versions: `live-v35`, `non-live-v13`.


## 2026-09-29 — Checkpoint kiến trúc hiện tại

- Backup cố định: `backup-2026-09-29-0137-stable` tại commit `15bc1ac91bd57e71aef6bffc9305968902413d62`.
- Ghi tài liệu đầy đủ tại `docs/PROJECT_CHECKPOINT_2026-09-29.md`.
- Chốt hướng: server build package; client sync bằng hash + IndexedDB; một Rail media core cho 1 cột/PiP/2 cột; Piped ở backend; package là canonical card data; search local trước/global sau; source selected/blocked theo scope; deep-link metadata tách khỏi stream; download một nguồn GenDownload.
- Đồng bộ source runtime `yt1988 v32` và `yt1988-getlink v2` ngược vào repo để giảm drift giữa Supabase và GitHub.
- Ghi nhận rủi ro cần xử lý sau: `index.html` lớn, probe function Supabase còn dư, Piped public không ổn định, PIN quản trị nguồn đang nằm trong frontend.
