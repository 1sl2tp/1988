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

## 2026-10-03 — Fast Repair protocol + unified channel identity toàn web

- Branch: `main`.
- Base production trước thay đổi: `14bf92577768f311cf2b55331668de8511ac73ca`.
- Commit code/rules chính: `8a408bf34d39f487dfbd7cfb1d8fc5c7415841fd`.
- Pages run: `37114766999` — SUCCESS.
- Không có runtime error sau deploy.
- Chuẩn channel identity:
  - YouTube canonical: `yt1988_channel_directory`;
  - TikTok canonical: `yt1988_tiktok_channels`;
  - API chung: `yt1988-state.state.channelLibrary`;
  - MAIN và `sources/` đều ưu tiên cùng channelLibrary; `customSources` chỉ fallback.
- Contract chung gồm name/avatar/handle/profile/verification/stats/status và phân biệt `verification.known=false` với `verified=false`.
- Probe production YouTube xác nhận POPS Kids trả subscriber/views/videoCount/avatar/handle/verified đúng.
- TikTok verified profile cũng trả cùng contract.
- Fast Repair rule được khóa vào `README_MAINTENANCE.md`, `README.md`, `CHECKPOINT.md`:
  - một lỗi → một owner → một patch → một deploy;
  - production hỏng do regression → rollback last-known-good trước;
  - không refactor/dọn dẹp trong incident;
  - dùng probe nhỏ trước, không scan toàn hệ thống;
  - schema additive/backward-compatible trước;
  - gom thay đổi thành một commit code chính;
  - docs-only sau verify không kích production deploy;
  - Pages dùng `cancel-in-progress: true`.
- Workflow Cloudflare static frontend đã chuyển sang manual-only, không còn tự deploy cùng Pages.
- Known residual: Render Static Site thử nghiệm `1988-site` vẫn đang auto-deploy theo main nhưng **không phải production**. Connector Render hiện không có thao tác đổi autoDeploy/xóa service; cần tắt/xóa ở dashboard để bỏ build thừa.
- Rollback frontend: `14bf92577768f311cf2b55331668de8511ac73ca`.

## 2026-10-03 — Chốt Pages deploy owner và khôi phục workflow sau thử nghiệm 403

- Commit thử đổi Pages source bằng Actions token: `bb2f8c5d93dc45f2b2b5d26336a0ce5a159d44fe`.
- Kết quả: frontend contract tests PASS nhưng bước đổi Pages source bằng REST API bị `403`; deploy custom bị dừng trước artifact/deploy.
- Production cũ vẫn phục vụ bình thường; GitHub native Pages run của cùng commit vẫn SUCCESS.
- Commit khôi phục workflow: `71b020a4f54f6e36325849e47bb535d0d341843b`.
- Deploy 1988 Player run `37115107607`: SUCCESS.
- Quy tắc mới:
  - không dùng workflow token để cố đổi Pages source;
  - nếu docs-only vẫn sinh `pages build and deployment` event=`dynamic`, đổi bằng UI: Settings → Pages → Build and deployment → Source = GitHub Actions;
  - custom Pages workflow đã `cancel-in-progress: true`;
  - Cloudflare static frontend là manual-only;
  - Render Static Site `1988-site` vẫn là standby không production và còn autoDeploy, cần tắt/xóa ở Render dashboard để hết build thừa.

## 2026-10-03 — Chuẩn hóa custom domain guard cho chat / yt / app

- Mục tiêu: phát hiện sớm trường hợp DNS đúng nhưng GitHub Pages chưa bind custom domain, tránh 404 âm thầm.
- Probe trước sửa:
  - `chat.taphoa.xyz`: HTTP 404 `Site not found · GitHub Pages`;
  - `yt.taphoa.xyz`: HTTP 200;
  - `app.taphoa.xyz`: HTTP 200.
- DNS cả ba hiện CNAME tới `1s12tp.github.io.`.
- Chat:
  - tạo `.github/workflows/pages.yml` để build `index.source.html → index.html`, chạy `verify_current.py`, upload artifact và deploy Pages;
  - bổ sung `pytest` cho verify dependency;
  - sau deploy `chat.taphoa.xyz` trả HTTP 200, title `TAPHOA Chat`.
- Cả ba repo đã thêm domain guard sau deploy:
  - đọc domain contract từ file `CNAME`;
  - so khớp với `steps.deployment.outputs.page_url`;
  - kiểm tra DNS là `*.github.io`;
  - retry HTTPS và yêu cầu HTTP 200.
- 1988 commit: `db572ef878bf65d50fc492a28b1e997eb6791f83`.
- Chat commits: `4a98b0dfc0dea843cb926f59d41dc725f2eed5bb`, `82d322b6d777e3e7f90fcecb72c8ff56f5213b52`, `2a5d3a27ef038efeca7e05b738673e43b9ab567c`.
- Taphoaxyz commit: `fafa6a2f5b5e57d7525fa81017198b26732307e6`.
- Domain verification runs:
  - Chat Pages run `37115789044`: custom domain check PASS;
  - 1988 Pages run `37115792404`: PASS;
  - TAPHOA publish run `37115795795`: PASS.
- GitHub limitation: với custom GitHub Actions workflow, file `CNAME` không tự thay đổi Pages Custom domain setting; domain setting vẫn phải tồn tại trong Settings → Pages. Guard mới sẽ fail rõ nếu setting và CNAME lệch.
- Không thay đổi DB/API/data.



## 2026-10-03 — Sửa LIVE gắn sai channel + tạo handoff bắt buộc giữa các chat

