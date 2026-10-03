# CHECKPOINT — MAIN 1988

Cập nhật vận hành: **2026-10-03**

## Last-known-good gần nhất

- Repo: `1sl2tp/1988`
- Production branch: `main`
- Frontend host: GitHub Pages
- Domain: `https://yt.taphoa.xyz/`
- Frontend code đã verify trước FAST-REPAIR update: `14bf92577768f311cf2b55331668de8511ac73ca`
- Pages run: `37114271928` — SUCCESS
- Supabase Edge Functions đã verify:
  - `yt1988 v5`
  - `yt1988-state v7`
  - `yt1988-refresh v17`
- Unified channel library contract đã probe production:
  - POPS Kids: subscriber/views/videoCount/avatar/handle/verified đúng;
  - TikTok verified profile trả cùng schema.

## Rollback nhanh

### Frontend regression

Ưu tiên quay về **last-known-good gần nhất**, không nhảy ngay về checkpoint 29/9:

```text
14bf92577768f311cf2b55331668de8511ac73ca
```

Sau rollback: verify `yt.taphoa.xyz` trước, rồi mới điều tra bản lỗi.

### Supabase regression

Rollback đúng Edge Function/schema bị ảnh hưởng; không rollback UI nếu UI không phải owner.

### Cloudflare/Render regression

Rollback đúng Worker/service bị ảnh hưởng; không deploy lại toàn bộ web.

## Checkpoint lịch sử 2026-09-29

- Commit nền: `15bc1ac91bd57e71aef6bffc9305968902413d62`
- Backup branch lịch sử: `backup-2026-09-29-0137-stable`
- Chỉ dùng checkpoint lịch sử khi rollback gần nhất không đủ.

## Nguyên tắc

- **Trước mọi sửa chữa: đọc `CURRENT_WORK.md` trước, sau đó `README_MAINTENANCE.md`.**
- Production hỏng: rollback trước, điều tra sau.
- Một incident chỉ có một owner/deploy chính.
- Không ghép nhiều commit cũ nếu không cần.
- Sau mỗi repair phải cập nhật lại `CURRENT_WORK.md` để chat sau biết chính xác đang làm gì.
