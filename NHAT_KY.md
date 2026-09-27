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