- Branch: `main`.
- Owner incident: **Supabase LIVE package builder** (`yt1988-refresh`).
- Triệu chứng: video LIVE `t7goDOQdn9U` của **ChimSeDiNang AOE** bị package gắn nhầm thành **Hillsong Worship**.
- Bằng chứng:
  - Cloudflare snapshot có cùng một `videoId=t7goDOQdn9U` nhưng bị hai channel claim:
    - sai: `UCTSkEZ84nY5gBjiXekhkgmQ` / Hillsong Worship;
    - đúng: `UCXH0kpsCwpoh94iQfGEokOA` / ChimSeDiNang AOE.
  - exact video-id search trả đúng `UCXH0kpsCwpoh94iQfGEokOA`, title Thiên Khôi CUP và 9659 viewers tại lần probe.
- Patch code:
  - commit `7bd7e3eddcc4ec6991c5fb8600d3b752a85a2b56`;
  - `exactSearchVideoMeta()` trả thêm `sourceId` + title;
  - trước khi đóng package LIVE, nếu một videoId bị nhiều channelId claim thì exact-search videoId một lần và chỉ giữ owner đúng.
- Deploy:
  - Supabase Edge Function `yt1988-refresh v21` ACTIVE.
- Production verify:
  - package LIVE hash `11dikh9`;
  - row `t7goDOQdn9U` hiện là:
    - sourceId `UCXH0kpsCwpoh94iQfGEokOA`;
    - sourceName `ChimSeDiNang AOE`;
    - title `Thiên Khôi CUP | 4v4 Random | SPartacus Gaming vs Thiên Khôi | Ngày 03/10/2026`;
    - viewers `9659`.
- Data impact: không xóa canonical data; chỉ sửa identity trước khi publish package LIVE.
- Rollback code: revert `7bd7e3e` và redeploy phiên bản Edge Function trước đó nếu cần.
- Handoff/rule:
  - tạo `CURRENT_WORK.md` commit `d95b4137a85f2607a5bfddc5d001308f91c35237`;
  - `README_MAINTENANCE.md` bắt buộc đọc `CURRENT_WORK.md` trước mọi repair, commit `08871ca071a0c6490c9efabb1ca4e7b8ae0cc48c`;
  - README gốc trỏ vào CURRENT_WORK trước mọi sửa, commit `448f77fc916957ea4657e358c12ea824586abe41`.
- Quy tắc mới: **trước khi sửa phải đọc rule + CURRENT_WORK; sau khi sửa phải cập nhật CURRENT_WORK + NHAT_KY để chat sau tiếp tục đúng trạng thái.**


## 2026-10-03 — Chuyển LIVE sang demand-only, tắt discovery khi không có người dùng

- Branch: `main`.
- Base trước sửa: `d6e465d991ae442c7a1c61103c92cf8ee4b6558d`.
- Mục tiêu: không ai mở web/LIVE thì không discovery; mở đúng LIVE mới đánh thức scan; hidden/đổi tab thì dừng.
- Owner:
  - frontend orchestration `index.html`;
  - Cloudflare schedules cho YouTube/TikTok LIVE.
- Bằng chứng trước sửa:
  - `runYoutubeLiveCycle()` tồn tại nhưng chưa được gọi từ luồng mở LIVE;
  - startup còn preload/wake LIVE và prefetch package chưa mở;
  - infrastructure deploy config có YouTube cron `*/2 * * * *`, TikTok cron `* * * * *`.
- Commits:
  - `0600797cf6fe435478199b9589a5cc1fa77502af` — LIVE scan/wake chỉ khi visible, bỏ startup LIVE preload, chỉ prefetch active scope.
  - `e6c38717c84654162b527a6ab7978454aae5fe18` — fallback TikTok demand-only cho runtime cũ + one-shot xóa Cloudflare schedules.
  - infrastructure `70fd3ee4cb6beeaf8f5dc5ff45c38bca8352b441` — canonical demand-only Workers, `crons=[]`, TikTok logical batch scan.
- Deploy/verify:
  - Pages `37126176517`: SUCCESS.
  - Pages latest `37126405789`: SUCCESS, custom-domain check PASS.
  - One-shot disable cron `37126405820`: SUCCESS; Cloudflare API xác nhận cả hai LIVE Workers có 0 schedules.
  - Supabase production query `cron.job`: không còn `yt1988-refresh-every-minute`; không có package/LIVE discovery cron.
- Runtime:
  - YouTube: visible LIVE → edge scan → Supabase package → hash → UI; UI không dùng edge snapshot làm feed.
  - TikTok: visible LIVE → thử `/tiktok/live-scan`; runtime cũ 404 thì demand `/sweep`; không có LIVE visible thì không gọi.
  - startup/latest không preload/wake LIVE; unopened scopes không network-prefetch.
- Known residual:
  - infrastructure deploy runs `37126064335` / `37126064354` fail ở bước Verify Cloudflare token trước deploy;
  - canonical TikTok logical full-cycle source chưa live qua infrastructure; production dùng demand `/sweep` compatibility cho tới khi credential được sửa.
- Data impact: không xóa canonical data/package; chỉ thay orchestration/scheduler.
- Rollback frontend: `d6e465d991ae442c7a1c61103c92cf8ee4b6558d`.
- Không rollback bằng cách bật lại cron LIVE.


## 2026-10-03 — Khóa YouTube LIVE UI thành package-only tuyệt đối

- Base: `d3c08aeab7fb757d55dec19330b4ca55e4f87672`.
- Code commit: `9ba971aa6a08d2ae2342a817fd0c4361181c9693`.
- Owner: frontend `index.html`.
- Bằng chứng:
  - package LIVE hash `ld9wih`, 27 item;
  - Lệ Quyên ở vị trí 14;
  - ChimSeDiNang AOE ở vị trí 27;
  - UI chỉ render 18 card nên Chim Sẻ bị cắt dù package đúng.
