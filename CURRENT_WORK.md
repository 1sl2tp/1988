# CURRENT WORK — 1988 HANDOFF

> **BẮT BUỘC ĐỌC FILE NÀY TRƯỚC MỌI LẦN SỬA.**
>
> Mục tiêu: khi đổi chat / đổi người sửa / quay lại sau một thời gian, chỉ cần đọc file này + `README_MAINTENANCE.md` + `README_NO_WAIT_WORKFLOW.md` là biết production đang chạy theo kiến trúc nào, lỗi gần nhất là gì, đã sửa đến đâu và bước tiếp theo phải kiểm tra ở đâu.
>
> **Không được sửa production chỉ dựa vào trí nhớ hội thoại.**

Cập nhật gần nhất: **2026-10-04**

## 1. Trình tự bắt buộc trước mọi sửa chữa

Đọc theo đúng thứ tự:

1. `CURRENT_WORK.md` — trạng thái gần nhất và việc đang làm.
2. `README_MAINTENANCE.md` — FAST REPAIR / owner / rollback / deploy.
3. `README_NO_WAIT_WORKFLOW.md` — không đứng chờ, không retry mù, không tạo job/deploy trùng.
4. Nếu đụng host/data/action ownership: đọc thêm `README_HOST_ARCHITECTURE.md`.
5. Nếu đụng package, polling, API, cache, log, media, Supabase traffic: đọc thêm `README_RESOURCE_GUARDRAILS.md`.
6. Nếu cần rollback: đọc `CHECKPOINT.md`.
7. Chỉ sau đó mới probe source of truth và viết patch.

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


### 3.33. TikTok demo — LIVE-only, bỏ hẳn VOD khỏi trang test LIVE

Thời gian: **2026-10-04**.

- Theo yêu cầu người dùng, `tiktok-live-cloud-demo.html` chỉ còn một nhiệm vụ:
  `Dán link TikTok LIVE → bấm Kiểm tra → Cloudflare /refresh → nhận stream URL mới → phát ngay`.
- Bỏ toàn bộ khỏi demo:
  - 5 video gần nhất;
  - TikWM/BHWA VOD;
  - Auto/Media/Iframe;
  - cache LIVE/VOD trong browser.
- Trang hiển thị luôn stream URL mới và có nút sao chép.
- LIVE vẫn dùng đúng flow đã chốt qua Cloudflare `/refresh`; không Render.
- Commit runtime: `ac4a859feafd13fc0f1683bd7ce951168bd1b14e`.
- Deploy 1988 Player run `37159085762`: **SUCCESS**, frontend contracts/deploy/custom-domain verify PASS.

### 3.32. TikTok demo — latest 5 qua Edge metadata, không browser-CORS, không Render

Thời gian: **2026-10-04**.

- Lỗi: browser gọi trực tiếp TikWM `/api/user/posts` có thể bị CORS/chặn, làm cột **5 video gần nhất** báo lỗi dù LIVE vẫn chạy riêng.
- Sửa:
  - thêm Cloudflare endpoint `/tiktok/channel-videos?user=<handle>&count=5`;
  - Worker gọi TikWM `/api/user/posts` server-side và chỉ trả JSON metadata nhỏ;
  - frontend lấy 5 video qua Edge metadata endpoint;
  - media bytes vẫn không đi qua Worker;
  - VOD vẫn phát trực tiếp bằng TikWM HD / BHWA;
  - LIVE vẫn giữ `/refresh` → TikTok live API như rule cũ;
  - không dùng Render.
- Commit runtime: `46d6b8c82bcab169ff9333967bc002dab5940bed`.
- Deploy TikTok Live State Edge run `37158846184`: **SUCCESS**.
- Deploy 1988 Player run `37158846154`: **SUCCESS**; frontend contracts, deploy và custom-domain verify PASS.

### 3.31. TikTok LIVE demo — manual check must replace stale LIVE cache

Thời gian: **2026-10-04**.

- Lỗi: bấm **Kiểm tra** dùng `force` nhưng không xoá cache LIVE cũ. Nếu lần check mới lỗi, F5 lại đọc cache cũ nên hiển thị link LIVE cũ.
- Sửa:
  - thêm `removeLiveCache(handle)`;
  - bấm **Kiểm tra** xoá cache LIVE cũ trước khi gọi Cloudflare `/refresh`;
  - nếu kết quả mới không playable hoặc request lỗi thì không giữ cache cũ;
  - nếu kết quả mới có stream playable thì ghi cache mới và **tự phát LIVE ngay trong Player**.
- Không đổi cách tìm LIVE; vẫn Cloudflare/TikTok API đã chốt.
- Không dùng Render.
- Commit runtime: `170bb972784475d54ab7758eba0c7b51a92314ca`.
- Deploy 1988 Player run `37158680465`: **SUCCESS**, frontend contracts/deploy/custom-domain verify PASS.

### 3.30. TikTok demo — no Render, LIVE song song + 5 video TikWM, phát TikWM/BHWA

Thời gian: **2026-10-04**.

- Không dùng Render cho màn demo này.
- LIVE/tìm LIVE giữ đúng luồng đã chốt: Cloudflare `/refresh` → TikTok `api-live/user/room`.
- 5 video gần nhất lấy nhanh từ TikWM `/api/user/posts?unique_id=...&count=5`.
- LIVE và danh sách 5 video chạy song song, không chờ nhau.
- Mỗi video trong danh sách phát bằng cả hai nguồn:
  - TikWM HD;
  - BHWA.
- Auto: TikWM trước, lỗi get-link/media thì chuyển BHWA.
- BHWA public parse hiện dùng theo từng media URL, không dùng để quét danh sách kênh.
- Commit runtime: `7f3413c2a7a681e42a99de379cbfc82fdc7d4b61`.
- Deploy 1988 Player run `37158477985`: SUCCESS.
- Pages build/deploy run `37158477564`: SUCCESS.

### 3.29. TikTok VOD demo — chỉ giữ 2 nguồn gốc TikWM HD + BHWA

Thời gian: **2026-10-04**.

- Theo yêu cầu người dùng, dừng dò TDown/TTDownloader và các nguồn thử nghiệm khác.
- Demo VOD chỉ còn 2 source button:
  - `tikwm_hd` → gọi thẳng `https://www.tikwm.com/api/?url=...`, ưu tiên `hdplay` rồi `play`;
  - `bhwa_get` → gọi thẳng `https://downloader-api.bhwa233.com/api/parse?url=...`.
- Hiển thị luôn link gốc provider trong demo:
  - `https://www.tikwm.com/`
  - `https://downloader-api.bhwa233.com/`
- Hai nguồn này lấy direct URL ở browser; không qua VOD Worker 1988.
- TikTok LIVE không đổi.
- Commit: `49f8949d59cba90a028eb28fbe6319204f4e8edf`.

### 3.28. TikTok VOD demo — khôi phục TDown direct browser như mốc 9cbd4771

Thời gian: **2026-10-04**.

- Root cause: TDown từng chạy ổn vì browser gọi trực tiếp `https://tdownv4.sl-bjs.workers.dev/?down=<TikTok URL>`, nhận JSON `download_url`, rồi gán direct MP4 vào `video.src`.
- Regression sau đó: TDown bị chuyển qua Worker 1988 `/tiktok/video-resolve` / `/tiktok/video-stream`, làm khác đường known-good và phát sinh lỗi.
- Sửa tối thiểu: chỉ đưa `source==="tdown"` trong `tiktok-live-cloud-demo.html` về đúng flow cũ:
  `browser → TDown API → download_url → video.src`.
