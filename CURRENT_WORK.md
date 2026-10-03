# CURRENT WORK — 1988 HANDOFF

> **BẮT BUỘC ĐỌC FILE NÀY TRƯỚC MỌI LẦN SỬA.**
>
> Mục tiêu: khi đổi chat / đổi người sửa / quay lại sau một thời gian, chỉ cần đọc file này + `README_MAINTENANCE.md` + `README_NO_WAIT_WORKFLOW.md` là biết production đang chạy theo kiến trúc nào, lỗi gần nhất là gì, đã sửa đến đâu và bước tiếp theo phải kiểm tra ở đâu.
>
> **Không được sửa production chỉ dựa vào trí nhớ hội thoại.**

Cập nhật gần nhất: **2026-10-03**

## 1. Trình tự bắt buộc trước mọi sửa chữa

Đọc theo đúng thứ tự:

1. `CURRENT_WORK.md` — trạng thái gần nhất và việc đang làm.
2. `README_MAINTENANCE.md` — FAST REPAIR / owner / rollback / deploy.
3. `README_NO_WAIT_WORKFLOW.md` — không đứng chờ, không retry mù, không tạo job/deploy trùng.
4. Nếu đụng package, polling, API, cache, log, media, Supabase traffic: đọc thêm `README_RESOURCE_GUARDRAILS.md`.
5. Nếu cần rollback: đọc `CHECKPOINT.md`.
6. Chỉ sau đó mới probe source of truth và viết patch.

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

### 3.4. Incident mới nhất — Trạng thái Chọn/Chặn và LIVE kế thừa không đồng bộ

Thời gian: **2026-10-03**.

Triệu chứng:
- Main UI ở search/channel view vẫn hiện `Chọn vào nguồn…` dù Dân Ca Lofi đã canonical `selected` trong scope `live`.
- Main UI chỉ đọc trạng thái trực tiếp của scope đang mở, chưa hiển thị trạng thái hiệu lực/kế thừa.
- Trang `/sources/` có logic LIVE kế thừa nhưng chỉ trừ blocked riêng scope LIVE, lệch với Cloudflare production vốn trừ blocked của mọi scope.
- Source edit trước đây không có targeted LIVE sync; phải đợi lần full LIVE scan tiếp theo mới chắc chắn cập nhật membership.

Contract mới:
```text
LIVE effective selected
= union(selected của mọi scope)
- union(blocked của mọi scope)
```

- `normal` = Chưa chọn / Chưa chặn.
- `selected` = Đã chọn.
- `blocked` = Đã chặn.
- LIVE inherited state phải hiển thị rõ `kế thừa`, không giả thành direct state.
- Muốn bỏ một inherited state phải sửa scope gốc; không ghi một direct `normal` giả ở LIVE.

Patch:
- 1988 commit `729641199ea1cc5c9e893037cca0ac0d4f5752b1`:
  - main UI có `effectiveSourceStatus()`;
  - menu search/channel hiển thị `Đã chọn trong nguồn…` / `Đã chặn trong nguồn…`;
  - picker hiển thị từng scope: Chưa chọn / Đã chọn / Đã chặn / kế thừa;
  - LIVE aggregate luôn mở picker thay vì toggle một state giả;
  - `/sources/` dùng union selected/blocked giống Cloudflare;
  - `yt1988-state` gọi targeted LIVE source sync sau `set_source`;
  - regression contract `tests/source-state-contract.test.cjs`;
  - PWA cache v72.
- Infrastructure commit `902e4e89022fcccee0ca39e4fc8148ef288b2361`:
  - endpoint `/youtube/live-source-sync?channelId=...`;
  - chỉ kiểm tra đúng channel vừa thay đổi;
  - nếu bị block hoặc không còn selected ở bất kỳ scope nào → loại khỏi LIVE snapshot;
  - nếu còn selected → probe LIVE đúng channel;
  - changed snapshot → wake package LIVE;
  - unknown upstream → giữ last-known-good row.
- deploy mirror/workflow commit `f4168c22138ce44d6f1c9b141fb7d0e0ca5bd265`.
- UI label cleanup:
  - `1e84a3ebc12aac5abe1b31a8eafa535fa41feaee`;
  - `5859505457da2e6e58f0cd2b01ac321af7599b85`;
  - PWA `v73` commit `ec5ac68e190c18b09888fbef146defe4a17b5aca`.

Runtime:
- `yt1988-state v9` ACTIVE.
- Cloudflare deploy run `37134001622`: deploy + zero-schedule PASS; workflow tổng thể fail ở full demand-scan verify sau deploy, nhưng Worker mới đã được deploy.
- Targeted endpoint production test:
  - Dân Ca Lofi `UC7NBAf7ARIWZKB0Tr6PbD7Q`;
  - HTTP 200;
  - outcome `offline`;
  - changed=false;
  - chỉ sync đúng channel, không full scan.