- Patch:
  - LIVE render toàn bộ package;
  - YouTube package identity dùng nguyên package fields;
  - edge chỉ discovery/wake, không paint/hydrate YouTube card;
  - YouTube edge snapshot không lưu/khôi phục vào client feed;
  - PWA cache `v71`.
- Test: frontend production contracts PASS.
- Deploy: run `37127795634` SUCCESS; custom-domain verify PASS.
- Data impact: không đổi Supabase/Cloudflare data, không sửa package builder.
- Rollback: `d3c08aeab7fb757d55dec19330b4ca55e4f87672`.
- Rule: package đúng mà UI thiếu → chỉ kiểm tra hash/cache/swap; không sửa discovery/backend identity.


## 2026-10-03 — Thêm NO-WAIT workflow bắt buộc

- Mục tiêu: không để repair/deploy/probe bị đứng chờ thụ động hoặc tự tạo giới hạn do retry/polling/job trùng.
- Tạo `README_NO_WAIT_WORKFLOW.md`.
- Quy tắc chính:
  - job/lease/deploy đang chạy → không tạo job thứ hai;
  - còn việc độc lập → làm tiếp ngay, không trả lời “đợi”;
  - cùng một cơ chế fail 2 lần → dừng retry mù, đổi owner/runtime hoặc rollback;
  - quota/429/403/CAPTCHA → dừng spam request, dùng batch/cache/fallback và đúng runtime owner;
  - không full-scan để chữa một lỗi mẫu;
  - timeout hữu hạn + last-known-good;
  - không hỏi lại nếu yêu cầu đã đủ rõ, patch nhỏ, rollback được và không destructive;
  - hard limit là constraint thiết kế, không được né bằng fan-out/job/account song song.
- `CURRENT_WORK.md` đã thêm file này vào trình tự đọc bắt buộc.
- `README_MAINTENANCE.md` đã thêm mục NO-WAIT và bắt buộc đọc trước sửa.
- `README_RESOURCE_GUARDRAILS.md` đã liên kết retry/lease với NO-WAIT rule.
- Commits:
  - `5c9ae9e7e5e1a7600c670533e927bffd917c1ab8` — tạo rule;
  - `823eafce0d2298d6c1b127f919631d6be42c369e` — bắt buộc trong handoff;
  - `3ffc8f0c68fcd4fb66f196ffc9d2c38b7c795d6c` — Maintenance;
  - `85a801918d87c3eaefbe2c5d40ca642f0c4a3f3b` — Resource Guardrails.
- Data/runtime impact: docs-only; không đổi production data/package/API.


## 2026-10-03 — Sửa LIVE GH AI Muzick thiếu avatar dù thư viện đã có

- Channel: `UCoOmYgEUQG9Pp_iXgmLzJYg` / GH AI Muzick.
- Bằng chứng trước sửa:
  - `yt1988_channel_directory.thumbnail_url` có dữ liệu;
  - package LIVE row `le-EBatRnpU` có `sourceAvatar=""`.
- Owner: Supabase `yt1988-refresh`; không sửa UI.
- Commits:
  - `51187b81124e469e5f69a41a4ac6f0a97da6f766` — fallback LIVE identity từ canonical channel directory;
  - `53592b41a4a36727b6afbbb079b821f4f7ee5608` — regression test;
  - `ed392856ebcfe96ecdaca3c5082c0109121cd6ba` — cho phép sửa canonical identity trên last-known-good LIVE package.
- Deploy: `yt1988-refresh v26` ACTIVE.
- Production verify:
  - hash LIVE `wx4gj5 → q7qrx8`;
  - item count giữ nguyên 31;
  - videoId/title GH AI Muzick không đổi;
  - `sourceAvatar` đã lấy đúng từ `yt1988_channel_directory`.
- Data impact: chỉ bổ sung package metadata đã có sẵn trong canonical library; không thêm/xóa LIVE.


## 2026-10-03 — Sửa LIVE Báo Tiền Phong title bị rơi thành tên kênh

- videoId: `LI-7QtW-_bs`.
- Trước sửa package ghi `title = Báo Tiền Phong News`.
- Exact `yt1988?action=video_meta&id=LI-7QtW-_bs` trả:
  `🔴Trực Tiếp: Tin tức an ninh trật tự nóng, thời sự Việt Nam mới nhất 24h Tối ngày 3/10`.
- Patch `60e004cfdc07f34dcb60c0b7851de394432116e0`:
  - LIVE title rỗng hoặc bằng sourceName → exact video_meta theo videoId;
  - title khác giữ nguyên;
  - không AI/heuristic/dọn title LIVE.
- Regression test: `bca6596a4925076b3126f8c5af0ec6365ccb0010`.
- Deploy: `yt1988-refresh v27` ACTIVE.
- Production verify:
  - package LIVE hash `23v6p2`;
  - item count 31;
  - `LI-7QtW-_bs` đã có đúng title gốc;
  - UI không thay đổi.


## 2026-10-03 — Sửa LIVE đã hết vẫn còn trong package

- Triệu chứng: Cloudflare checked ~248 nhưng trả `live=0`; Supabase giữ last-known-good 31 LIVE nên UI còn LIVE đã hết.
- Root cause:
  - Cloudflare dùng InnerTube làm cổng duy nhất;
  - Supabase verify lại snapshot bằng InnerTube từ IP bị Google block.