- TTDownloader và các nguồn thử nghiệm khác không đổi trong lượt sửa này.
- Commit: `7bad5afb152b97dc419bfc12448bf1aca731d4fe`.
- Deploy 1988 Player run `37157459699`: **SUCCESS**; frontend contracts PASS, deploy PASS, custom-domain verify PASS.
- Mốc tham chiếu cũ: `9cbd4771`.

### 3.27. TikTok VOD demo — TDown/TTDownloader resolve direct URL trước khi play

Thời gian: **2026-10-04**.

- Lỗi gốc: demo coi `tdown` và `ttdownloader` là `EDGE_VOD_SOURCES`, nên `resolveVodDirect()` chỉ tạo URL `/tiktok/video-stream?...source=...` tức thì. Dòng `link 0.00s` là URL relay của Cloud Worker, **không phải direct URL thật từ provider**.
- Sửa:
  - thêm endpoint JSON `/tiktok/video-resolve` chỉ cho `tdown` và `ttdownloader`;
  - endpoint chỉ resolve và trả `{ ok, source, url }`, **không truyền media bytes**;
  - UI chờ JSON xong mới gán `video.src = directUrl`;
  - TDown trả `download_url` thật từ TDown;
  - TTDownloader lấy đúng hàng `No watermark (HD)` / `#results-list > div:nth-child(2) > div.download > a`;
  - sửa thông báo `video.play()`: chỉ `NotAllowedError` mới ghi autoplay; lỗi khác hiển thị `PLAY LỖI`.
- Commit: `69663e2ef26678d640408af712ebce778dd04af2`.
- Deploy 1988 Player run `37157204362`: **SUCCESS**.
- Deploy TikTok Live State Edge run `37157204373`: **SUCCESS**; edge contracts PASS, Worker deploy PASS, zero LIVE schedules PASS.
- Không đổi TikTok LIVE.

### 3.26. TikTok VOD demo — KHÔI PHỤC MỐC KNOWN-GOOD e271

Thời gian: **2026-10-04**.

- Khôi phục đúng trạng thái demo/runtime tại commit `e2717d5df2cabee04f9de91d5fe89030206c68e4`.
- 4 file được phục hồi nguyên nội dung: `tiktok-live-cloud-demo.html`, `tests/tiktok-live-cloud-demo.test.cjs`, `cloudflare/tiktok-live-state/worker.js`, `cloudflare/tiktok-live-state/vod-failover-contract.test.cjs`.
- Giao diện trở lại đủ các nút nguồn như ảnh: TikWM HD, TikWM Standard, BHWA, Native, Direct, TDown, MusicalDown, TikDown, TTDownloader, TiklyDown, DouyinWTF.
- Bỏ toàn bộ thay đổi sau mốc này về 3-source chain, TTDownloader HQ selector và resolver-cache `avc5`.
- Commit restore: `a06cb6fe6d9db027a0ba912e83e75f06f8dcc53e`.
- Edge run `37156612837`: SUCCESS.
- Player run `37156612927`: SUCCESS.
- 4 file sau restore đã kiểm tra khớp nguyên nội dung với `e2717d5d`.

### 3.25. TikTok demo VOD — TikWM → TTDownloader → BHWA, luôn ưu tiên HQ

Thời gian: **2026-10-04**.

- Owner: **TikTok VOD demo + TTDownloader resolver**. MAIN và TikTok LIVE không đổi.
- Demo `/tiktok-live-cloud-demo.html` chỉ còn 3 nguồn media:
  1. `tikwm_hd` = TikWM;
  2. `ttdownloader` = **TTDownloader**;
  3. `bhwa_get` = BHWA.
- **TTDownloader và TDown là hai provider khác nhau. Demo dùng TTDownloader, không dùng TDown.**
- Auto gọi tuần tự **TikWM → TTDownloader → BHWA**; mỗi lần chỉ gọi một nguồn, lỗi thật mới chuyển nguồn kế tiếp; không fan-out.
- Chất lượng:
  - TikWM ưu tiên `hdplay` rồi mới `play`;
  - TTDownloader ưu tiên option **No Watermark** và nhãn **HD / High Quality / 1080 / Original** trước generic link;
  - BHWA ưu tiên `originDownloadVideoUrl` trước `downloadVideoUrl` / `streamUrl`.
- Frontend commit: `0ac8c6d32905c8a576670d112343eebcb856f048`.
- Worker HQ commit: `00b0759e10c72f2bceeb13c40f40a255a7345f33`.
- Deploy 1988 Player run `37155880303`: **SUCCESS**.
- Deploy TikTok Live State Edge run `37155955038`: **SUCCESS**; edge contracts PASS, Worker deploy PASS, zero LIVE schedules enforcement PASS.
- Rollback frontend: `c4a3ccd29c64f8c868faf9f1908ab4bc9143a894`.
- Rollback Worker: `0ac8c6d32905c8a576670d112343eebcb856f048`.

### 3.24. TikTok demo VOD — 2 video mẫu cố định

Thời gian: **2026-10-04**.

- Bỏ hoàn toàn việc tải 5 video gần nhất trong demo.
- Demo luôn có đúng 2 VOD mẫu:
  - dài: `@giadinhnhaman / 7691953502813293832`;
  - ngắn: `@emlinhday201 / 7687601468794277128`.
- Mỗi sample tự mang `handle + videoId`; player VOD dùng đúng handle của sample, không dùng handle của ô LIVE.
- VOD vẫn thử TikWM/TDown theo contract hiện tại.
- Không đổi MAIN.
- TikTok LIVE direct rule 3.23 giữ nguyên; lượt sửa này không thay runtime LIVE.

### 3.23. KHÓA KIẾN TRÚC — TikTok LIVE direct từ API TikTok qua Cloud

Thời gian: **2026-10-04**.

Đây là rule **bắt buộc** cho TikTok LIVE từ mốc này:

```text
UI nhập/mở đúng 1 handle TikTok
→ Cloudflare gọi TikTok /api-live/user/room đúng 1 lần
→ đọc liveRoom.status
→ status=2: lấy luôn FLV/HLS từ chính liveRoom.streamData / pull_data
→ trả item LIVE đã có link cho UI
→ click = phát thẳng link đó
```

**Cấm làm phức tạp lại luồng LIVE:**
- không chuyển LIVE qua Render;
- không gọi Render để lấy link LIVE;
- không `resolveTikTokLiveEdge()` sau khi đã có `liveRoom`;
- không gọi API TikTok lần hai chỉ để lấy lại link;
- không HEAD/GET probe URL rồi mới cho item xuất hiện;
- không tìm link khi người dùng bấm card;
- không dùng `/tiktok/live-now` như một bước resolver thứ hai cho targeted check;
- không quét 171 kênh khi chỉ đang test/mở 1 handle;
- không cron/background discovery khi không có bề mặt LIVE đang dùng.

Nguồn sự thật cho một targeted LIVE check:
- TikTok `/api-live/user/room?aid=1988&sourceType=54&uniqueId=<handle>`;
- `status=2` = LIVE;
- media lấy **ngay trong cùng response** từ `liveRoom.streamData/pull_data` (FLV/HLS variants);
- `status=4` = OFFLINE;
- response UNKNOWN/upstream lỗi không được tự suy thành OFFLINE.

Player:
- ưu tiên FLV từ response bằng `mpegts.js` khi browser hỗ trợ;
- Safari/iOS có thể dùng HLS **nếu HLS đã có trong chính response đó**;
- không đưa media bytes qua Supabase;
- Render chỉ còn dành cho profile/video-list/VOD metadata khi cần, **không thuộc LIVE direct path**.