- End-to-end idempotent `set_source(selected)` request 565: HTTP 200; canonical row vẫn `scope=live,status=selected`.

Rule:
- Mọi `set_source` là canonical row write trước; UI chỉ broadcast/update sau success.
- Source edit là user-triggered demand action: được targeted-sync đúng 1 channel vào LIVE, không chạy full scan.
- Nếu channel còn selected ở bất kỳ scope nào và không blocked → LIVE coi là selected.
- Nếu blocked ở bất kỳ scope nào → LIVE blocked.
- Nếu xóa selected ở scope cuối cùng → targeted sync loại channel khỏi LIVE snapshot/package nếu đang có.
- Nếu LIVE đang visible, UI chờ hash mới; nếu không visible, không tải package LIVE trước — lần mở LIVE sau sẽ lấy hash/package mới.

### 3.3. Incident mới nhất — LIVE đã hết vẫn còn vì edge trả 0

Thời gian: **2026-10-03**.

Triệu chứng:
- UI còn nhiều LIVE đã kết thúc.
- Package LIVE trước sửa: hash `23v6p2`, **31 item**.
- Cloudflare scan đã kiểm tra khoảng 248 kênh nhưng snapshot trả `live=0`.
- Supabase đúng rule last-known-good nên không lấy `[]` đè package 31; vì vậy LIVE cũ bị giữ lại.

Owner:
- **Cloudflare YouTube LIVE verifier** + một nhánh double-verify thừa trong `yt1988-refresh`.
- UI không sửa.

Nguyên nhân:
- Cloudflare strict verifier phụ thuộc InnerTube API làm cổng duy nhất; đường này có thể bị YouTube chặn/không trả đủ nên toàn scan thành 0.
- Supabase lại verify snapshot fresh lần nữa bằng InnerTube từ IP Supabase; runtime Supabase đã được chứng minh bị Google trả automated-query block.

Patch:
- infrastructure commit `a00e27e75aef51079a7927f9ade0ab9e922a6e07`:
  - watch page của đúng videoId là đường xác minh chính;
  - parse `ytInitialPlayerResponse/videoDetails`;
  - chỉ nhận khi `isLive=true` và owner `channelId` khớp;
  - InnerTube chỉ fallback.
- 1988 commit `046d5bf68b58df79406e2bb571027a5290ed1b15`:
  - snapshot Cloudflare fresh đã verified thì Supabase không verify InnerTube lại;
  - Supabase chỉ lọc/enrich/đóng package.
- runtime `yt1988-refresh v28`.
- Cloudflare deploy run `37132871574`: SUCCESS; zero schedules PASS.

Production verify:
- Cloudflare snapshot version 130:
  - checked: 249;
  - selected: 241;
  - discovered: 11;
  - **live: 18**;
  - mỗi item có `verifiedLive=true`, `verifiedOwner=true`, verification=`watch_player_is_live+owner_match`.
- Supabase LIVE package:
  - trước: hash `23v6p2`, 31 item;
  - sau: hash `1d9yemd`, **18 item**;
  - refresh `last_ok=true`, không pending scope.
- UI không đổi; hash mới sẽ tải package 18 hoàn chỉnh rồi swap.

Rule:
- Cloudflare quyết định realtime LIVE + owner.
- Supabase không được gọi InnerTube lại cho snapshot Cloudflare fresh.
- Edge thật sự lỗi/unknown → giữ last-known-good.
- Edge fresh verified có N LIVE → package phải có tập N sau canonical filter/enrich, không giữ ended rows cũ.

### 3.2. Incident mới nhất — LIVE title bị rơi thành tên kênh

Thời gian: **2026-10-03**.

Triệu chứng:
- Video LIVE `LI-7QtW-_bs` / Báo Tiền Phong News.
- Package trước sửa: `title = "Báo Tiền Phong News"`.
- Exact `yt1988?action=video_meta&id=LI-7QtW-_bs` trả title gốc:
  `🔴Trực Tiếp: Tin tức an ninh trật tự nóng, thời sự Việt Nam mới nhất 24h Tối ngày 3/10`.

Owner:
- **Supabase package builder `yt1988-refresh`**.
- UI không sửa.

Patch:
- commit `60e004cfdc07f34dcb60c0b7851de394432116e0`;
- nếu LIVE title rỗng hoặc compact-equal `sourceName` → lấy exact `video_meta` theo `videoId`;
- title khác → giữ nguyên;
- không AI/heuristic/dọn title LIVE.
- regression test commit `bca6596a4925076b3126f8c5af0ec6365ccb0010`.
- runtime: `yt1988-refresh v27`.

