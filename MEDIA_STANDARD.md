# 1988 Media Standard

## Purpose

1988 has one media experience. YouTube and TikTok are content providers, not separate interfaces.

The shell owns layout. Provider adapters only own playback inside the shell.

```
MAIN / inline / PiP / 2-column / fullscreen
                    |
              shared media shell
                    |
        +-----------+-----------+
        |                       |
   YouTube adapter          TikTok adapter
   iframe / YT API          video / HLS / FLV
```

## Non-negotiable rules

1. MAIN, inline card playback, PiP and 2-column MUST use the same shell geometry.
2. Layout code MUST NOT detect a provider by video ID shape.
3. Layout code reads only:
   - `current.id`
   - `current.provider`
   - `current.kind` = landscape | portrait
   - `current.detectedRatio`
4. Provider adapters MUST NOT independently size or position MAIN/PiP/2-column.
5. Switching provider MUST deactivate the old surface before activating the new surface.
6. A callback from an inactive provider MUST NOT modify ratio, layout or visible controls.
7. Preview, media and popup layers have one fixed ordering.
8. The same card selection path MUST call one media entry point: `openMedia(meta)`.
9. Deep-link/history rules may remain provider-specific. Geometry may not.
10. YouTube-specific 11-character ID validation is allowed only in YouTube-only operations such as YouTube routing, thumbnail probing and YouTube download. It is forbidden in shell/layout/PiP decisions.

## Shared state contract

```js
current = {
  id: string,
  provider: "youtube" | "tiktok",
  kind: "landscape" | "portrait",
  ratio: number,
  detectedRatio: number,
  label: string
}
```

`hasCurrentMedia()` is the only concept required by shell layout to know whether media exists.

## Shell responsibilities

The shell owns:

- MAIN placement
- one-column inline placement
- two-column placement
- PiP placement
- PiP move/resize
- portrait/landscape geometry
- card-to-PiP transition
- fullscreen container
- z-index and clipping
- popup/menu relationship
- media aspect CSS variables
- safe-area handling

The shell does not know how a provider decodes media.

## Provider responsibilities

### YouTube adapter

Owns only:

- YouTube iframe/API lifecycle
- `loadVideoById`
- play/pause from YouTube API
- YouTube videoContentRect aspect confirmation
- YouTube-specific route/history
- YouTube native controls

It must call shared aspect commit only while `currentMediaProvider === "youtube"`.

### TikTok adapter

Owns only:

- native HLS on supported Apple clients
- mpegts.js FLV playback
- flv.js fallback
- TikTok live controls
- TikTok stream metadata
- TikTok real-frame live preview capture

It must call shared aspect commit only while `currentMediaProvider === "tiktok"`.

## Surface switching

Exactly one provider surface may be visible.

### Activate YouTube

1. stop/detach TikTok playback
2. hide TikTok video/preview/controls
3. set `currentMediaProvider="youtube"`
4. show YouTube iframe
5. load YouTube media
6. shell applies current ratio and placement

### Activate TikTok

1. pause YouTube
2. hide YouTube iframe
3. set `currentMediaProvider="tiktok"`
4. show TikTok video surface
5. attach HLS/FLV engine
6. shell applies current ratio and placement

No provider switch may inherit the previous provider's ratio as a fallback.

## Placement states

These are shell states, not provider states:

```
MAIN_TWO_COLUMN
INLINE_ONE_COLUMN
PIP_ONE_COLUMN
FULLSCREEN
```

A provider must behave identically when the shell changes between those states.

TikTok is not allowed to have a separate PiP implementation.
YouTube is not allowed to have a separate two-column implementation.

## Aspect rules

- The media owns its aspect ratio.
- The shell consumes the ratio.
- YouTube confirms ratio from its own player data.
- TikTok confirms ratio from stream metadata/videoWidth/videoHeight.
- A stale callback from another provider is ignored.
- If the current provider has no confirmed ratio yet:
  - YouTube neutral fallback: 16:9
  - TikTok may use stream metadata/default suitable for its stream
- Once confirmed, the shared shell is relaid out.

## Layer contract

Lowest to highest:

```
card/background
preview
active media surface
provider controls
inline/PiP shell
popup/menu
```

Popup/menu must always be above media.

Only one preview layer is allowed for a media item. Do not show avatar/cover and then swap to another preview if that creates a visible flash.

## LIVE preview

The UI consumes one field: `livePreview`.

- YouTube: package/server thumbnail may provide it.
- TikTok: use a real session preview if genuinely available; otherwise capture a real frame from the live stream.
- Avatar is identity, never a live media preview fallback.
- Card and pre-play media shell use the same `livePreview`.

## Entry point

All card/media selection should go through:

```js
openMedia(meta, options)
```

It selects the adapter. Everything after adapter activation uses the same shell.

Do not add new call sites that directly special-case TikTok vs YouTube for layout.

## Regression checklist

Every media change must test the following matrix:

| Mode | YouTube landscape | YouTube portrait | TikTok landscape | TikTok portrait |
|---|---|---|---|---|
| one-column MAIN/inline | required | required | required | required |
| PiP | required | required | required | required |
| two-column MAIN | required | required | required | required |
| provider switch YT -> TT | - | - | required | required |
| provider switch TT -> YT | required | required | - | - |
| popup `...` while media open | required | required | required | required |
| scroll inline -> PiP -> inline | required | required | required | required |

Failures in this matrix are shell regressions unless the media itself cannot be decoded.

## Forbidden patterns

Do not add these to layout/PiP code:

```js
/^[A-Za-z0-9_-]{11}$/.test(current.id) // YouTube-specific
if (provider === "tiktok") { customPiPGeometry(...) }
if (provider === "youtube") { customTwoColumnGeometry(...) }
```

Provider branching is allowed only inside playback adapters, provider-specific controls, provider-specific metadata acquisition, and provider-specific route/download functions.


## Orientation prediction

Orientation prediction is not a playback engine.

For YouTube, opening a selected video follows this order:

1. verified cached aspect from the real YouTube player
2. aspect/dimensions already present in package metadata
3. package `mediaKind` prediction (`portrait` / `landscape`)
4. cached media-meta prediction
5. YouTube-only previous shell ratio, never TikTok ratio
6. neutral 16:9 fallback

If steps 1-4 are missing, the existing media-meta resolver may run in the background after the click. It must never delay `loadVideoById()`.

The YouTube iframe/API player is identical for portrait and landscape. Shape changes only the shared shell geometry. After playback begins, `videoContentRect` remains authoritative and may correct the prediction.