Demo hiện tại cần được đưa về đúng rule này trước khi dùng làm chuẩn. Các mô tả cũ ở 3.21/3.22 có `/sweep`, `/tiktok/live-now`, Render LIVE hoặc resolver vòng hai được coi là **superseded** bởi mục 3.23.

### 3.22. TikTok demo targeted — 1 link / 1 LIVE / 5 VOD

Thời gian: **2026-10-04**.

Mục tiêu:
- demo riêng chỉ có một ô nhập link/handle TikTok;
- không quét toàn bộ 171 kênh;
- submit chỉ gọi Cloud `/refresh?user=<handle>` để check đúng 1 kênh;
- nếu status=2, đọc `/tiktok/live-now` và dùng link LIVE đã có sẵn trong item;
- không tìm/resolve link LIVE khi bấm;
- lấy đúng 5 video gần nhất bằng Render `/tiktok/channel-videos?refresh=0&user=<handle>`;
- VOD click thử TikWM/TDown xen kẽ; lỗi thật mới fallback sang nguồn còn lại;
- MAIN vẫn giữ YouTube-only.

Demo:
- `/tiktok-live-cloud-demo.html`
- mặc định điền `https://www.tiktok.com/@tu.thuong_lay_minh_1/live`.

Resource:
- 1 direct action = 1 targeted LIVE status check + 1 channel video read;
- chỉ gọi `/tiktok/live-now` khi kênh thật sự status=2;
- không `/sweep`, không cron, không full scan.

### 3.21. TikTok LIVE Cloud demo tối giản

Thời gian: **2026-10-04**.

Yêu cầu:
- tạo một trang demo riêng, không đưa TikTok trở lại MAIN;
- Cloud check kênh LIVE, giữ luôn link media từ cùng response;
- trang demo hiện danh sách LIVE và click là phát ngay;
- không profile, không VOD, không resolver LIVE vòng hai.

Patch:
- code commit `a81055a6d01d19ba73f6a58ea5bfac1814c75a15`;
- demo: `/tiktok-live-cloud-demo.html`;
- Cloudflare `checkTikTok()` khi `status=2` lấy luôn FLV/HLS/title/cover/avatar/viewers;
- KV snapshot giữ `streamUrl/hlsUrl`;
- `/tiktok/live-now` chỉ đọc snapshot, không gọi `resolveTikTokLiveEdge()`;
- demo paint snapshot trước, chạy đúng một bounded `/sweep`, rồi đọc lại snapshot;
- click card dùng link có sẵn; nếu card snapshot cũ chưa có link thì targeted `/refresh?user=` đúng kênh đó một lần;
- player FLV dùng `mpegts.js`; HLS dùng native khi trình duyệt hỗ trợ.

Production verify:
- Deploy TikTok Live State Edge run `37148726520`: **SUCCESS**;
- zero LIVE schedules enforcement: **PASS**;
- Deploy 1988 Player run `37148726425`: **SUCCESS**;
- frontend/demo contracts + build/deploy/custom-domain verify: **PASS**.

Resource rule:
- demand-only; không cron;
- không Render media;
- không scan nền khi không mở demo;
- không resolver/probe LIVE vòng hai trước khi render.

MAIN:
- `TIKTOK_UI_ENABLED=false` vẫn giữ nguyên; demo là đường riêng theo yêu cầu.

Rollback:
- revert `a81055a6d01d19ba73f6a58ea5bfac1814c75a15`.

### 3.20. MAIN frontend hiện tại: gỡ TikTok khỏi giao diện

Thời gian: **2026-10-04**.

Yêu cầu:
- gỡ toàn bộ lối vào TikTok khỏi giao diện production hiện tại;
- header không còn logo/nút TikTok;
- không còn đường click/deep-link UI để mở TikTok workspace hoặc TikTok media;
- backend/data/Cloudflare/Render TikTok **không xóa**, chỉ để dormant để có thể bật lại sau.

Patch:
- code commit `d8418db3976e0144c713aa9e4be3bd1c1966eca3`;
- base trước patch: `831aff402cca179cce961cd97e67e3f1574f56e9`;
- xóa markup `#platformTikTok` khỏi header;
- khóa `TIKTOK_UI_ENABLED=false`;
- `openPlatformNav("tiktok")`, `showTikTokWorkspace()` và TikTok `openMedia()` không còn mở TikTok từ MAIN;
- PWA cache **v96** để client cũ nhận UI mới.

Production verify:
- Deploy 1988 Player run `37148473894`: **SUCCESS**;
- frontend production contracts: **PASS**;
- build/upload/deploy/custom-domain verify: **PASS**.

Owner/impact:
- **Frontend/UI only**;
- YouTube không đổi;
- Supabase/Render/Cloudflare TikTok không đổi và không xóa dữ liệu.

Rollback:
- revert `d8418db3976e0144c713aa9e4be3bd1c1966eca3` nếu cần bật lại lối vào TikTok UI.

### 3.19. TikTok VOD click source — TikWM/TDown alternating only
- Production click path uses only two proven providers: TikWM and TDown.
- Open 1 = TikWM, open 2 = TDown, then alternate.
- Each open starts one provider only; the other is attempted only after an actual media error.
- No MusicalDown/TikDown/TTDownloader in the normal click rotation.
- No VOD warm/preload/startup timer added; LIVE path unchanged.

### 3.18. YouTube/TikTok hard media-branch isolation + LIVE zero semantics

Thời gian: **2026-10-04**.

Yêu cầu:
- YouTube và TikTok chỉ dùng chung shell/UI; media/data/player/fallback là hai nhánh độc lập.
- LIVE viewer chưa biết không được hiển thị thành số 0.

Patch:
- commit `6189f230b5eacfdcb93ffffc64df9fbbe13adec0`;
- PWA **v91**;
- đổi sang YouTube: dừng TikTok LIVE/VOD/prepared streams;
- đổi sang TikTok: dừng YouTube LIVE demand và pause YouTube player;
- `openMedia()` chặn stale item sai provider;
- generic feed renderer chỉ nhận YouTube; TikTok dùng workspace riêng;
- TikTok card thiếu thumbnail chỉ fallback TikTok avatar/transparent, không dùng `i.ytimg.com`;
- TikTok LIVE `viewerCount<=0/unknown` → `null` + ẩn;
- không render nhóm `Đang LIVE · 0`;
- profile LIVE không render dấu `·` nếu viewer count chưa biết.

Production verify:
- Deploy 1988 Player run `37146443871`: **SUCCESS**;
- frontend production contracts PASS;
- build/deploy/custom-domain verify PASS.

Rule:
- shared shell != shared media branch;
- cấm cross-provider fallback;
- unknown numeric telemetry dùng null/empty, không bịa 0.

Rollback:
- `5aaf23edff697b4e878e7211ddc6ceaad94eb22c`.

### 3.17. TikTok VOD slow-open — bounded provider failover

Thời gian: **2026-10-04**.

Triệu chứng:
- một số TikTok VOD mở lâu dù player/UI đã đúng;
- nghi một số nguồn MP4 bị treo hoặc trả lỗi chậm.

Bằng chứng source:
- `/tiktok/video-stream?source=auto` failover tuần tự qua provider pool;
- trước patch, resolver/media fetch không có deadline cứng theo từng nguồn;
- `warmTikTokVod()` có thể chọn `native` là nguồn tốt nhất nhưng `readVodWarmPreference()` lại loại `native`, nên click không dùng winner đã warm;
- warm cache hit còn resolve lại cả chuỗi provider dù đã có winner.

