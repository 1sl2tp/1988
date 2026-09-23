# 1988 yt-dlp audio proxy

Backend audio riêng cho PWA 1988.

## Endpoint

- `GET /health`
- `GET /resolve?id=<youtube_video_id>`
- `GET|HEAD /audio?id=<youtube_video_id>`

`/audio` hỗ trợ HTTP Range và proxy byte stream từ nguồn do yt-dlp resolve. Trình duyệt không nhận direct Googlevideo URL, tránh lỗi URL/IP/session khác giữa backend và thiết bị.

## Render

Build:

```
pip install -r backend/ytdlp/requirements.txt
```

Start:

```
gunicorn --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120 backend.ytdlp.server:app
```
