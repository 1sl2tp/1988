# 1988 NewPipe extractor

Small HTTP service used by yt.taphoa.xyz for direct YouTube media extraction.

- `GET /health`
- `GET /stream?id=<youtube video id>`
- `GET /media?id=<youtube video id>&kind=video|audio`

NewPipeExtractor: v0.26.5 (GPL-3.0). This service is kept separate from the static web frontend.