- Patch:
  - infrastructure `a00e27e75aef51079a7927f9ade0ab9e922a6e07`: watch-page `ytInitialPlayerResponse` là primary verifier; owner phải khớp channelId; InnerTube chỉ fallback.
  - 1988 `046d5bf68b58df79406e2bb571027a5290ed1b15`: snapshot edge fresh đã verified thì package builder không InnerTube verify lại.
- Deploy:
  - Cloudflare run `37132871574` SUCCESS; schedule count = 0.
  - `yt1988-refresh v28` ACTIVE.
- Production verify:
  - edge version 130: checked 249, live 18;
  - package LIVE `23v6p2 / 31 → 1d9yemd / 18`;
  - refresh last_ok=true, pending_scopes=[].
- UI không đổi; chỉ nhận hash/package mới.
- Rule: realtime LIVE/owner ở Cloudflare; Supabase filter/enrich/package; UI chỉ đọc.


## 2026-10-03 — Đồng bộ Chưa chọn / Đã chọn / Đã chặn và LIVE kế thừa

- Mẫu: Dân Ca Lofi `UC7NBAf7ARIWZKB0Tr6PbD7Q`.
- Bằng chứng trước sửa: DB đã `scope=live,status=selected` nhưng main UI search vẫn hiện `Chọn vào nguồn…`.
- Contract:
  - LIVE = union selected mọi scope − union blocked mọi scope.
  - inherited state phải hiện rõ, không toggle giả.
- 1988 code:
  - `729641199ea1cc5c9e893037cca0ac0d4f5752b1` — effective status + picker + /sources union + state targeted hook;
  - `f4168c22138ce44d6f1c9b141fb7d0e0ca5bd265` — deploy mirror/test workflow;
  - `1e84a3e`, `5859505`, `ec5ac68` — nhãn trạng thái + PWA v73.
- Infrastructure:
  - `902e4e89022fcccee0ca39e4fc8148ef288b2361` — `/youtube/live-source-sync`.
- Runtime:
  - `yt1988-state v9` ACTIVE.
  - Cloudflare run `37134001622`: Worker deploy + zero schedules PASS; post-deploy full scan check fail, không ảnh hưởng targeted endpoint.
- Verify:
  - targeted sync Dân Ca Lofi → HTTP 200, outcome=offline, changed=false, không full scan;
  - idempotent set_source selected request 565 → HTTP 200;
  - canonical row vẫn selected.
- Resource impact:
  - source change chỉ check 1 channel;
  - không tăng cron/polling;
  - không preload LIVE package khi LIVE không visible.


## 2026-10-03 — Giảm Egress yt1988-state bằng manifest/lite/library

- Baseline ảnh Free plan: Egress 1.49/5 GB, DB 48/500 MB, Storage 0.06/1 GB, Log Ingestion 0.19/1 GB, Log Query 17.9/100 GB.
- Điều tra 6 giờ trước sửa:
  - `yt1988-state` 1,545 requests;
  - khoảng 228.4 MB response;
  - Cloudflare LIVE khoảng 134 MB; browser khoảng 90 MB.
- Root cause: full state chứa source rows + 1,231 YouTube channel library + 173 TikTok profiles và metadata lặp.
- Kiến trúc mới:
  - `view=manifest` hash-only;
  - `view=lite` source membership/keyword/tab state only;
  - `view=library` full channel library chỉ cho `/sources/`.
- MAIN: manifest → hash compare → lite chỉ khi stateHash đổi.
- Cloudflare LIVE: chỉ `?view=lite`.
- /sources/: IndexedDB `yt1988-source-cache-v1`; manifest check; library chỉ tải khi `libraryHash` đổi.
- `libraryHash` chỉ theo channel directory + TikTok profile, không đổi do chọn/chặn.
- Production measurements:
  - manifest raw 236 B;
  - lite raw 24,723 B, giảm từ 256,089 B (~90%);
  - Cloudflare targeted sync nhận lite khoảng 16,275 B transmitted;
  - library raw ~1.40 MB nhưng demand-only/versioned.
- Runtime:
  - `yt1988-state v11` ACTIVE;
  - Cloudflare Worker state-lite deploy step PASS + zero schedules PASS in run `37135851230`;
  - frontend deploy `37136133606` SUCCESS;
  - PWA v74; source manager JS v22.
- Targeted Dân Ca Lofi sync vẫn HTTP 200; không full scan.
- Regression contracts cập nhật để MAIN/Cloudflare không quay lại full-state.


## 2026-10-03 — Khóa kiến trúc host/data/action và giảm invocation thừa

- Contract production mới:
  `GitHub = CODE`,
  `Supabase = TRUTH + CURRENT PACKAGE`,
  `Cloudflare = REALTIME + EDGE CACHE`,
  `Render = HEAVY RESOLVER`,
  `Browser = LOCAL CACHE + RENDER`.
- Tạo `README_HOST_ARCHITECTURE.md`; README/Maintenance/Resource Guardrails/CURRENT_WORK đã liên kết contract này.
- GitHub:
  - `src/channel-library.js` chứa 744 channelId nhưng chỉ là legacy generated seed;
  - production `index.html` và `/sources/` không load file này;
  - canonical channel identity vẫn ở Supabase.
- Supabase `yt1988 v6`:
  - bỏ hidden fan-out `yt1988-video-meta?resolve=1` từ search/channel result;
  - chỉ reuse aspect metadata đã cache;
  - video thiếu metadata chỉ resolve khi user thật sự mở item.
- MAIN package demand:
  - latest wake tối đa 5 phút/lần;
  - week 30 phút/lần;
  - content/hashtag 15 phút/lần;
  - focus/visibility check manifest nhưng không reset cadence.