Patch:
- `d168c3c043cc587a9c012e87f53421558999bbc7`:
  - VOD source version `avc4`;
  - resolver deadline 2200 ms;
  - media-open deadline 1800 ms;
  - probe deadline 1400 ms;
  - warm preference cho phép `native`;
  - warm cache hit trả winner ngay, không resolve lại toàn bộ nguồn;
  - thêm `vod-failover-contract.test.cjs`.
- deploy đầu fail ở contract cũ còn khóa `avc3`; Worker chưa deploy.
- `5a9470aba20d3db74d0c631ae6cbe42bffa53ea1`:
  - cập nhật contract sang `avc4`;
  - TDown dùng `vodFetch(..., VOD_RESOLVE_TIMEOUT_MS, "tdown_resolve")` để abort request thật;
  - deploy Worker cuối **SUCCESS** run `37146003420`.

Contract:
- một source chỉ gọi một lần mỗi click;
- source timeout/fail → chuyển source kế tiếp;
- không thêm provider/fan-out;
- không thêm polling/cron;
- warm winner được reuse thay vì resolve lại.

Lưu ý:
- môi trường tool hiện không resolve được hostname workers.dev nên không có số latency production trực tiếp; production verify dựa trên contract PASS + Worker deploy SUCCESS.
- rollback: `375204cdaa21b1925d6cd8f875caba2cb0005034`.

### 3.16. TikTok VOD native geometry — contain + center

Thời gian: **2026-10-04**.

Ảnh production cho thấy TikTok VOD ngang vẫn bị phóng/cắt dù stage đã dùng ratio thật.

Root cause:
- preview TikTok đã dùng `object-fit:contain`;
- TikTok LIVE video cũng đã khóa `width/height:100% + object-fit:contain`;
- nhưng VOD thật `#tiktokMediaVideo` chỉ có display/visibility/opacity, không khóa kích thước và object-fit;
- sau khi preview biến mất, native video có thể dùng intrinsic layout size rồi bị parent overflow cắt, tạo cảm giác zoom.

Patch:
- commit `2c883a42e297b43f0e69b2f9f7d9c664594a0f29`;
- `#tiktokMediaVideo`:
  - `position:absolute; inset:0`;
  - `width/height:100%`;
  - `object-fit:contain`;
  - `object-position:center center`;
  - nền đen, không border;
- TikTok Watch native core dùng `place-items:center`;
- stage vẫn dùng ratio thật do metadata; landscape nằm giữa và letterbox nếu cần;
- PWA **v90**.

Production verify:
- Deploy 1988 Player run `37145430565`: **SUCCESS**;
- frontend contracts, build, deploy và custom-domain verify PASS.

Rule:
- TikTok VOD player thật phải luôn `contain + center`;
- không dùng intrinsic video pixels làm kích thước layout;
- `object-fit:cover` chỉ dành cho thumbnail/card, không được áp vào Watch VOD.

Impact:
- UI/CSS only;
- không đổi API, resolver, LIVE, polling, Supabase/Cloudflare/Render.

Rollback:
- `9eca8ad3717573370d730ccb21d00611f9545376`.

### 3.15. TikTok Watch navigation + exact ratio + mobile smart entry

Thời gian: **2026-10-04**.

Ảnh đối chiếu TikTok web cho thấy ba hành vi cần khóa:
- TikTok Watch có mũi tên ↑/↓ và wheel/swipe để đổi video;
- player giữ đúng tỷ lệ media thật, không ép mọi VOD thành 9:16/16:9;
- mobile hẹp phải vào nội dung ngay: LIVE thật nếu có, nếu không thì video mới nhất theo kênh.

Root cause:
- `playTikTokVideo()` đã có aspect ratio nguồn nhưng snap về 9:16/16:9;
- CSS YouTube-shell tiếp tục ép Watch `aspect-ratio:9/16`;
- preview LIVE/VOD dùng `object-fit:cover`;
- LIVE thiếu cover thật có fallback sai sang cover VOD mới nhất;
- TikTok workspace mobile mặc định mở profile/grid thay vì video.

Patch:
- `dcef5e9190fd021b3432df11f96421cd8f9b9e23`:
  - VOD giữ `sourceRatio`, `loadedmetadata` commit ratio thật qua `commitCurrentAspect`;
  - Watch CSS dùng `--media-ratio`; landscape được mở rộng riêng;
  - LIVE/VOD preview chuyển sang `object-fit:contain`;
  - bỏ hoàn toàn fallback LIVE → latest VOD cover; chỉ dùng LIVE-origin cover/preview hoặc canonical avatar;
  - thêm `tiktokSmartWatchSequence()`: mỗi channel một item, LIVE thay newest VOD của cùng channel;
  - Watch có ↑↓, wheel, ArrowUp/ArrowDown, swipe dọc;
  - mobile ≤656 khi mở TikTok không có explicit handle: LIVE playable đầu tiên → nếu không có thì latest VOD;
  - queue hiển thị LIVE pill và dùng cùng sequence.
- `07fbf33f156cd8294f9ad3645dc263349f97e9d0`:
  - sửa regression trước deploy: profile thumbnail grid phải giữ cố định 9:16; chỉ Watch player dùng ratio thật;
  - PWA v88.
- `c3401f112146ea2e9c78664bef30942f29a3ce6e`:
  - mobile smart landing ≤656px được coi là một LIVE-aware surface khi visible;
  - chạy đúng một `runTikTokLiveCycle({smartLanding:true})` trước khi chọn item đầu;
  - hidden / đóng web / không ở TikTok mobile thì không scan;
  - không tạo timer/cron mới;
  - PWA **v89**.

Production verify:
- Deploy 1988 Player run `37145155222`: **SUCCESS**;
- frontend contracts, artifact build, deploy và custom-domain verify đều PASS.

Resource/data:
- không thêm endpoint/polling/cron;
- mobile smart entry chỉ dùng TikTok library + LIVE snapshot vốn đã được TikTok workspace tải;
- không thêm table/cache;
- không ghi ảnh LIVE/VOD mới vào canonical.

Rule:
- TikTok Profile grid = 9:16 presentation card.
- TikTok Watch = exact source ratio + `object-fit:contain`; cấm snap ratio để lấp khung.
- LIVE cover = LIVE-origin only; thiếu thì avatar, không dùng VOD cover.
- Navigation ↑↓ / wheel / swipe phải đi qua cùng `tiktokWatchSequence`.
- Mobile TikTok landing visible chạy một demand cycle LIVE trước, rồi ưu tiên LIVE playable; nếu không có thì latest VOD per channel.

Impact:
- Browser/UI/player orchestration only.
- Rollback: `2ff42dce666e0110cc2169da7bd8e5f34d99e1c7`.

### 3.14. TikTok YouTube-shell — Profile + Shorts-style Watch

Thời gian: **2026-10-04**.

Yêu cầu:
- TikTok dùng cùng ngôn ngữ giao diện với YouTube/1988 thay vì một workspace riêng;
- Profile giống channel page: sidebar trái, banner, avatar, stats, tabs, grid video dọc;
- Watch giống Shorts: portrait viewer ở giữa, action rail cạnh video, thông tin kênh + queue;
- không đổi data/API/player owner.

