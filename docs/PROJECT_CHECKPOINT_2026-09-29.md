# PROJECT CHECKPOINT — 1988 / yt.taphoa.xyz

Ngày chốt: **2026-09-29**  
Production repo: `1sl2tp/1988`  
Production branch: `main`  
Checkpoint source commit: `15bc1ac91bd57e71aef6bffc9305968902413d62`  
Backup branch cố định: `backup-2026-09-29-0137-stable`

## 1. Mục đích của dự án

1988 là web/PWA xem YouTube theo hướng **đơn giản, nhanh, mobile-first nhưng dùng tốt trên PC**, tránh tái tạo toàn bộ YouTube. Mục tiêu chính:

- mở video nhanh từ feed hoặc link chia sẻ;
- cùng một player dùng được cho MAIN 1 cột, PiP và MAIN 2 cột;
- server chuẩn bị sẵn dữ liệu/feed, browser chủ yếu chỉ đọc và hiển thị;
- nguồn/kênh được quản lý tập trung ở server, không để mỗi máy tự lọc khác nhau;
- tìm kiếm vẫn có thể đi ra ngoài package hiện có;
- link video phải mở lại được trên máy khác/F5 và tự bù đủ metadata;
- có tải Video / Âm thanh nhưng giữ luồng thật đơn giản.

## 2. Kiến trúc hiện tại

### Frontend

- Hosting: **GitHub Pages**.
- Domain: **yt.taphoa.xyz**.
- Production UI chính: `index.html`.
- API wrapper: `src/api.js`.
- Chuẩn hóa metadata: `src/media-meta.js`.
- PWA: `manifest.webmanifest` + `sw.js`.
- Service worker shell cache hiện tại: `1988-simple-media-v34`.
- Avatar cache riêng: `1988-avatar-assets-v1`.

`index.html` hiện vẫn là file lớn (~200 KB) và đang chứa phần lớn CSS + layout + logic feed/player/menu.

### Backend / dữ liệu

Backend chính là **Supabase Edge Functions + database**.

Các function quan trọng của 1988 đang chạy:

- `yt1988` — API điều phối search/video/meta/media; runtime **v32**.
- `yt1988-packages` — manifest + package feed; runtime **v8**.
- `yt1988-refresh` — server refresh/chuẩn hóa feed; runtime **v63**.
- `yt1988-state` — trạng thái nguồn selected/blocked theo scope; runtime **v10**.
- `yt1988-topics` — topic/source management; runtime **v25**.
- `yt1988-video-meta` — cache aspect/video meta; runtime **v2**.
- `yt1988-getlink` — tải Video/Âm thanh hiện tại; runtime **v2**.

Runtime source của `yt1988 v32` và `yt1988-getlink v2` đã được sync ngược vào repo trong checkpoint này.

## 3. Luồng dữ liệu tổng quát

```text
YouTube / Piped / nguồn đã chọn
        ↓
Supabase yt1988-refresh
        ↓
lọc + chuẩn hóa + dedupe + scope
        ↓
yt1988_packages / manifest hash
        ↓
yt1988-packages
        ↓
Browser/PWA
  IndexedDB → RAM packageCache
        ↓
render card / feed / player
```

Nguyên tắc quan trọng đang dùng: **server là nơi quyết định feed**, browser không tự xây lại feed riêng.

## 4. Package / đồng bộ dữ liệu trên máy

Đây là hướng đúng và nên giữ.

Client dùng:

- `packageManifest`;
- `packageCache` trong RAM;
- `packageHashCache`;
- IndexedDB database `yt1988-packages-v1`.

Cơ chế hiện tại:

1. Khi mở app, máy khôi phục package hoàn chỉnh gần nhất từ IndexedDB trước.
2. UI của tab chỉ đọc RAM package; bấm tab không trực tiếp gọi mạng để tự dựng feed.
3. Manifest server chứa hash của từng scope.
4. Client so hash local với hash server.
5. Hash khác mới tải package hoàn chỉnh.
6. Chỉ sau khi tải + parse + normalize + kiểm hash xong mới swap package mới vào RAM/IndexedDB.
7. Nếu tải lỗi/mất mạng giữa chừng thì vẫn giữ package hoàn chỉnh cũ.
8. Khi app đang mở, client kiểm manifest khoảng **5 giây/lần** nếu tab đang visible.
9. Khi quay lại app từ background, client kiểm lại manifest.

Đây là cơ chế phù hợp với yêu cầu: **máy chỉ tải package đã chuẩn bị, server mới là nơi lọc/sắp xếp nguồn**.

## 5. Scope / nguồn dữ liệu

Các scope nền tảng:

- `live` → Live;
- `latest` → Ngày;
- `week` → Tuần;
- các scope do quản lý nguồn tạo: Nhạc, Phim, Hài, Teen, Kid, Review, Sinh tồn, Khám phá, SHOWS, Showbiz, Công nghệ, Thể thao...

Tên tab được đọc từ `yt1988-state` và cache local để header có thể vẽ ngay khi reload.

### Quản lý nguồn

Nguồn có trạng thái theo từng scope:

- `normal`;
- `selected`;
- `blocked`.

Khi admin đổi trạng thái trên card:

```text
UI → yt1988-state → server state → yt1988-refresh/package → manifest hash đổi → máy tự tải package mới
```

Điểm đúng ở kiến trúc này là **user thường không tự sửa nguồn**, thay đổi là dữ liệu tập trung và mọi máy đọc chung kết quả server.

### Cảnh báo bảo mật

Hiện frontend chứa:

`SOURCE_ADMIN_PIN="8881"`

và gửi PIN qua header `x-1988-pin`.

Vì mã frontend là public nên PIN này **không phải bảo mật thật**. Nó chỉ ngăn thao tác vô tình. Nên đổi sang session/auth server-side ở giai đoạn sau, nhưng không nên làm cùng lúc với các sửa layout/player đang ổn.

## 6. Piped đang được dùng như nào

**Piped không phải UI chính và không nên để browser phụ thuộc trực tiếp vào một instance Piped cụ thể.**

Hiện Piped chủ yếu được dùng ở backend cho:

- search;
- metadata video/kênh;
- thumbnail/avatar;
- views/duration/uploaded/verified;
- related search;
- một số đường stream/fallback backend cũ.

### Deep-link metadata mới

Trước đây mở URL/F5 có thể thấy player lên trước nhưng thông tin dưới video bị trống vài giây vì `yt1988?action=video` thử stream trước rồi mới fallback metadata.

Checkpoint hiện tại đã thêm:

`action=video_meta`

Luồng mới:

```text
video ID
  ↓
YouTube oEmbed lấy title/author nhanh
  ↓
Piped search title
  ↓
tìm exact video ID
  ↓
bù avatar/channelId/verified/views/date/duration
```

Player tải độc lập song song.

Đây là hướng nên giữ: **metadata không được chờ stream**.

## 7. Video/player — kiến trúc đang dùng

Đây là phần ổn nhất hiện tại và không nên quay lại nhiều player riêng.

### Một media core chung

MAIN 1 cột, PiP và MAIN 2 cột dùng cùng **Rail media core / cùng YouTube player**.

Không dựng một player cho mobile, một player cho PC, một player riêng cho PiP.

### Rail crop

Nguồn YouTube iframe được coi là:

```text
BLACK trên
+ video thật
+ BLACK dưới
```

UI crop viewport để chỉ nhìn phần media thật, **không zoom video để che vùng đen**.

Mốc hiện tại:

- landscape rail: khoảng `65 + 65`;
- portrait rail: khoảng `59 + 59`;
- native YouTube controls giữ lại;
- fullscreen bỏ crop và dùng viewport đầy đủ.

### Aspect

Aspect là thuộc tính của **videoId**, không thuộc mode UI.

Ưu tiên:

1. metadata server đã biết;
2. `videoContentRect` của player xác nhận;
3. correction gửi ngược về `yt1988-video-meta`.

MAIN / PiP / 2 cột cùng đọc một aspect.

## 8. Chia cột

### 1 cột — mobile và PC hẹp

- Video được mở inline trong card đang chọn.
- Thông tin video nằm ngay dưới media.
- Khi cuộn ra khỏi vùng media có thể chuyển sang PiP.
- Card/list là luồng chính.
- Đã sửa lỗi bấm nhanh dấu `…` làm halo nền card nháy trên/dưới.
- Menu được render ẩn → đo vị trí → mới hiện, tránh frame nháy.

### 2 cột — PC rộng

- Cột trái: MAIN player + metadata video đang xem.
- Cột phải: `Tiếp theo · <scope>` + feed.
- Có Auto Play cho video kế tiếp.
- Khi mở deep-link/F5, video ID của URL có quyền ưu tiên, không để item đầu của Live ghi đè.
- Metadata deep-link dùng `video_meta` nhanh song song với player.
- Khi package chứa video đó tải xong, package metadata lại hydrate thêm cho current video.

Đây là layout hợp lý cho PC: **player ổn định bên trái, danh sách hành động nhanh bên phải**, không cần popup/full-screen UI kiểu mobile.

## 9. Card / thẻ video

Card chuẩn hiện có:

- thumbnail;
- duration hoặc badge TRỰC TIẾP;
- avatar;
- title;
- source/channel name;
- verified;
- view;
- published time;
- menu `…`.

