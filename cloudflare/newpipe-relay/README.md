# 1988 NewPipe relay

Small allowlisted Cloudflare Worker used only by NewPipeExtractor WASM for
YouTube HTML/InnerTube extraction requests. Video media is not proxied here;
the browser plays the extracted googlevideo URL directly.

Required GitHub Actions secrets:
- CLOUDFLARE_API_TOKEN
- CLOUDFLARE_ACCOUNT_ID

Run the "Deploy NewPipe Relay" workflow after adding those secrets.