- LIVE single-owner wake:
  - Cloudflare scan là realtime owner;
  - snapshot changed mới wake LIVE package;
  - recurring browser scan/focus chỉ chờ hash;
  - tab-open được một catch-up wake;
  - source edit dùng targeted Cloudflare sync đúng một channel.
- `yt1988-state v12`:
  - non-LIVE source edit refresh đúng scope;
  - LIVE source edit không pre-refresh stale package;
  - targeted edge sync là owner duy nhất; snapshot đổi mới wake LIVE.
- Production verify:
  - search `bao tien phong` HTTP 200 và không phát sinh server-side video-meta warm job sau request;
  - source edit request 577 HTTP 200;
  - Cloudflare đọc `state-lite` khoảng 16 KB;
  - không có `yt1988-refresh` trực tiếp từ source edit trong cửa sổ verify;
  - Supabase cron chỉ còn Render keepalive + retention cleanup, không có LIVE/package discovery cron;
  - frontend run `37137967816` SUCCESS toàn bộ: contracts, build, Pages deploy, custom-domain verify.
- PWA: `v76`.
- Resource conclusion:
  - database hiện không phải bottleneck;
  - ưu tiên kiểm soát response bytes, Edge Function invocations và log volume;
  - direct user action không được tạo background work theo số card.


## 2026-10-03 — Khóa TikTok LIVE demand-only ở source + deploy

- Base trước sửa: `49892fd1bd086ae36d3f67a7e84ea44d067358d6`.
- Owner: Cloudflare TikTok LIVE Worker/deploy; không sửa UI/Supabase/Render data.
- Root cause:
  - production rule đã yêu cầu LIVE schedule = 0;
  - `cloudflare/tiktok-live-state/wrangler.toml` vẫn có cron `* * * * *`;
  - Worker vẫn có `scheduled()`;
  - một `wrangler deploy` sau này có thể bật lại cron đã xóa ở runtime.
- Code commit: `0ebbc3e6725eead7510fb5fa7e1d5db34efd35d6`.
- Patch:
  - `wrangler.toml → crons = []`;
  - bỏ `scheduled()`;
  - thêm `demand-only-contract.test.cjs`;
  - workflow deploy chạy demand-only contract;
  - sau deploy PUT Cloudflare schedules về `[]` và GET verify zero schedules;
  - cập nhật TikTok edge README: `/sweep` chỉ chạy theo demand khi TikTok LIVE visible; fingerprint tối đa 6 channel mỗi demand sweep, không còn định nghĩa “mỗi phút do cron”.
- Test/deploy:
  - GitHub Actions run `37138771030` SUCCESS;
  - Test edge contracts PASS;
  - Deploy Worker PASS;
  - Enforce zero LIVE schedules PASS.
- Production verify:
  - Cloudflare schedules API trong deploy xác nhận schedule count = 0;
  - direct probe tới workers.dev từ môi trường ChatGPT bị DNS block, không phải bằng chứng production fail.
- Data/resource impact:
  - không đổi DB/package/canonical data;
  - giảm invocation khi không có người mở LIVE;
  - không tạo scheduler/poller mới.
- Rollback code: `49892fd1bd086ae36d3f67a7e84ea44d067358d6`; production scheduler rule vẫn phải giữ zero schedules.


## 2026-10-04 — Chuẩn hóa channel identity + dọn duplicate Supabase

- Base code: `52bf19190c7b8898c4c36d91680a9c5dd9014a41`.
- Code-first commit: `219c16b5760c06b1776fb7c65d83d2d779c9c666`.
- Audit phát hiện identity bị copy ở source-state/cache/user-state và TikTok dùng handle làm PK dù 173/173 user_id + sec_uid đều unique.
- Runtime trước DDL:
  - social collector image build run `37139967878` SUCCESS;
  - `yt1988-state v13` ACTIVE;
  - `yt1988-refresh v29` ACTIVE;
  - Render deploy `dep-db0jihmgekts73a0231g` LIVE, digest `d397dd7…`.
- Supabase migrations:
  - `20261003172108 normalize_youtube_channel_identity`;
  - `20261003172252 normalize_tiktok_channel_identity`;
  - `20261003172431 harden_normalized_identity_access`.
  - `20261003173243 strip_youtube_channel_cache_identity_json`.
- YouTube:
  - source_state/cache identity mirrors removed;
  - 7 cache-only IDs backfilled into directory before FK;
  - source_state + cache FK to directory;
  - 592 legacy avatars + 592 customSources cleared;
  - user_state JSON ~168 KB → ~23.7 KB.
- TikTok:
  - canonical channel PK moved handle → stable UUID `id`;
  - handle remains unique routing alias; user_id/sec_uid unique;
  - LIVE/video-channel/video rows all bind `channel_id` FK;
  - 4 stale orphan LIVE rows removed;
  - `live.selected`, `video_channels.sec_uid/videos`, canonical `live_*`, empty `live_selected` table removed;
  - 105 expired signed MP4 URLs cleared.
- Verify:
  - canonical channels 173 / distinct IDs 173 / user_id 173 / sec_uid 173;
  - LIVE rows 173, null channel_id 0;
  - video-channel rows 173, null channel_id 0;
  - videos 1,766, null channel_id 0;
  - compatibility upsert test PASS + ROLLBACK.