Production verify:
- package LIVE hash `23v6p2`, 31 item;
- row `LI-7QtW-_bs` hiện title đúng title gốc ở trên;
- sourceName vẫn `Báo Tiền Phong News`;
- UI chỉ nhận package/hash mới.

Rule:
- LIVE `title` không được dùng `sourceName` làm fallback cuối.
- Chỉ khi title rỗng hoặc bằng sourceName mới exact-resolve theo videoId.
- Title exact lấy về phải giữ nguyên, không lọc nội dung.

### 3.1. Incident mới nhất — LIVE thiếu avatar dù channel directory đã có

Thời gian: **2026-10-03**.

Triệu chứng:
- Card LIVE **GH AI Muzick** hiển thị placeholder chữ `G`.
- Canonical `yt1988_channel_directory` đã có avatar cho channel `UCoOmYgEUQG9Pp_iXgmLzJYg`.
- Package LIVE trước sửa có `sourceAvatar=""`.

Owner:
- **Supabase package builder `yt1988-refresh`**.
- UI không sửa.

Patch:
- `51187b81124e469e5f69a41a4ac6f0a97da6f766`: thêm fallback identity LIVE từ `yt1988_channel_directory`.
- `53592b41a4a36727b6afbbb079b821f4f7ee5608`: test avatar fallback không đổi title.
- `ed392856ebcfe96ecdaca3c5082c0109121cd6ba`: khi discovery chưa chắc, giữ nguyên membership package cũ nhưng vẫn cho phép bổ sung canonical name/avatar.
- runtime: `yt1988-refresh v26`.

Production verify:
- package LIVE trước: hash `wx4gj5`, 31 item.
- package LIVE sau: hash `q7qrx8`, vẫn 31 item.
- GH AI Muzick:
  - videoId giữ nguyên `le-EBatRnpU`;
  - title giữ nguyên;
  - `sourceAvatar` đã đổi từ rỗng sang đúng URL trong channel directory.
- Không đổi UI, không đổi membership LIVE.

Rule:
- LIVE package thiếu name/avatar nhưng channel directory đã có → package builder phải lấy theo exact `channelId`.
- Không để UI tự chữa identity.

## 4. Incident gần nhất — UI YouTube LIVE phải đọc nguyên package

Thời gian: **2026-10-03**.

Triệu chứng:
- Package LIVE production đã có đúng Lệ Quyên và ChimSeDiNang AOE nhưng UI có thể không hiển thị hết.
- Probe package LIVE: hash `ld9wih`, 27 item; Lệ Quyên ở vị trí 14, ChimSeDiNang AOE ở vị trí 27.
- UI đang cắt feed YouTube tối đa 18 card nên item 19+ bị mất dù package đúng.
- UI còn nhánh legacy có thể hydrate/repaint YouTube LIVE từ edge/channel library, trái rule package-only.

Owner: **frontend `index.html`**.

Rule:
- Cloudflare chỉ discovery + wake.
- Supabase package quyết định membership, videoId/link, title, sourceId, sourceName, sourceAvatar cho YouTube feed.
- UI chỉ đọc/swap package theo hash; không sửa identity package từ edge/channel library/video metadata.
- Package có N LIVE thì UI render đủ N LIVE.

Patch:
- commit `9ba971aa6a08d2ae2342a817fd0c4361181c9693`;
- LIVE render toàn bộ package thay vì cắt 18;
- package card dùng đúng name/avatar trong package;
- edge không paint/hydrate YouTube card;
- client LIVE snapshot chỉ còn cho TikTok;
- PWA cache `1988-simple-media-v71`.

Verify:
- frontend production contracts PASS;
- deploy workflow `37127795634`: SUCCESS;
- Pages deploy + custom-domain verify: SUCCESS.

Rollback: `d3c08aeab7fb757d55dec19330b4ca55e4f87672`.

## 5. Incident trước — LIVE discovery chuyển sang demand-only

Thời gian: **2026-10-03**.

Triệu chứng / mục tiêu:
- YouTube LIVE có thể thiếu kênh vừa bắt đầu LIVE vì UI trước đó chỉ wake package builder nhưng hàm full edge scan chưa được nối vào luồng mở tab.
- Startup từng preload/wake LIVE dù người dùng chưa mở LIVE.
- Cloudflare runtime từng có cron YouTube/TikTok nên vẫn chạy khi không có người dùng.
- Yêu cầu vận hành mới: **không ai mở LIVE → không discovery; LIVE hidden/đổi tab → dừng; chỉ khi LIVE thật sự visible mới scan.**