Patch:
- `3e964bd5321bb57bff09125fcf73284ce7f43bc6`:
  - thêm `TIKTOK YOUTUBE-SHELL v1`;
  - Profile: banner từ thumbnail/video mới nhất (fallback avatar), profile header, bio/stats, follow pill, tabs, dedicated portrait grid;
  - sidebar dùng chính danh sách LIVE + followed canonical hiện có;
  - Watch: `tiktokWatchActions`, like/comment counts từ metadata hiện có, share dùng navigator.share/clipboard;
  - current video bị loại khỏi queue;
  - không thêm endpoint hay polling.
- `1e3814b0b2bf3d3ffbaa97569abccce8cabd0dcf`:
  - ≥1280px Watch giữ sidebar trái + viewer + queue giống YouTube desktop;
  - 1000–1279px giữ focused viewer + queue;
  - 657–999px không reserve top-boundary;
  - ≤656px mới reserve fixed header;
  - PWA **v86**.

Responsive contract:

```text
PROFILE
>=1000  : sidebar + channel page
657-999 : channel page, không sidebar, 3-column portrait grid
<=656   : channel page, 2-column portrait grid

WATCH
>=1280  : sidebar + portrait viewer/action rail + queue
1000-1279: portrait viewer/action rail + queue
657-999 : viewer/action rail + queue dưới, không double top gap
<=656   : fixed-header offset + viewer/action rail + queue dưới
```

Production verify:
- Deploy 1988 Player run `37144284111`: **SUCCESS**;
- frontend contracts, artifact build, deploy và custom-domain verify đều PASS.
- Backend/data không đổi:
  - Supabase canonical giữ nguyên;
  - Cloudflare LIVE demand-only giữ nguyên;
  - Render TikTok resolver/library giữ nguyên;
  - không thêm request nền.

Rule:
- TikTok và YouTube dùng cùng visual shell, nhưng không trộn owner/data model.
- Profile banner chỉ là presentation từ ảnh đã có; không lưu thêm ảnh/banner canonical.
- Action rail chỉ dùng metadata hiện có; không fan-out API theo card.
- Mobile/tablet breakpoint phải tuân fixed-header rule chung của 1988.

Impact:
- UI/JS presentation only.
- Rollback UI: `d02ed181d0e244b676b923ebf3cf2959acaa77a3`.

### 3.13. Portrait viewer compact — thu nhẹ + bo 4 góc

Thời gian: **2026-10-04**.

Ảnh production so với YouTube Shorts cho thấy:
- portrait Watch đang chạm gần sát hai mép viewport;
- cảm giác video dọc bị phóng quá lớn dù tỷ lệ media đúng;
- user muốn thu nhẹ, không đổi thành Shorts nhỏ hẳn.

Patch:
- commit `1c989c9042ccef94cda1e6597b1b178e435b662a`;
- chỉ portrait one-column Watch:
  - `width:min(calc(100% - 32px),480px)`;
  - căn giữa bằng auto margins;
  - stage/player/iframe bo đủ 4 góc bằng `--floating-radius`;
- landscape viewer giữ full-width;
- TikTok dedicated watch layout không đổi;
- PWA **v84**.

Production verify:
- Deploy 1988 Player run `37143714726`: **SUCCESS**;
- frontend contracts, artifact build, Pages deploy và custom-domain verify đều PASS.

Rule:
- portrait one-column Watch được phép compact nhẹ để cân thị giác;
- không zoom/crop media để tạo cảm giác nhỏ hơn;
- landscape không bị ảnh hưởng;
- mức compact hiện tại = 16px biên mỗi bên trên mobile, cap 480px.

Impact:
- UI/CSS only; không đổi data/network/polling.
- Rollback: `ebfd45193840870b3ef55e3b73031c39b4799d3e`.

### 3.12. Mid-width viewer gap — 657–999px double top-boundary

Thời gian: **2026-10-04**.

Ảnh production sau v82 cho thấy ba breakpoint:
- ≤656px: viewer đúng, fixed header cần `--top-boundary`;
- 657–999px: xuất hiện khoảng đen lớn giữa chip row và video;
- ≥1000px: viewer + queue desktop đúng.

Root cause:
- v82 áp `padding:var(--top-boundary)` cho toàn bộ `@media(max-width:999px)`;
- nhưng header chỉ chuyển sang `position:fixed` ở `max-width:656px`;
- 657–999px header vẫn nằm trong document/sticky flow, nên top-boundary bị cộng **hai lần**.

Patch:
- commit `e7d4817319c8ca22e78d8e3e4fc9898b3c6e9ce4`;
- 657–999px focused viewer: `main padding:0`;
- ≤656px focused viewer: `main padding:var(--top-boundary) 0 0`;
- portrait bottom radius fix giữ nguyên;
- PWA **v83**.

Production verify:
- Deploy 1988 Player run `37143464690`: **SUCCESS**;
- frontend contracts, artifact build, Pages deploy và custom-domain verify đều PASS.

Rule:
- chỉ breakpoint thật sự dùng fixed chrome mới reserve `--top-boundary`;
- không dùng cùng một top padding cho toàn bộ one-column range;
- breakpoint 657–999px phải liền chip row → viewer, không có spacer đen.

Impact:
- UI/CSS only; không đổi data/network/polling.
- Rollback: `328643014793ce9cf84196615636fb9d4e32a4ae`.

### 3.11. Mobile viewer geometry — header overlap + portrait bottom radius

Thời gian: **2026-10-04**.

Ảnh production cho thấy:
- landscape Watch chỉ lộ phần dưới của video, giống bị hụt phần trên;
- portrait Watch đúng tỷ lệ nhưng 2 góc dưới vẫn bo như card cũ.

Root cause:
- Focused Viewer v1 đã đặt `html.viewer-active.one-col main { padding:0 }`;
- mobile header/subnav vẫn là `position:fixed`;
- stage 16:9 vẫn đúng kích thước, nhưng phần đầu stage nằm **sau fixed header/chips**, nên ảnh ngang nhìn như bị cắt;
- portrait vẫn kế thừa rule cũ `border-radius:var(--floating-radius)` ở stage/player/iframe.

Patch:
- `2f6b6b7336ce08f63a5c0cd02a30d221b7c47958`:
  - mobile focused `main` reserve `padding-top: var(--top-boundary)`, là chiều cao header thật do `syncBoundaries()` đo;
  - portrait focused stage/player/iframe dùng radius `top-left/top-right = floating-radius`, `bottom-left/bottom-right = 0`.
- `f59a5983114d405aa30095f37d17ab49cc9a79af`: regression contract cho top-boundary + portrait bottom corners.
- `d8d05638e1577c9fa5e42f13ccfca066a8826312`: PWA **v82**.

Production verify:
- Deploy 1988 Player run `37143236812`: **SUCCESS**;
- `Test frontend production contracts`, artifact build, Pages deploy và custom-domain verify đều PASS.
- Rail Media Core / `--rail-black` **không sửa**: ảnh ngang lỗi do chrome overlap, không phải rail crop.

Data/resource impact:
- UI/CSS only; không thêm network/polling/job/data.
- Không đổi Supabase/Cloudflare/Render.

Rollback:
- base trước geometry fix: `e1bc04acc973069b7477134af1036c44f18cb975`.

Rule:
- mobile focused viewer luôn bắt đầu **sau measured `--top-boundary`**, không đặt dưới fixed chrome;
- portrait main viewer: 2 góc dưới phẳng để media nối liền metadata;
- không dùng crop/PiP fix để chữa lỗi layout header overlap.

### 3.10. Focused viewer — hợp nhất mobile / desktop / TikTok

Thời gian: **2026-10-04**.