Metadata chuẩn hóa đi qua `src/media-meta.js`:

- video ID;
- title;
- sourceId;
- sourceName;
- sourceAvatar;
- thumbnail;
- duration;
- views;
- published;
- watch URL.

Package/server record được coi là record canonical của card. API video chỉ **bù field thiếu**, không được tự ý đổi tên/title đang có từ package.

Thumbnail render ảnh package trước; ảnh chất lượng cao hơn chỉ được thay khi decode xác nhận hợp lệ. Avatar có cache riêng trong service worker.

## 10. Menu / màu

Menu `…`, submenu tải và menu Cài đặt hiện dùng cùng hệ màu với button/chip header:

- base control: `--yt-chip-bg`;
- accent từ `--header-accent-rgb`;
- hover: `--yt-chip-hover`;
- press: `--yt-chip-press`.

Mục tiêu là menu không mang một surface color riêng khác tông với nút.

## 11. Search

Search đang có hai tầng:

### Tầng local/cached

Ưu tiên trả ngay kết quả đã có trong:

- package;
- search cache;
- source hiện tại.

Mục đích: cảm giác search phản hồi tức thì.

### Tầng global backend

Sau đó vẫn gọi `YT1988_API.search(raw,"videos")` để tìm ngoài.

Global search **không bị giới hạn vào source hiện tại**. Local/current-source match chỉ được đưa lên trước để tiện.

Search result chuyển `feedMode="search"`.

Có voice search ở header.

### Hướng đúng

Không nên dùng AI cho search cơ bản. Search tên kênh/video là search deterministic; AI chỉ có ý nghĩa ở lớp gợi ý/phân loại semantic sau này.

## 12. Channel view

Từ menu card có thể **Xem kênh**.

Luồng:

- lấy local video của channel trước;
- chuyển `feedMode="channel"`;
- gọi backend `channel(sourceId)`;
- merge local + fetched;
- có back stack để quay lại feed trước.

Không mở một trang mới độc lập.

## 13. Download Video / Âm thanh

Hướng hiện tại đã đơn giản hóa về **một nguồn duy nhất**.

```text
yt.taphoa video ID
  ↓
yt1988-getlink
  ↓
https://www.youtube.com/watch?v=<ID>
  ↓
GenDownload /api/extract
  ↓
Audio hoặc Video URL
  ↓
browser download
```

Audio ưu tiên format Audio/MP3 mà GenDownload trả.  
Video ưu tiên 720p, sau đó mức phù hợp còn lại.

UI không hiện URL trung gian. Khi bấm dòng Video/Âm thanh chỉ hiện `Đang tải…` ngay bên phải dòng đó.

### Đánh đổi

Đây là **single point of failure** vì chủ động chọn chỉ một provider để giữ code gọn. Nếu GenDownload đổi API thì tải sẽ lỗi; phần xem video/feed không bị ảnh hưởng.

## 14. PWA / cache / deploy

- Service worker shell: `1988-simple-media-v34`.
- GitHub workflow duy nhất: `.github/workflows/pages.yml`.
- Trigger: push `main`.
- Test trước deploy:
  - feed refresh;
  - media core;
  - integration shape;
  - backend media proxy;
  - Python syntax backend yt-dlp;
  - JS syntax các core cũ.
- Sau test mới upload/deploy GitHub Pages.

Bài học đã gặp: test cache version từng hard-code v33 trong khi sw lên v34 → workflow đỏ dù app code không lỗi. Không nên để test cache version lệch khỏi source of truth.

## 15. Những phần đang tốt

### Kiến trúc data

Server authoritative + package hash + IndexedDB + atomic swap là hướng rất tốt. Máy yếu/iPhone cũ không phải chạy lại lọc/merge nặng.

### Media

Một player chung cho 1-col / PiP / 2-col giảm rất nhiều xung đột state so với các nhánh player cũ.

### Deep link

URL có video ID đủ để máy khác mở; metadata giờ có fast path riêng, không phụ thuộc stream.

### Responsive

1 cột và 2 cột đã có vai trò rõ:
- 1 cột = feed/mobile behavior;
- 2 cột = watch + next list.

### Source management

Selected/blocked theo scope ở server là đúng. Không để local device tự quyết định feed.

### Download

Đã bỏ các đường Cobalt/RapidAPI/proxy phức tạp khỏi UI chính. GenDownload hiện là một đường rõ ràng, dễ hiểu và dễ thay nếu sau này cần.

## 16. Những phần chưa tốt / rủi ro

### 1. `index.html` quá lớn

Gần 200 KB và đang ôm quá nhiều trách nhiệm:
- layout;
- CSS;
- player;
- package sync;
- search;
- channel;
- menu;
- download;
- source admin.