Owner:
- Frontend demand orchestration: `index.html`.
- Cloudflare LIVE schedules: YouTube/TikTok Workers.
- Supabase vẫn là package owner cho YouTube; UI không dùng Cloudflare snapshot làm feed.

Bằng chứng:
- `runYoutubeLiveCycle()` đã tồn tại nhưng trước patch không có caller.
- Startup gọi `preloadStartupLiveLists()` và prefetch nhiều scope.
- Infrastructure deploy config từng có YouTube cron `*/2 * * * *` và TikTok cron `* * * * *`.
- Supabase production hiện **không có** `yt1988-refresh-every-minute`; query `cron.job` chỉ còn keepalive Render + retention cleanup, không có package/LIVE discovery cron.

Patch:
- 1988 frontend commit `0600797cf6fe435478199b9589a5cc1fa77502af`:
  - startup không preload/wake LIVE;
  - unopened package scopes không network-prefetch;
  - mở YouTube LIVE → chạy edge discovery rồi mới wake/sync package;
  - hidden/đổi scope → stop timer/abort scan;
  - visible LIVE mới chạy lại khoảng 1 phút/lần.
- 1988 compatibility/runtime commit `e6c38717c84654162b527a6ab7978454aae5fe18`:
  - TikTok ưu tiên `/tiktok/live-scan`;
  - runtime cũ chưa có endpoint mới thì fallback demand-only qua `/sweep`;
  - PWA shell cache = `1988-simple-media-v70`;
  - one-shot Cloudflare API xóa schedule của cả hai LIVE Workers.
- Infrastructure canonical commit `70fd3ee4cb6beeaf8f5dc5ff45c38bca8352b441`:
  - source YouTube/TikTok đều demand-only;
  - `crons = []`;
  - TikTok có logical scan theo batch, current LIVE ưu tiên trước.

Deploy / production verify:
- Pages run `37126176517`: SUCCESS.
- Latest Pages run `37126405789`: SUCCESS, custom-domain verify PASS.
- Cloudflare schedule removal run `37126405820`: SUCCESS; API PUT + GET xác nhận **0 schedule** cho:
  - `1988-youtube-live-state`;
  - `1988-tiktok-live-state`.
- Infrastructure Worker deploy runs `37126064335` (YouTube) và `37126064354` (TikTok) fail ở **Verify Cloudflare token** trước deploy. Vì vậy canonical Worker source mới chưa live qua repo infrastructure.

Production hiện tại:
- YouTube LIVE visible:
  `edge live-scan → Supabase yt1988-refresh → package hash đổi → UI tải package → render`.
- YouTube UI vẫn **package-only**.
- TikTok LIVE visible:
  - thử logical `/tiktok/live-scan`;
  - nếu runtime cũ trả 404, dùng `/sweep` demand-only;
  - không có web/LIVE visible thì không gọi sweep.
- Startup/latest không còn đánh thức LIVE.
- Không có Cloudflare LIVE cron.
- Supabase không có cron refresh/package discovery mỗi phút.

Known residual / next probe:
- Credential Cloudflare trong repo `1sl2tp/infrastructure` đang fail verify.
- Khi credential đó được sửa, deploy commit `70fd3ee...`, verify TikTok `/tiktok/live-scan` chạy full logical cycle đến `done:true`, rồi có thể giữ fallback `/sweep` chỉ để tương thích.
- Không bật lại cron LIVE để chữa credential.

Rollback:
- Frontend pre-demand baseline: `d6e465d991ae442c7a1c61103c92cf8ee4b6558d`.
- **Không** coi bật lại LIVE cron là rollback hợp lệ, vì demand-only là rule vận hành đã chốt.

## 6. Incident trước — LIVE gắn sai kênh

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

## 7. Nếu lỗi LIVE sai kênh xuất hiện lại

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

## 8. Trạng thái vận hành cần nhớ

- Production branch: `main`.
- Frontend: `https://yt.taphoa.xyz/`.
- YouTube tab UI: package-only.
- Supabase project production: project ref `mstltsunsawqomzniqok`.
- Resource guardrail đang áp dụng:
  - no-wait rule bắt buộc: còn việc độc lập thì không đứng chờ; cùng cơ chế fail 2 lần thì đổi đường; job đang chạy không tạo job thứ hai;
  - hash không đổi → không tải package;
  - không media bytes qua Supabase;
  - không log từng item;
  - browser chỉ wake scope đang visible; không có người dùng/LIVE hidden → không LIVE discovery;
  - Cloudflare YouTube/TikTok LIVE không có cron schedule;
  - browser không tạo crawler riêng;
  - upstream lỗi → giữ last-known-good.

## 9. Mẫu cập nhật file này sau repair

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