Lý do:
- sau thời gian sử dụng, hai cách xem “1 cột / 2 cột” và auto PiP làm người dùng phải chú ý vào trạng thái giao diện thay vì nội dung;
- TikTok/YouTube có cùng mục tiêu chính: **bấm để xem**; PiP/thu nhỏ chỉ là phụ trợ, không được là flow mặc định.

Owner:
- **Browser/UI only**.
- Không đổi Supabase data/package, Cloudflare discovery, Render resolver hay scheduler.

Contract mới:

```text
BROWSE
mobile hẹp → feed 1 cột
màn rộng → responsive grid

WATCH — YouTube + TikTok
→ một permanent viewer
mobile → viewer trên + queue 1 cột phía dưới
desktop → viewer + queue 1 cột bên phải
video đang xem không lặp lại trong queue
scroll / feed rerender → player vẫn ở viewer
không tự inline vào thumbnail
không tự bật PiP khi cuộn
```

Patch:
- `0d8dc4cddce80beaffa35af6833ae5cf0d5e1872`: thêm `FOCUSED VIEWER v1`; viewer-active; mobile viewer + queue; desktop queue 1 cột; click/deep-link quay về permanent stage; `syncPip()` chỉ cleanup.
- `03343fcc7437931dd9ab97a807dfb71b44f3e9b4`: contract test cho focused viewer.
- `8d46e7c3c6d3fe52712944668aa9d4e692948c1f`: bỏ đường legacy có thể reattach player về thumbnail/PiP sau feed rerender.
- `3c9960a45fc521bfe2e3d27fa6021d34db186dcc`: khóa regression rerender.
- `369227f1b51f197b37c254fb594af2ee1699265e`: TikTok watch dùng cùng focus contract — account rail chỉ còn ở browse/profile; watch = viewer + queue.
- `f7261d8de0cd0bd1cfbb1cf1d3075153c6b17760`: ẩn current card khỏi desktop queue.
- `0f3e763033a9459c11283bbc2af353936629199e`: contract TikTok watch.
- `bc0e4be747915b0539eafe6079fa0ddecdd0b3a4`: PWA **v81**.

Production verify:
- final frontend contract + build + Pages/custom-domain deploy run `37142665800`: **SUCCESS**.
- PWA production revision: **v81**.
- active primary flow không còn caller chuyển player sang inline thumbnail/PiP; các helper PiP/inline cũ còn trong source như compatibility/dormant code nhưng regression test khóa không cho primary flow gọi lại.
- không có thay đổi polling/network/data nên thay đổi UI này **không tăng Supabase/Cloudflare/Render traffic**.

Rollback:
- base trước focused-viewer: `909d7eaf68421bdc72f1f9badc9cbd93aa63acab`.

Rule khóa:
- **Browse = responsive. Watch = one viewer + one queue.**
- Cấm tái tạo “mobile media mode / desktop media mode” như hai hành vi playback khác nhau.
- Cấm auto-PiP/inline-thumbnail do scroll hoặc feed rerender.
- TikTok account rail không chen vào lúc watch.

### 3.9. Chặn legacy browser tải full source-state

Thời gian: **2026-10-04**.

Audit trước sửa:
- cửa sổ 97 phút gần nhất có **124 browser request** gọi `yt1988-state` không có `?view=...`;
- nhóm này trả khoảng **6.82 MB** response, trung bình ~55 KB/request;
- toàn bộ caller là browser/PWA cũ, không phải Cloudflare/Render/server;
- rule cũ vẫn giữ default `full` “để tương thích client cũ”, nên chính client cũ có thể tiếp tục đốt egress dù MAIN mới đã dùng manifest/lite.

Patch:
- commit `745d74898bdaad2f5623f5f432a0afb7884f4d8c`: `yt1988-state` public GET canonicalize:
  - `view=manifest` → manifest;
  - `view=library` → library;
  - `view=lite`, không có view, `view=full`, view lạ → **lite**.
- `yt1988-state v14` ACTIVE.
- PWA cache bumped `v77`, sau contract repair bumped tiếp `v78`.
- contract khóa: cấm quay lại `searchParams.get("view") || "full"`.

Trong lúc verify, frontend contract phát hiện một lỗi schema thật ở `yt1988-refresh`:
- query source-state cũ vẫn xin `name,thumbnail_url,subscribers` dù DB đã drop các cột này;
- source suggestion writer cũng còn cố ghi name/avatar vào `yt1988_source_state`.

Fix:
- commit `bb5118bc7dab22b74e90fd6358fb70273a412529`;
- source-state read chỉ lấy `scope,channel_id,status,version,updated_at`;
- suggestion identity ghi vào `yt1988_channel_directory` trước;
- source-state suggestion row chỉ giữ ID + state;
- `yt1988-refresh v31` ACTIVE.

Production verify:
- Supabase pg_net request `585` = GET no-view → HTTP 200, body **24,781 bytes**, response `"view":"lite"`;
- request `586` = GET `?view=lite` → HTTP 200, body **24,781 bytes**, response `"view":"lite"`;
- no-view và explicit lite có cùng payload size/shape; full-library path không còn được gọi bởi default/legacy GET;
- full frontend contract + Pages/custom-domain deploy run `37141879904`: **SUCCESS**;
- PWA cache production: `v78`.

Rule khóa:
- **public default/full source-state không còn tồn tại**;
- backward compatibility = trả compact `lite`, không phải trả monolithic full payload;
- full canonical library chỉ qua explicit `view=library` ở `/sources/`;
- source-state table = membership/state only; identity luôn ở channel directory.

### 3.8. Chuẩn hóa channel identity + dọn duplicate Supabase

Thời gian: **2026-10-04**.

Audit production trước sửa:
- YouTube `yt1988_source_state`: 723+ rows; 677 name copy, 677 avatar copy; 2 name mismatch và 60 avatar mismatch so với canonical directory.
- `yt1988_channel_cache`: 267+ rows; 264 avatar copy; 48 avatar mismatch; 7 cache-only channel chưa có directory row.
- `yt1988_user_state`: 592 `avatars` + 592 `customSources`, JSON khoảng 168 KB.
- TikTok: 173 canonical channel; cả 173 có unique `user_id` và `sec_uid`, nhưng PK vẫn là mutable `handle`.
- TikTok LIVE: 177 rows, gồm 4 OFF/UNKNOWN orphan cũ.
- TikTok video-channel: 173 rows và ~746 KB `videos[]` JSON lặp với 1,766 canonical video rows.
- toàn bộ `yt1988_*` trước sửa không có FK.

Owner:
- Supabase canonical schema + `yt1988-state/yt1988-refresh`.
- Render social collector phải tương thích trước khi drop cột TikTok.

Code-first:
- commit `219c16b5760c06b1776fb7c65d83d2d779c9c666`.
- GitHub Actions social collector run `37139967878`: SUCCESS.
- Supabase: `yt1988-state v13` ACTIVE; `yt1988-refresh v29` ACTIVE.
- Render deploy `dep-db0jihmgekts73a0231g`: LIVE, image digest `sha256:d397dd7aa26112e14d05739bdc628d70212898cde258a50be4e30f348c680bb8`.

Production migrations:
- `20261003172108 normalize_youtube_channel_identity`.
- `20261003172252 normalize_tiktok_channel_identity`.
- `20261003172431 harden_normalized_identity_access`.
- `20261003173243 strip_youtube_channel_cache_identity_json`.