- Follow-up audit phát hiện identity còn ẩn trong `yt1988_channel_cache.items` JSON dù cột top-level đã sạch.
- Commit `d766cfbeda9c6d960f68950da0b18d302bb4d314`: writer strip channel name/avatar/profile ở cache boundary; `yt1988-refresh v30` ACTIVE.
- Sau migration: 3,965 cache items có 0 identity/profile keys; vẫn giữ 3,965 `channelId` và 3,964 `_sourceId`; package 820 items vẫn có identity snapshot đúng thiết kế.
- Cache items payload hiện khoảng 791 KB; package snapshot không bị strip.
- Package name/avatar snapshots intentionally retained as read products; never canonical.
- Advisor: new FK index issue fixed; source-state RPCs changed to SECURITY INVOKER + service_role-only EXECUTE.
- Rollback: code `219c16b5` is schema-compatible target. Destructive column cleanup should be reversed only via explicit restore migration, not by reverting frontend code alone.


## 2026-10-04 — Chặn legacy browser tải full source-state

- Audit 97 phút: 124 browser/PWA request gọi `yt1988-state` không query view, trả ~6.82 MB; 100% caller là browser.
- Root cause: public GET mặc định `full` để tương thích client cũ.
- Commit `745d74898bdaad2f5623f5f432a0afb7884f4d8c`:
  - no-view / `view=full` / unknown view → compact `lite`;
  - chỉ explicit `manifest` và `library` giữ route riêng.
- `yt1988-state v14` ACTIVE.
- PWA cache: v77 → v78 để kéo client cũ sang shell mới nhanh hơn.
- Contract check trong deploy phát hiện lỗi thật khác:
  - `yt1988-refresh` còn query source-state `name,thumbnail_url,subscribers`;
  - suggestion writer còn ghi identity vào source-state dù schema đã chuẩn hóa.
- Commit `bb5118bc7dab22b74e90fd6358fb70273a412529`:
  - source-state read chỉ ID/state;
  - suggestion identity upsert canonical directory trước;
  - source-state suggestion row chỉ ID/state.
- `yt1988-refresh v31` ACTIVE.
- Production probes:
  - pg_net 585 = no-view → HTTP 200, 24,781 bytes, `view=lite`;
  - pg_net 586 = `?view=lite` → HTTP 200, 24,781 bytes, `view=lite`;
  - no-view và lite có cùng shape/size, xác nhận default/full fallback không còn đi full-library path.
- Frontend contract + Pages/custom-domain deploy run `37141879904`: SUCCESS.
- PWA cache production: v78.
- Rule mới: backward compatibility không được phép đồng nghĩa với monolithic full payload; client cũ chỉ nhận compact lite.


## 2026-10-04 — Focused viewer — hợp nhất mobile / desktop / TikTok

- Base: `909d7eaf68421bdc72f1f9badc9cbd93aa63acab`.
- Owner: Browser/UI only; không đổi server/data/polling.
- Mục tiêu: bỏ việc người dùng phải nghĩ về “1 cột / 2 cột / inline / PiP”; Watch chỉ còn một viewer tập trung.
- YouTube:
  - Browse vẫn responsive;
  - Watch mobile = viewer + queue dưới;
  - Watch desktop = viewer + queue phải;
  - current video không lặp trong queue;
  - scroll/rerender không chuyển player sang thumbnail/PiP.
- TikTok:
  - profile/browse vẫn có account navigation;
  - Watch bỏ account rail;
  - desktop/mobile cùng viewer + queue contract;
  - không PiP.
- Commits chính:
  - `0d8dc4cddce80beaffa35af6833ae5cf0d5e1872`;
  - `8d46e7c3c6d3fe52712944668aa9d4e692948c1f`;
  - `369227f1b51f197b37c254fb594af2ee1699265e`;
  - `f7261d8de0cd0bd1cfbb1cf1d3075153c6b17760`;
  - regression contracts `03343fcc`, `3c9960a4`, `0f3e7630`;
  - final PWA `bc0e4be747915b0539eafe6079fa0ddecdd0b3a4` = v81.
- Verify:
  - Deploy 1988 Player run `37142665800`: SUCCESS;
  - frontend contracts, artifact build, Pages deploy, custom-domain verify đều PASS.
- Compatibility note: helper PiP/inline cũ vẫn còn dormant để giảm regression surface; primary path không còn caller và contract test khóa không cho re-activate.
- Resource impact: không thêm API/polling/job; UI-only.


## 2026-10-04 — Mobile viewer geometry — header overlap + portrait bottom radius

- Base: `e1bc04acc973069b7477134af1036c44f18cb975`.
- Ảnh production:
  - landscape bị thiếu phần trên;
  - portrait đúng tỷ lệ nhưng đáy còn bo.
- Root cause landscape: Focused Viewer v1 set mobile `main padding:0` trong khi header/subnav fixed; stage 16:9 bị header phủ phần đầu.
- Không phải Rail crop; `--rail-black` giữ nguyên.
- Patch:
  - `2f6b6b7336ce08f63a5c0cd02a30d221b7c47958`: reserve `--top-boundary`; portrait bottom radius = 0.
  - `f59a5983114d405aa30095f37d17ab49cc9a79af`: regression contract.
  - `d8d05638e1577c9fa5e42f13ccfca066a8826312`: PWA v82.
- Verify: Deploy 1988 Player run `37143236812` SUCCESS; frontend contracts/build/Pages/custom-domain đều PASS.
- Impact: UI/CSS only; không đổi data/network/polling.
- Rollback: `e1bc04acc973069b7477134af1036c44f18cb975`.


## 2026-10-04 — Mid-width viewer gap — 657–999px double top-boundary

- Base: `328643014793ce9cf84196615636fb9d4e32a4ae`.
- Ảnh production:
  - ≤656px đúng;
  - 657–999px có khoảng đen lớn trước video;
  - ≥1000px đúng.
