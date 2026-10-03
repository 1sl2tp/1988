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


## 2026-09-29 — Live lấy YouTube regional làm nguồn chính

- Đổi pipeline Live từ keyword-first sang YouTube-reference-first.
- Nguồn 1: `yt1988?action=trending&region=VN` để tham chiếu các live mà YouTube/Piped regional VN đang đẩy lên.
- Nguồn 2: kênh đã chọn, kiểm tra live riêng theo channel.
- Nguồn 3: keyword chỉ bổ sung các nhóm như ca nhạc, bolero, radio, thể thao, bóng đá, thời sự, tin tức, game, sự kiện, 24/7.
- Vẫn giữ blocked source, blacklist keyword, lọc tiếng Việt và dedupe sau khi gộp.
- Test production: package Live tăng từ 7 lên 20 video ngay ở refresh đầu tiên; refresh OK.
- Runtime: `yt1988-refresh v64`, `LIVE_PIPELINE_VERSION=live-v42`.

## 2026-10-03 — Khóa quy tắc bảo trì bắt buộc và đồng bộ Google Sheet

- Branch nguồn: `main`.
- Base commit trước thay đổi: `5cdb4d4b8e7863ea8dbd889b6c4a6d029cc7a5d7`.
- Commit tạo quy tắc chi tiết: `d7f9648ced78df6068a3122bd59438554a92abb6`.
- Commit gắn cảnh báo bắt buộc vào README gốc: `251f9ba7fc31b3c4e163f10d15b5fd16b63df943`.
- Tạo `README_MAINTENANCE.md` làm quy tắc read-before-write cho toàn bộ dự án 1988.
- Trước mỗi repair/deploy phải đọc quy tắc, xác định branch/base commit/source of truth/rollback.
- Sau mỗi repair/deploy bắt buộc cập nhật cả `NHAT_KY.md` và Google Sheet **1988 - Vận hành kết nối bảo trì** theo branch/commit thực tế.
- Nếu thay đổi kiến trúc/UI/data/kết nối phải cập nhật thêm tab chuyên môn tương ứng trong Sheet.
- Chỉ được coi là hoàn tất khi commit + test/workflow + deploy + production verify + nhật ký repo + nhật ký Sheet đều đủ.
- Không ghi secret/token/cookie/password vào tài liệu vận hành.

## 2026-10-03 — Startup video-first + preload LIVE TikTok/YouTube

- Branch nguồn: `main`.
- Base commit: `3b83281e7bb91d8cc245a8315726e06224e6bf26`.
- Commits chính:
  - `ce015076057e14fdcf50bb7b8999d1958d31543c` — startup video-first và preload LIVE.
  - `d0bd0760758cb52f39604ae21d5d3045201cc381` — sửa khóa nhận diện kênh cho one-video-per-channel.
  - `a06a757b2df138c8ca8befb89af130f98c372db1` — cập nhật integration contract.
  - `09ef5f162f5b8c5658db22af54d6f2f0d5a8226d` — trigger validation với contract mới.
- Khi mở app, landing scope cố định là `latest`; lần paint đầu chỉ giữ 1 video mới nhất cho mỗi kênh/source.
- TikTok video feed cũng chỉ lấy 1 video mới nhất/kênh.
- Sau first paint mới preload song song: TikTok library, TikTok LIVE snapshot và YouTube LIVE snapshot.
- Preload không chạy YouTube live scan nặng và không chặn render home.
- Test media core/integration/TikTok production contract: PASS trong run `37110432534`.
- Production deploy: **CHƯA HOÀN TẤT** — GitHub Pages hiện `has_pages=false`; `Configure Pages` fail do `Resource not accessible by integration`.
- Rollback logic: quay về `3b83281e7bb91d8cc245a8315726e06224e6bf26`.

## 2026-10-03 — Toàn bộ GitHub 1sl2tp chuyển Private + Cloudflare site standby

- GitHub account/repositories kiểm tra: `taphoaxyz`, `getlink`, `chat`, `1988`, `infrastructure` đều đang `private`.
- Repo `1sl2tp/1988` hiện `visibility=private`, `has_pages=false`; GitHub Pages không còn là host đáng tin cậy cho production khi repo private.
- Tạo static Worker riêng `1988-site` để chuẩn bị tách hosting khỏi GitHub Pages.
- Commits:
  - `f807637c2a31cf10be9348099fda56452f31d3b9` — static Worker entry.
  - `b816fdc3976995a952f7d6888d931dfa38cd0792` — Cloudflare site config.
  - `f6d2be9181dd961a8abfe6ebd8881888932b5e70` — GitHub Actions deploy Cloudflare site.
  - `2cabcc278479d9ae11fa3e9e1d73f740fef90098` — bỏ route custom domain khỏi config vì token hiện tại không sở hữu zone `taphoa.xyz`.