Đây là nguyên nhân khiến sửa một phần dễ ảnh hưởng phần khác.

**Khuyến nghị:** chưa tách ngay khi đang ổn; sau khi có test visual/behavior tốt thì tách dần thành module, không rewrite.

### 2. Runtime Supabase từng drift khỏi repo

Một số sửa gần đây deploy thẳng Edge Function nên runtime mới hơn source repo.

Checkpoint này đã sync:
- `yt1988 v32`;
- `yt1988-getlink v2`.

Cần giữ nguyên nguyên tắc từ nay: **deploy runtime xong phải sync source repo ngay trong cùng thay đổi**.

### 3. Function probe cũ còn tồn tại trên Supabase

Runtime còn các function thử nghiệm như:
- `yt1988-download-probe`;
- `yt1988-rapidapi-probe`;
- `yt1988-getlink-probe`;
- `yt1988-fallback-probe`.

Repo production không tham chiếu các slug trên. Nên xóa sau khi xác nhận không có external caller để giảm nhiễu vận hành.

### 4. Piped là dependency không ổn định

Public Piped instance có thể chậm/chết/thay response. Hiện đã giảm ảnh hưởng bằng:
- package server;
- metadata cache;
- oEmbed fast path;
- failover backend.

Hướng tiếp theo nên là **cache metadata theo videoId mạnh hơn**, không gọi Piped lại cho cùng video nếu server đã có record tốt.

### 5. Deep-link vẫn có network hydration

Fast path đã nhanh hơn, nhưng nếu video không nằm trong package/local cache thì vẫn phải gọi mạng để có avatar/view/date.

Có thể cải thiện bằng server-side metadata cache hoặc package index toàn cục theo videoId.

### 6. PIN quản trị nguồn lộ ở frontend

Đây là lỗi kiến trúc bảo mật cần xử lý riêng.

### 7. CSS vẫn có nhiều lớp override theo one-col/two-col

Đã dọn một số lỗi flash/menu nhưng vẫn cần tránh tiếp tục chồng thêm override. Nên ưu tiên variable/token chung thay vì thêm selector mới cho từng bug.

## 17. Hướng phát triển nên giữ từ checkpoint này

1. **Không tạo player thứ hai** nếu không có lý do bắt buộc.
2. **Không để browser tự tổng hợp feed**; server build package, client chỉ sync bằng hash.
3. **Package là canonical card data**; API lookup chỉ bổ sung.
4. **Aspect thuộc videoId** và dùng chung mọi layout.
5. **Piped ở backend**, không bind UI trực tiếp vào một Piped instance.
6. **Search thường không dùng AI**; search local nhanh rồi global backend.
7. **Deep link metadata tách khỏi stream probing**.
8. **Source management tập trung server**.
9. **Download giữ một provider** cho đến khi thực sự cần fallback.
10. Sửa UI nhỏ phải ưu tiên loại bỏ nguyên nhân repaint/rerender, không thêm overlay/layer mới để che lỗi.
11. Khi thêm feature, giữ mobile 1-col và PC 2-col cùng một state/data model, chỉ khác bố cục.
12. Mọi Edge Function đang chạy production phải có source tương ứng trong repo.

## 18. Việc nên làm tiếp theo

Ưu tiên theo thứ tự:

1. Xác minh bản mới deep-link metadata trên PC 2 cột + mobile + F5 + máy khác.
2. Sync và kiểm tra version repo/runtime tất cả function 1988.
3. Dọn các probe function Supabase không còn caller.
4. Thay PIN nguồn frontend bằng auth/session thực.
5. Thêm cache metadata theo videoId ở server để deep-link gần như tức thì.
6. Chốt test matrix:
   - mobile/iPhone;
   - PC 1 cột;
   - PC 2 cột;
   - landscape/portrait;
   - F5/deep-link;
   - PiP;
   - source switch;
   - search;
   - tải audio/video.
7. Sau khi test matrix ổn mới bắt đầu tách `index.html` thành module nhỏ, giữ nguyên behavior.

## 19. Rollback

Nếu thay đổi sau checkpoint làm hỏng app, ưu tiên quay về:

`backup-2026-09-29-0137-stable`

Commit gốc:

`15bc1ac91bd57e71aef6bffc9305968902413d62`

Không ghép từng commit cũ trừ khi cần cứu riêng một fix.

---

**Nhận xét tổng:** dự án hiện đã đi đúng hướng ở tầng kiến trúc: server chuẩn bị dữ liệu, client sync package, một player chung, layout 1/2 cột chỉ là cách trình bày. Phần cần kỷ luật nhất từ đây là **không tiếp tục tăng độ phức tạp của frontend** và **không để runtime Supabase lệch khỏi repo**.