- Root cause: v82 reserve `--top-boundary` cho toàn bộ <1000px, trong khi header chỉ fixed ở ≤656px.
- Patch `e7d4817319c8ca22e78d8e3e4fc9898b3c6e9ce4`:
  - 657–999px padding=0;
  - ≤656px mới reserve measured top-boundary;
  - PWA v83.
- Verify: Deploy 1988 Player run `37143464690` SUCCESS; frontend contracts/build/Pages/custom-domain đều PASS.
- Impact: UI/CSS only; không đổi data/network/polling.
- Rollback: `328643014793ce9cf84196615636fb9d4e32a4ae`.


## 2026-10-04 — Portrait viewer compact — thu nhẹ + bo 4 góc

- Base: `ebfd45193840870b3ef55e3b73031c39b4799d3e`.
- Yêu cầu: portrait viewer thu gọn nhẹ để giống cảm giác YouTube Shorts hơn, vẫn giữ bo góc.
- Patch `1c989c9042ccef94cda1e6597b1b178e435b662a`:
  - portrait one-column stage = `min(calc(100% - 32px),480px)`;
  - căn giữa;
  - stage/player/iframe bo 4 góc;
  - landscape giữ full-width;
  - PWA v84.
- Verify: Deploy 1988 Player run `37143714726` SUCCESS; frontend contracts/build/Pages/custom-domain đều PASS.
- Impact: UI/CSS only; không đổi data/network/polling.
- Rollback: `ebfd45193840870b3ef55e3b73031c39b4799d3e`.


## 2026-10-04 — TikTok YouTube-shell — Profile + Shorts-style Watch

- Base: `d02ed181d0e244b676b923ebf3cf2959acaa77a3`.
- Mục tiêu: đưa TikTok về cùng shell/UX với YouTube, không đổi backend/data.
- Code:
  - `3e964bd5321bb57bff09125fcf73284ce7f43bc6`: banner/profile/tabs/grid + Shorts-style watch/action rail/share.
  - `1e3814b0b2bf3d3ffbaa97569abccce8cabd0dcf`: responsive final + desktop wide sidebar + breakpoint fixed-header; PWA v86.
- Profile:
  - desktop sidebar trái;
  - banner từ thumbnail/video mới nhất hoặc avatar fallback;
  - avatar/name/handle/follower/video/bio;
  - tabs visual;
  - grid video dọc 5 cols desktop / 3 tablet / 2 mobile.
- Watch:
  - portrait viewer;
  - action rail;
  - title/creator/follow;
  - queue loại current video;
  - >=1280 có sidebar trái giống YouTube Shorts.
- Không thêm API/polling/storage/banner data.
- Verify: run `37144284111` SUCCESS, contracts/build/deploy/custom-domain PASS.
- Rollback: `d02ed181d0e244b676b923ebf3cf2959acaa77a3`.


## 2026-10-04 — TikTok Watch navigation + exact ratio + mobile smart entry

- Base: `2ff42dce666e0110cc2169da7bd8e5f34d99e1c7`.
- Yêu cầu:
  - học TikTok web: ↑↓ + wheel/swipe đổi video;
  - giữ ratio thật, không zoom/crop sai;
  - LIVE hiển thị đúng;
  - mobile hẹp vào LIVE hoặc latest video ngay.
- Fix:
  - `dcef5e9190fd021b3432df11f96421cd8f9b9e23`: exact ratio, contain preview, smart sequence, navigation, mobile entry, bỏ LIVE→VOD-cover fallback.
  - `07fbf33f156cd8294f9ad3645dc263349f97e9d0`: profile grid giữ 9:16, PWA v88.
- Sequence: mỗi kênh một item; LIVE playable thay newest VOD của cùng kênh; sau LIVE là newest VOD các kênh còn lại.
- Navigation: ↑↓ button, mouse wheel, ArrowUp/ArrowDown, vertical swipe.
- LIVE imagery: chỉ actual LIVE cover/preview hoặc avatar.
- Verify: run `37144911223` SUCCESS; contracts/build/deploy/custom-domain PASS.
- Không đổi Supabase/Cloudflare/Render API, không thêm polling/cron.
- Rollback: `2ff42dce666e0110cc2169da7bd8e5f34d99e1c7`.


### Follow-up — TikTok mobile smart landing demand cycle v89

- Commit `c3401f112146ea2e9c78664bef30942f29a3ce6e`.
- Lý do: LIVE là demand-only; chỉ đọc `/live-now` khi vào mobile có thể dùng snapshot cũ nếu trước đó chưa ai mở LIVE.
- Mobile ≤656, TikTok visible, không explicit handle:
  - chạy đúng một demand cycle LIVE;
  - refresh snapshot sau scan;
  - chọn LIVE playable đầu tiên;
  - nếu không có LIVE thì newest VOD theo kênh.
- Hidden / đóng web / desktop không kích smart-landing scan.
- Không thêm cron/timer/polling nền.
- PWA v89.
- Deploy run `37145155222` SUCCESS; contracts/build/deploy/custom-domain PASS.


## 2026-10-04 — TikTok VOD native geometry — contain + center

- Base: `9eca8ad3717573370d730ccb21d00611f9545376`.
- Commit: `2c883a42e297b43f0e69b2f9f7d9c664594a0f29`.
- Lỗi: VOD ngang vẫn bị zoom/crop sau khi preview ẩn.
- Nguyên nhân: native `#tiktokMediaVideo` chưa khóa width/height/object-fit, khác với LIVE player.
- Fix: absolute inset 0, 100% x 100%, `object-fit:contain`, center-center; native core center.
- PWA v90.
- Deploy run `37145430565` SUCCESS; contracts/build/deploy/custom-domain PASS.
- Không đổi backend/data/network/polling.
- Rollback: `9eca8ad3717573370d730ccb21d00611f9545376`.