- Cloudflare workflow run `37110948291`: PASS.
- Worker standby: `https://1988-site.taphoa-4ab8161d.workers.dev`.
- Việc nối `yt.taphoa.xyz` sang Worker mới **chưa hoàn tất** vì zone `taphoa.xyz` thuộc Cloudflare account/token khác.
- Không thay đổi DB hoặc dữ liệu người dùng.
- Rollback source: revert các commit Cloudflare site nếu không dùng.

## 2026-10-03 — Khôi phục host frontend sau khi GitHub Private

- GitHub source vẫn giữ `private`.
- DNS công khai xác nhận:
  - nameserver: `ns1.matbao.com`, `ns2.matbao.com`;
  - `yt.taphoa.xyz` hiện vẫn CNAME về GitHub Pages cũ.
- Tạo Render Static Site mới:
  - service: `1988-site`;
  - service id: `srv-db0c716gekts7392dut0`;
  - URL: `https://one988-site.onrender.com`;
  - source: private repo `1sl2tp/1988`, branch `main`;
  - chỉ publish frontend production: index/manifest/sw/icons/src/sources.
- Deploy `dep-db0c71egekts7392dvl0`: `live`.
- Custom domain `yt.taphoa.xyz` chưa chuyển vì DNS đang do Mắt Bão quản lý và connector hiện không có quyền chỉnh Mắt Bão.
- Bước còn lại: add `yt.taphoa.xyz` vào Render Custom Domains; đổi CNAME `yt` tại Mắt Bão sang `one988-site.onrender.com`; verify TLS.
- Không thay đổi database hoặc API runtime.

## 2026-10-03 — Khôi phục GitHub Pages cho yt.taphoa.xyz

- Branch nguồn: `main`.
- Nguyên nhân: sau khi repo được bật Public/Pages lại, workflow riêng `Deploy 1988 Player` vẫn thiếu `environment: github-pages`, nên `actions/deploy-pages@v4` báo `Missing environment` và không tạo deployment.
- Commit sửa: `f4b84c57c23b059f1a7acf8fa78dd16ec3ecc469`.
- Sửa `.github/workflows/pages.yml`:
  - thêm environment `github-pages`;
  - dùng output `steps.deployment.outputs.page_url`.
- Workflow `Deploy 1988 Player` run `37112089705`: SUCCESS.
- Probe ngoài production sau deploy:
  - HTTPS `https://yt.taphoa.xyz/` trả `HTTP/2 200`;
  - title trả về: `1988`;
  - body chứa `const STARTUP_SCOPE="latest"` => đúng bản video-first mới.
- DNS hiện resolve qua GitHub Pages và site đang phục vụ bản production mới.
- Không thay đổi database/API runtime.

## 2026-10-03 — Đồng bộ lại tài liệu vận hành sau khi GitHub Pages phục hồi

- Branch nguồn: `main`.
- Production hiện tại:
  - frontend: GitHub Pages;
  - custom domain: `https://yt.taphoa.xyz/`;
  - DNS: Mắt Bão → GitHub Pages;
  - TikTok realtime/VOD: Cloudflare Worker;
  - TikTok library/metadata: Render;
  - data/state/package: Supabase.
- Google Sheet **1988 - Vận hành kết nối bảo trì** đã sửa các tab:
  - `01 Ket noi`: bỏ mô tả Cloudflare/Render Static Site là host production; ghi GitHub Pages + DNS hiện tại.
  - `02 Web va the`: bỏ link demo TikTok đã xóa; cập nhật startup production đã PASS.
  - `05 TikTok`: thay VOD demo rotation bằng VOD resolver pool production trong Worker.
  - `07 Sua Deploy`: bỏ TikTok demo; ghi đúng pipeline GitHub Pages với `environment: github-pages`.
  - `Nhat ky sua chua`: thêm dòng đồng bộ tài liệu.
- Không thay đổi runtime/data trong lần đồng bộ tài liệu này.