Sau sửa:
- YouTube `yt1988_channel_directory(profile_key,channel_id)` = identity canonical.
- `yt1988_source_state` chỉ còn membership/status; không name/avatar/subscribers.
- `yt1988_channel_cache` không còn source_name/thumbnail_url.
- phát hiện lớp legacy ẩn trong `yt1988_channel_cache.items`: 3,965 cached video items vẫn từng mang `_sourceName/_sourceThumbnailUrl/uploader*`.
- commit `d766cfbeda9c6d960f68950da0b18d302bb4d314` khóa writer: trước khi ghi cache JSON, strip toàn bộ channel profile/name/avatar nhưng giữ `channelId/_sourceId`.
- `yt1988-refresh v30` ACTIVE; migration `20261003173243` đã strip dữ liệu cũ.
- verify sau strip: cache items 3,965; channel identity/profile keys = 0; `channelId` = 3,965, `_sourceId` = 3,964; package 820 items vẫn giữ source name/avatar snapshot để render.
- tổng `pg_column_size(items)` của channel-cache sau strip khoảng 791 KB.
- source-state + channel-cache có FK về channel-directory; orphan = 0.
- legacy `user_state.avatars/customSources` = 0; user-state payload còn khoảng 23.7 KB.
- TikTok `yt1988_tiktok_channels.id UUID` = PK stable; `handle` unique alias; `user_id/sec_uid` unique external IDs.
- LIVE + video-channel PK = `channel_id`; all 1,766 videos có `channel_id` FK; null/orphan = 0.
- bỏ duplicate `live_channels.selected`, `video_channels.sec_uid/videos`, canonical `channels.live_*`, và table `yt1988_tiktok_live_selected`.
- 4 stale orphan LIVE rows đã xóa; LIVE state rows 177 → 173.
- 105 expired MP4 signed URL đã clear.
- compatibility upsert transaction test: PASS + ROLLBACK; trigger `handle → channel_id` bind đúng.

Package exception:
- YouTube/TikTok prepared package vẫn được phép chứa name/avatar/profile snapshot để UI render nhanh.
- Package chỉ là read snapshot; **không được ghi ngược làm canonical identity**.
- Channel-cache JSON **không phải package**: cache chỉ giữ video state + stable channel IDs, không giữ channel profile snapshot.

Security/performance follow-up:
- thêm covering index `yt1988_source_state(profile_key,channel_id)`.
- 2 RPC source-state đã chuyển SECURITY INVOKER và chỉ grant EXECUTE cho service_role.
- advisor không còn cảnh báo unindexed FK mới; các SECURITY DEFINER warning còn lại là legacy functions ngoài phạm vi incident này và phải audit riêng trước khi thay.

Rule khóa:
```text
YouTube: channel_id -> yt1988_channel_directory -> ONE name/avatar truth
TikTok: stable UUID id -> yt1988_tiktok_channels -> ONE profile/avatar truth
State/cache = IDs + state only
Package = denormalized read snapshot only
```

### 3.7. Incident — TikTok LIVE cron source có thể bật lại sau deploy

Thời gian: **2026-10-03**.

Triệu chứng / sai lệch:
- rule production đã khóa **TikTok LIVE demand-only / schedule count = 0**;
- nhưng `cloudflare/tiktok-live-state/wrangler.toml` vẫn còn `crons = ["* * * * *"]`;
- Worker vẫn export `scheduled()`;
- workflow TikTok dùng `wrangler deploy` trực tiếp nên một deploy sau này có thể cài cron 1 phút trở lại dù trước đó đã dùng one-shot workflow để xóa schedules.

Owner:
- **Cloudflare TikTok LIVE Worker + deploy workflow**.
- Không sửa Supabase/UI/Render data.

Patch code chính:
- commit `0ebbc3e6725eead7510fb5fa7e1d5db34efd35d6`;
- `wrangler.toml`: `crons = []`;
- bỏ `scheduled()` khỏi Worker;
- thêm `demand-only-contract.test.cjs`;
- deploy workflow chạy cả video-fingerprint + demand-only contracts;
- sau deploy workflow chủ động PUT Worker schedules về `[]` và GET verify schedule count = 0;
- `cloudflare/tiktok-live-state/README.md` đổi từ cron/minute sang demand-only: visible TikTok LIVE gọi bounded `/sweep`; hidden/closed không discovery.

Production verify:
- workflow **Deploy TikTok Live State Edge** run `37138771030`: **SUCCESS**;
- step `Test edge contracts`: SUCCESS;
- step `Deploy Worker`: SUCCESS;
- step `Enforce zero LIVE schedules`: SUCCESS;
- Cloudflare schedules API trong workflow xác nhận runtime schedule count = **0**.
- Probe trực tiếp `workers.dev` từ môi trường ChatGPT bị DNS block, nên không dùng probe đó để kết luận runtime lỗi; bằng chứng deploy + Cloudflare schedules API là authoritative cho thay đổi scheduler này.

Data impact:
- không đổi Supabase rows/package/canonical data;
- không thêm polling;
- bỏ hẳn discovery tự chạy khi không có người mở LIVE.

Rollback:
- code runtime về `49892fd1bd086ae36d3f67a7e84ea44d067358d6` nếu cần, nhưng phải giữ schedule count = 0 theo production rule.

Rule mới khóa:
- source config, Worker export và deploy workflow phải cùng nói **demand-only**;
- không được chỉ xóa cron ở dashboard rồi để source có thể bật lại ở deploy sau;
- TikTok LIVE membership hiện canonical ở `yt1988_tiktok_channels.selected`, không dùng cùng schema scoped source-state của YouTube.

### 3.6. Kiến trúc host/data/action đã khóa — giảm invocation/Egress

Thời gian: **2026-10-03**.

Mục tiêu:
- không để cùng một dữ liệu có nhiều owner;
- không để một user action sinh nhiều job/wake;
- giảm Edge Function invocation/log trước khi chạm giới hạn host.

Contract:
```text
GitHub = CODE
Supabase = TRUTH + CURRENT PACKAGE
Cloudflare = REALTIME + EDGE CACHE + BOUNDED RESOLVER/RELAY
Render = HEAVY TIKTOK SESSION/RESOLVER
Browser = LOCAL CACHE + RENDER + DEMAND TRIGGER
```

Chi tiết: `README_HOST_ARCHITECTURE.md`.

Các thay đổi production:
- MAIN non-LIVE:
  - latest chỉ wake package tối đa 1 lần/5 phút;
  - week tối đa 1 lần/30 phút;
  - content/hashtag tối đa 1 lần/15 phút;
  - focus/visibility vẫn được check manifest nhưng không reset cadence.
- `yt1988 v6`:
  - search/channel result chỉ reuse `yt1988_video_meta` đã cache;
  - **không còn background fan-out `yt1988-video-meta?resolve=1` cho mọi card thiếu aspect**;
  - aspect thiếu chỉ resolve khi video thật sự được mở.
- YouTube LIVE:
  - Cloudflare scan là realtime owner;
  - Worker snapshot changed → Worker wake LIVE package;
  - recurring browser scan/focus/source edit chỉ đợi hash, không tạo thêm package wake;
  - chỉ `tab-open` được phép một catch-up wake để chữa package stale.
- `yt1988-state v12`:
  - non-LIVE source edit refresh đúng scope đó;
  - LIVE membership chỉ qua targeted Cloudflare source-sync;
  - Cloudflare snapshot changed mới wake LIVE package;
  - bỏ race `refresh LIVE stale snapshot → targeted sync → refresh LIVE lần 2`.
- PWA cache: `v76`.
- `src/channel-library.js` chứa 744 channelId nhưng đã xác nhận là **legacy generated seed**; production `index.html` và `/sources/` không load file này.

