# CHECKPOINT — MAIN 1988

Ngày chốt: **2026-09-29 00:56 (UTC+7)**

## Baseline runtime

- Repo: `1sl2tp/1988`
- Branch production: `main`
- Runtime baseline đã chạy xanh: `fb3c76bdbc552645d8752ebe27d3e395b8c68acb`
- Domain: `yt.taphoa.xyz`
- Hosting: **GitHub Pages**
- Backend: **Supabase**
- PWA shell cache: `1988-simple-media-v3`
- Deploy kiểm chứng: **Deploy 1988 Player #2307 — success**

## Bản được coi là MAIN chính

`index.html` hiện dùng **Rail media core** chung cho:

- MAIN 1 cột;
- PiP;
- MAIN 2 cột.

Mốc này được coi là bản ổn để rollback nếu các thay đổi sau làm hỏng bố cục/media/PiP.

## Trạng thái media đã chốt

1. **MAIN 1 cột: OK**
   - dùng đúng aspect thật của video;
   - viewport chỉ hiển thị phần video thật;
   - không zoom/scaling giả để bù vùng đen.

2. **MAIN 2 cột: OK**
   - dùng cùng Rail player;
   - kích thước media theo không gian thực và aspect thật;
   - không còn phải đo title/icon/chrome để tính vùng đen.

3. **PiP: OK**
   - chuyển sang PiP thì **thu nhỏ đúng SIZE**, không giữ width/height của MAIN;
   - ngang dùng `--pip-landscape-w`;
   - dọc dùng `--pip-portrait-h`;
   - giữ đúng aspect thật;
   - không thêm nút X riêng;
   - không zoom iframe/video khi đổi SIZE.

4. **Công thức Rail chung**
   - source iframe = BLACK trên + video thật + BLACK dưới;
   - ngang: `65 + 65`;
   - dọc: `59 + 59`;
   - crop bằng viewport, không scale video;
   - `controls=1` để giữ tua native YouTube;
   - fullscreen bỏ crop và dùng toàn viewport.

5. **Aspect**
   - ưu tiên `videoContentRect`/detected ratio thật;
   - khi aspect thật đổi đủ ngưỡng thì relayout;
   - MAIN / PiP / 2 cột dùng cùng một nguồn aspect.

## Các commit chính của mốc này

- `cf167aa` — Use Rail crop player for main one-col PiP and two-col media
- `67f1637` — Refresh shell cache for Rail media main
- `39f579f` — Fix Rail PiP shrink size override
- `50bd597` — Refresh shell cache for PiP shrink fix
- `fb3c76b` — Update media cache test for v3, deploy xanh

## Rollback

Backup/checkpoint branch được tạo từ commit ghi checkpoint này.

Khi cần quay lại bản ổn, ưu tiên checkout branch:

`checkpoint-2026-09-29-rail-media-stable`

Không ghép lại từng commit cũ nếu không cần thiết.