## 2026-10-04 — TikTok VOD slow-open — bounded provider failover

- Base: `375204cdaa21b1925d6cd8f875caba2cb0005034`.
- Root cause:
  - provider resolver/media open không có timeout cứng;
  - warm winner `native` bị `readVodWarmPreference` bỏ qua;
  - warm cache hit resolve lại cả chain.
- Patch:
  - `d168c3c043cc587a9c012e87f53421558999bbc7`: timeout helpers + native warm winner + cached warm short path + contract.
  - deploy đầu fail vì legacy contract còn khóa avc3; Worker chưa deploy.
  - `5a9470aba20d3db74d0c631ae6cbe42bffa53ea1`: contract avc4 + TDown direct abort.
- Limits: resolve 2200 ms, media-open 1800 ms, probe 1400 ms.
- Deploy TikTok Live State Edge run `37146003420`: SUCCESS.
- Không thêm provider/polling/cron/fan-out; one provider call per source per click vẫn giữ nguyên.
- Không có direct latency probe vì tool environment không resolve workers.dev.
- Rollback: `375204cdaa21b1925d6cd8f875caba2cb0005034`.


## 2026-10-04 — YouTube/TikTok hard media-branch isolation + LIVE zero semantics

- Base: `5aaf23edff697b4e878e7211ddc6ceaad94eb22c`.
- Commit: `6189f230b5eacfdcb93ffffc64df9fbbe13adec0`.
- Owner: frontend/player orchestration.
- Fix:
  - YouTube/TikTok player branches stop each other on platform switch;
  - `openMedia` rejects cross-provider stale state;
  - generic feed is YouTube-only; TikTok uses dedicated workspace;
  - TikTok thumbnail fallback never uses YouTube CDN;
  - LIVE viewer unknown/<=0 becomes null/hidden;
  - empty `Đang LIVE · 0` group is not rendered.
- PWA v91.
- Deploy 1988 Player run `37146443871` SUCCESS; contracts/build/deploy/custom-domain PASS.
- Backend/API/polling unchanged.
- Rollback: `5aaf23edff697b4e878e7211ddc6ceaad94eb22c`.


## 2026-10-04 — Gỡ TikTok khỏi giao diện MAIN

- Branch: `main`.
- Base trước sửa: `831aff402cca179cce961cd97e67e3f1574f56e9`.
- Code commit: `d8418db3976e0144c713aa9e4be3bd1c1966eca3`.
- Owner: frontend/UI.
- Xóa logo/nút TikTok khỏi header production.
- Khóa toàn bộ đường UI mở TikTok bằng `TIKTOK_UI_ENABLED=false`; TikTok workspace/media không thể được mở từ MAIN.
- Backend TikTok, Cloudflare Worker, Render và canonical data giữ nguyên, không xóa.
- PWA cache: `1988-simple-media-v96`.
- Deploy 1988 Player run `37148473894`: SUCCESS.
- Frontend contracts, build, deploy và custom-domain verify: PASS.
- Rollback: revert code commit trên nếu cần khôi phục UI TikTok.


## 2026-10-04 — TikTok LIVE Cloud demo tối giản

- Branch: `main`.
- Base: `351410ed661a570dd4ad03f9b3d82e4ba754003c`.
- Code commit: `a81055a6d01d19ba73f6a58ea5bfac1814c75a15`.
- Tạo `tiktok-live-cloud-demo.html`: chỉ danh sách LIVE + player.
- Cloudflare room/status check lấy luôn FLV/HLS trong cùng response và lưu vào snapshot.
- `/tiktok/live-now` chỉ đọc snapshot; bỏ resolver/probe LIVE vòng hai khỏi đường hiển thị.
- Demo mở snapshot ngay, sau đó một bounded `/sweep`; click phát FLV bằng mpegts.js hoặc HLS native.
- Nếu snapshot cũ chưa có link, click chỉ targeted-refresh đúng handle một lần.
- Worker run `37148726520`: SUCCESS; zero schedules PASS.
- Pages run `37148726425`: SUCCESS; demo/frontend contracts + custom-domain verify PASS.
- MAIN TikTok vẫn bị khóa bằng `TIKTOK_UI_ENABLED=false`; demo độc lập.
- Demo URL: `https://yt.taphoa.xyz/tiktok-live-cloud-demo.html`.
- Rollback: revert `a81055a6d01d19ba73f6a58ea5bfac1814c75a15`.


## 2026-10-04 — Khóa kiến trúc TikTok LIVE direct Cloud → TikTok

- Chốt lại cơ chế đúng sau khi đối chiếu lịch sử trước khoảng 02:00 giờ Việt Nam.
- TikTok LIVE targeted check phải dùng đúng một request Cloudflare → TikTok `/api-live/user/room`.
- `status=2` thì lấy FLV/HLS ngay trong cùng `liveRoom.streamData / pull_data`.
- UI nhận item đã có link và click phát trực tiếp.
- Cấm Render LIVE resolver, `resolveTikTokLiveEdge()` vòng hai, probe HEAD/GET trước render và click-to-resolve.
- Không full scan khi chỉ test/mở một handle; không cron/background discovery.
- Render chỉ còn profile/video-list/VOD metadata; Supabase không truyền media bytes.
- Các mô tả TikTok LIVE cũ có nhiều tầng trong CURRENT_WORK 3.21/3.22 được supersede bởi rule 3.23.
- Đây là **docs/rule lock**, chưa tuyên bố runtime production đã được sửa theo rule này.