Production verify đã có:
- Search probe `bao tien phong` sau `yt1988 v6`: HTTP 200; sau request không phát sinh server-side video-meta warm call.
- Source edit probe request 577:
  - HTTP 200;
  - Cloudflare đọc `state-lite` ~16 KB;
  - không có `yt1988-refresh` trực tiếp từ source edit trong cửa sổ verify.
- Supabase cron chỉ còn:
  - Render health keepalive 12 phút/lần;
  - retention cleanup 1 lần/ngày;
  - không có package/LIVE discovery cron.
- Final frontend contract/deploy run `37137967816`: **SUCCESS toàn bộ** — tests, build, Pages deploy và custom-domain verify đều PASS.
- Runtime cuối:
  - `yt1988 v6` ACTIVE;
  - `yt1988-state v12` ACTIVE;
  - PWA `v76`.

Rule:
- Search/channel API không được tạo background work theo số card trả về.
- Một LIVE event chỉ có một wake owner.
- Hash/version trước payload.
- GitHub static channel/video fixture không được trở thành canonical production data.
- DB size hiện không phải bottleneck; ưu tiên giảm response bytes + invocation + log.
- TikTok LIVE: `yt1988_tiktok_channels.selected` là membership canonical; Cloudflare scan demand-only; Worker/deploy phải giữ schedules = 0.

### 3.5. Incident mới nhất — Egress tăng do full source-state bị tải lặp

Thời gian: **2026-10-03**.

Triệu chứng:
- Supabase Free plan Egress tăng lên **1.49 / 5 GB**.
- Log 6 giờ gần nhất trước sửa:
  - `yt1988-state`: 1,545 request;
  - response khoảng **228.4 MB**;
  - chiếm phần lớn Edge Function response bytes.
- Cloudflare YouTube LIVE và browser đều đang GET full `yt1988-state`.
- Full response chứa source-state + 1,231 YouTube channels + 173 TikTok channels + profile/description/stats nên mỗi lần có thể ~0.5 MB.

Contract mới:
```text
MAIN
→ GET state manifest nhỏ
→ stateHash không đổi: dùng cache
→ stateHash đổi: GET state-lite

Cloudflare YouTube LIVE
→ chỉ GET state-lite
→ selected/blocked/suggested ids + source labels/LIVE keywords
→ không channelLibrary/TikTok profile

/sources/
→ IndexedDB: manifest + lite + library
→ luôn check manifest nhỏ
→ stateHash đổi mới tải lite
→ libraryHash đổi mới tải channel library
```

Patch:
- `yt1988-state`:
  - `?view=manifest`;
  - `?view=lite`;
  - `?view=library`;
  - default full giữ để tương thích client cũ.
- lite không còn `channelLibrary`, TikTok profile, description/stats, `customSources`/avatar duplicate.
- `libraryHash` chỉ phụ thuộc channel directory + TikTok profile; chọn/chặn kênh không làm tải lại library.
- MAIN dùng manifest + local lite cache; không prime full channelLibrary ở startup.
- `/sources/` cache library trong IndexedDB `yt1988-source-cache-v1`.
- Cloudflare Worker dùng `STATE_URL+"?view=lite"`.
- PWA cache `v74`; `sources.js?v=22`.
- `yt1988-state v11` ACTIVE.

Production measurements:
- manifest raw JSON: **236 bytes**.
- lite raw JSON: **24,723 bytes** sau tối ưu; trước đó 256,089 bytes.
- Cloudflare production targeted sync log: URL `?view=lite`, transmitted content length khoảng **16,275 bytes**.
- library raw JSON hiện ~1.40 MB, nhưng chỉ tải khi mở `/sources/` và `libraryHash` thay đổi.
- targeted LIVE sync Dân Ca Lofi vẫn HTTP 200, không full scan.
- frontend deploy run `37136133606`: SUCCESS.

Rule:
- MAIN/Cloudflare **cấm GET full yt1988-state**.
- Full channel library chỉ thuộc source manager.
- Source selection/block chỉ đổi stateHash, không đổi libraryHash.
- Library cache invalidation chỉ khi canonical channel/TikTok profile data thay đổi.
- Khi hash không đổi, không tải lại payload lớn.

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


### 3.26. TikTok demo — Bhwa/VoidFetch direct getlink, reuse-until-dead
- Bhwa và VoidFetch frontend dùng chung public backend `https://downloader-api.bhwa233.com`.
- Source upstream mô tả TikTok download theo hướng no-watermark; demo không suy diễn watermark từ tên host mà expose direct candidates để test.
- Thêm nguồn `Bhwa GetLink`: browser gọi trực tiếp `/api/parse?url=<TikTok URL>`, thu `originDownloadVideoUrl`, `downloadVideoUrl`, video/page candidates.
- Ưu tiên `originDownloadVideoUrl` khi có; UI hiển thị tất cả candidate để thử thủ công.
- Direct URL được lưu localStorage không TTL cứng; chỉ xóa khi video thực sự lỗi. Với Bhwa GetLink, lỗi media sẽ get mới đúng 1 lần.
- Giữ `Bhwa Play` và `VoidFetch Player` chỉ để đối chiếu; không qua Cloud VOD.
- TikTok LIVE rule 3.23 không đổi.


### 3.27. TikTok demo — direct-only TikWM + Bhwa
- Bỏ Bhwa Play và VoidFetch Player khỏi nguồn VOD demo; chúng chỉ là wrapper/player và có thể hiển thị UI/logo riêng.
- Nguồn chính còn TikWM HD, TikWM Standard và Bhwa Direct.
- TikWM tuyệt đối không dùng `wmplay`; chỉ `hdplay/play`.
- Bhwa Direct gọi browser-side `https://downloader-api.bhwa233.com/api/parse?url=<TikTok URL>`.
- Ưu tiên `originDownloadVideoUrl`, sau đó `downloadVideoUrl`; direct CDN/MP4 được ưu tiên hơn wrapper `/api/play` hoặc `/api/download`.
- Direct URL được gán thẳng vào native `<video>`; player VoidFetch/TikTok không nằm trong nhánh Bhwa Direct.
- Link lưu tới khi media thực sự lỗi; link chết mới xóa/get lại đúng 1 lần.
- Mục tiêu là lấy media no-watermark/no-player-overlay. Backend Bhwa public UI mô tả TikTok download no-watermark; việc một candidate cụ thể có watermark bake vào pixels vẫn phải xác nhận bằng phát thực tế.
- TikTok LIVE không đổi.


### 3.28. TikTok demo — TikTok PlayAddr thử trực tiếp + hạ Bhwa xuống fallback
- Ảnh test production xác nhận Bhwa Direct có thể trả video có watermark TikTok bake trong pixels.
- Không còn mô tả Bhwa là nguồn no-watermark đáng tin cậy.
- Upstream `bhwa233/galaxy-downloader` từng thêm mô tả TikTok no-watermark rồi commit `a7f507b...` bỏ mô tả đó; issue #31 cũng ghi nhận trường hợp TikTok tải có watermark.
- TikWM HD/Standard vẫn là nguồn sạch chính và tuyệt đối không dùng `wmplay`.
- Thêm nguồn thử `TikTok PlayAddr`: browser gọi trực tiếp `https://www.tiktok.com/node/share/video/<id>`, lấy `itemStruct.video.playAddr` hoặc bitrate `PlayAddr.UrlList`.
- Không Cloud/Render cho VOD PlayAddr. Nếu TikTok chặn CORS/endpoint thì chỉ báo lỗi nguồn này.
- Bhwa giữ làm fallback và UI ghi rõ `có thể logo/watermark`.
- LIVE không đổi.
