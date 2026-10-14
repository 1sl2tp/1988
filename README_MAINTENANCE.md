## 0.C. YOUTUBE WATCH — FULL WIDTH, ONE-CARD MINIMUM (CURRENT, 2026-10-14)

- **UX decision (user confirmed with screenshots):** The Watch player is flush LEFT and preserves its real media ratio; the right next-video list fills **100% of its available grid track**. One recommendation card/row is the MINIMUM, not three cards/row as a maximum. Never leave an avoidable dark strip to the right because of fixed `max-width`, fixed 1–3-column breakpoints or a hard feed-column cap. Every row uses equally wide cards.
- **One proportional algorithm:** Derive `feedW` from `watchColumnGeometry` after the player takes its true-ratio width. With gap 16px, card minimum ~300px and preferred ~390px, choose `columns = min(floor((feedW + gap)/(300 + gap)), round((feedW + gap)/(390 + gap)))`, clamped to at least 1. This grows from 1 → 2 → 3 → 4 → ... if a wide screen has room and always fills the available right track. Width per card = `(feedW - (columns-1)*gap)/columns`. **560px is a SOFT preferred size, not a `max-width` clipping the grid.** In an unavoidable narrow transition one card may exceed 560px; fill the usable space rather than leave empty side space or shrink below 300px merely to add a column. No portrait/landscape special thresholds.
- **Viewport owner unchanged:** Desktop >=1000px has left video plus right queue, 24px page edges and 16px inter-panel gap. Real player width is derived from usable video height × detected/original ratio, reserving 98px for landscape or 140px for portrait info/actions, and at least 320px for the right queue; portrait metadata rail may be at least 320px without stretching the narrow player. No centered max-width canvas. Mobile/narrow tablet <1000px is video above and **one** full-width card per row below, irrespective of clip orientation. Browse without active video retains its existing 1–4-column chooser.
- **CSS owner:** `html.viewer-active.two-col .rows` must have `width:100%;max-width:none;justify-self:stretch;box-sizing:border-box` and dynamic `grid-template-columns:repeat(var(--feed-cols),minmax(0,1fr))`. Remove previous 560/1136/1712px row maximums. `setFeedColumnCount` must not force Watch back to 4 maximum; for 5+ reuse 4-column compact metadata style. Do not modify thumbnails' 16:9 ratio or add artificial video items.
- **Release evidence for this current rule:** canonical rule commit `e88e3cf9c4e96c3e923be9a5ac7ad5875bc2a868`; source `b205d8d25b27427bfc1e09b13f113c86524ec813`; final deploy `fb821205fda225caa6935f723153484ec541f2f3`; tests `970141a4be975ae56c4420dd58f5611d67bbebc6` + `940bfda5f5cb90878581315dd9771a1e1e67b3be`. Verify `38497224008` SUCCESS, Pages `38497223998` SUCCESS including HTTPS custom domain. E4 device visual and E5 network request/byte measurement still PENDING.
- **Regression gates:** actual queue widths 320, 600, 616, 679, 680, 999, 1080, 1400, 1536, 2200, 3500; desktop viewport 1000/1200/1440/1920/2560 with landscape and portrait, and one-column mobile 375/656/657/999. Check columns at 3→4 and 4→5 transitions, no right blank strips, no horizontal overflow, cards share row widths, and no new network requests on resize. Source/contracts/Pages with HTTPS must pass; screenshots on real Safari/PWA remain a separate gate.
- **Performance invariants:** CSS layout only; no Supabase, Render, Cloudflare, YouTube edge/probe, background cron, additional image prefetch, search calls, package mutation, per-card RPC or logging. Use the same cached next-video list and single YouTube player with unchanged PiP/autoplay.
- This **supersedes** the earlier 680/1080 hard thresholds, 3-column cap, and 560px hard card/row limits in prior same-day revisions. The latest rule is also Rule 43 of the project operational Sheet and `SPEC-1988-WATCH-COLUMN-MINMAX-20261014` in the global SDD tab. Record actual source/deploy/test evidence only after CI.

## 0.D. ISOLATED SAFARI PIP / LOCK-SCREEN LAB — 2026-10-14

- A user-supplied video `Cfmkk9wAXUw` may be tested ONLY on `sources/pip-background-lab.html`, copied by the already-existing Pages workflow. Do not patch `index.html`, `sw.js`, PWA scope, scheduler, Supabase, Cloudflare or Render for this test.
- Single iframe, official YouTube embed, no direct audio scraping, no egress proxy or browser-driven native PiP claim. Compare `playsinline=0` (iOS native fullscreen preference) with `playsinline=1` (inline). A/B switch reloads the same iframe; do not run two streams.
- iOS may auto transition fullscreen media to PiP on Home only under compatible conditions/permissions. Cross-origin YouTube iframe video cannot be accessed by the parent site's HTMLVideoElement PiP API; page visibility events cannot guarantee background audio. Observe physically on Safari/PWA, report each outcome separately and distinguish CI deployment from device behavior.
- Release `1d10773bddba3db556adeb99082928eb44e547e7`; Verify `38498738136` and Pages `38498738003` PASS, direct URL remote probe and lock-device E4 still pending. The demo is opt-in and is not linked or used by production watch routes.

## 0.E. ISOLATED NATIVE YOUTUBE 3-VIDEO QUEUE / LOCK TEST — 2026-10-14

- **Purpose:** user confirmed `sources/pip-background-lab.html` single-video A (`playsinline=0`) successfully plays via Safari fullscreen → Home → OS PiP → lock; still unknown whether video 2 starts when video 1 ends during PiP/lock. Test this WITHOUT modifying the working A page or any production `index.html`, service worker, PWA, API, package, playback, or backend.
- **Isolated new page only:** `sources/pip-playlist-lab.html` on GitHub Pages (existing `cp -R sources _site/`). One iframe, first ID `Cfmkk9wAXUw` from user; official channel successors `pXL2jZFF6_k` and `wqjoebF6VfI` verified against public YouTube listings. YouTube official `/embed/VIDEO_ID?playlist=NEXT_ID_1,NEXT_ID_2&playsinline=0&autoplay=0&controls=1`; **first video is in the path, not duplicated in playlist**, no `loop`, no frontend `ENDED` handler or forced background timer.
- **Test cases:** (1) player native fullscreen (seek to ~20s before end) and observe automatic next video while visible; (2) fullscreen → Home → system PiP and wait over track boundary; (3) fullscreen → Home → OS PiP → lock just before boundary and check if YouTube continues video 2 without interaction. Retain the known one-video demo as a separate baseline. User device reports, not static CI, decide whether background auto-next really works; the PiP window may exit on video change.
- **Keep guardrails:** one iframe, no extra preplay video players, proxy, audio extraction, yt-dlp, YouTube Data API, backend, polling, timed auto-seek, injected MediaSession, SW changes or unnecessary logs. No guarantee that YouTube will allow third-party embedded next-video continuation in background; preserve original demo and working production.
- **Release gate:** validate HTML script syntax, one iframe, exactly 3 distinct sourced IDs, playlist includes only 2 successors, `playsinline=0` and autoplay initially off. Verify existing CI and GitHub Pages custom-domain deploy. Record distinct results E1/E3 and E4 actual locked iPhone separately. Roll back only this new demo file if needed.
- **E4 DEVICE OUTCOME (user-reported, 2026-10-14):** after testing the 3-video native YouTube playlist demo, the user confirmed **"Có hoạt động tốt nhé"**. Record the overall Safari PiP/background next-track experiment as WORKING on their iPhone, rather than E4 pending. This does not separately instrument every fullscreen/PiP/locked subcase or 2→3 and is not proof across iOS devices; E5 measured bytes remain pending. **Do not change production Watch or enable background mode without an explicit integration task.**
- **Release evidence (2026-10-14):** standalone source commit `6f6c5a5d9d886b010975e999333c14019822b2a1`. Re-read source from GitHub; exact one iframe, three IDs, only two successors, `playsinline=0`, `autoplay=0`, JS parsed PASS, no extra HTTP/proxy/polling. Verify run `38500407757` **SUCCESS**; Pages run `38500407788` **SUCCESS** incl. build, deploy, custom-domain HTTPS. Exact new demo path could not be independently retrieved by web tool (provider unavailable); workflow copies entire `sources/`. **E4 actual iPhone automatic video 1→2 during PiP/lock and E5 resource bytes are PENDING**.

## 0.F. PRODUCTION WATCH → SAFARI "CHẠY NỀN" OPT-IN, SAFE HANDOFF — 2026-10-14

- Explicit user approval: integrate the already user-validated native Safari iframe playback/playlist as an **optional** mode for iPhone Safari Watch only, addressing inline playback → lock has no system media controls. **Keep production inline YouTube IFrame API player/normal auto-next, browse/live/package/desktop/PWA and custom CSS PiP untouched** when not opted-in.
- Trigger: a separate visible **"Chạy nền"** action on iPhone Safari Watch (video selected) using a real user tap. Route **in the SAME tab** to `/sources/background-listen.html`; do not run the inline player and native background iframe side-by-side. Pause current iframe before navigating; navigation releases its player. Limit to Safari iOS tab; do not promise a native OS PiP in PWA or other browsers.
- Handoff from existing already-loaded client state only: current validated YouTube video ID and `ytPlayer.getCurrentTime()` if it corresponds to the selected video; round/truncate to nearest second and cap 24 hours; pass a safe local watch return hash and at most 12 distinct next IDs from the **same** current feed/related ordered list, skipping any live/invalid/non-YouTube video. Respect saved `autoplayNext=false` by sending no successors. No new fetch, API call, package scanning, logs or cache writes on this action. Use query string with strict input validation, no open-redirect external `back`.
- Listening page: **ONE** `youtube-nocookie.com/embed/` iframe with `playsinline=0`, `autoplay=0`, `controls=1`, `fs=1`, `start=<seconds>`, `playlist=<next IDs>` (successors only) when available. Do not start a second player or use a JS `ENDED` handler; YouTube owns the in-iframe next-track queue in fullscreen/PiP/lock. User manually taps Play on the native YouTube player after navigation; **no guarantee of an uninterrupted/zero-click mode switch** from a site-owned iframe. Show the selected title/video ID, queue count, Home→PiP→Lock instructions, and same-origin "Trở về xem" affordance. Invalid/missing video ID renders an error and must not construct an iframe with untrusted path/query.
- **Direct-Lock limit is still UNSOLVED**: fullscreen→lock may pause pending manual Play on lockscreen, even though fullscreen→Home→PiP→lock was observed working. No JavaScript can synthesize Home or directly manipulate the cross-origin YouTube iframe's native media element/PiP. Do not add forged MediaSession, hidden audio/video, yt-dlp/Render proxy, timers, background retries or claims of one-tap auto PiP.
- Tests: safe video ID validation, correct feed order and dedupe, selected-video first, autoplay-off zero queue, no-live, timestamp carry and cap, same-tab navigation, no extra iframe, no auto-start, no double playback; normal player remains `playsinline:1`. Run local/CI frontend contracts, Verify, Pages deploy and custom domain HTTPS. Real iPhone Safari handoff/start-at-offset and Home→PiP→Lock/E4 plus E5 traffic measurement MUST be distinguished from code/CI checks. If device test fails, remove only the opt-in button and listening page.
- **Release evidence (2026-10-14):** rule-first `fb9e553f55ceb0a1e436f9beb383a96a26b9fede`, production Watch button/handoff `f8402f75027753844555cefcbac29cbb58393811`, dedicated `sources/background-listen.html` `dc4bc00e8dc9b9918f2a41c3916ee11a06e67941`, regression test patch `1b6c1b27cc14b538a2eb68049f35199bddd48071`. JS parse PASS for 3 inline scripts and listening page; one listening iframe; Verify run `38502074258` SUCCESS after tests, earlier frontend Verify `38501953654` SUCCESS; Pages deployment `38501953628` SUCCESS incl. all frontend contracts and HTTPS custom-domain gate. **Exact new deep link was inaccessible to the separate web-fetch tool**, so the GitHub artifact check does not prove direct URL loading in Safari. **E4 actual iPhone click/Play/start-offset/PiP/lock test pending; E5 measured network usage pending.** No claim of immediate no-gesture handoff or direct-lock fix.
- The earlier §0.D and §0.E rules are **historical independent demos** and are preserved unchanged, including the user's successful test of `/sources/pip-playlist-lab.html`. This production opt-in is intentionally isolated and may be rolled back without touching those pages.

## 0.G. SAFARI "CHẠY NỀN" MUST STAY **IN THE SAME WATCH PAGE** (2026-10-14)

- **User acceptance correction:** User clicked `Chạy nền` on production and it navigated away to a demo-like `/sources/background-listen.html` page. This is **wrong UX**. The button must switch **in place**, keeping the current `yt.taphoa.xyz/#/watch/...` route, browser scroll/context and queue. Do not navigate or open another tab/window; no iframe overlay that leaves a second running video.
- **One active player at a time:** from the current selected non-LIVE YouTube video, obtain confirmed `ytPlayer.getCurrentTime()` (only if `getVideoData().video_id===current.id`), finite queue of up to 12 already-loaded next videos from the current feed (ordered/deduplicated, non-LIVE/YouTube only; saved autoplay toggle OFF => no queue). Pause and destroy the normal `YT.Player` / iframe and replace **the same existing embedded media mount** with one official YouTube iframe: `/embed/<selectedID>?playsinline=0&autoplay=0&controls=1&fs=1&start=<position>&playlist=<next IDs>`. The user taps native Play, then Home → OS PiP → Lock (tested in standalone demo). YouTube handles background next tracks, not JS `ENDED` while hidden. No raw media extraction/proxy, timers, new API, data reads/writes, logs, cache/service-worker mutations.
- **Reversibility:** the same `Chạy nền` button becomes `Trở lại xem` while active. Clicking it removes the native iframe first, recreates the original `#videoFrame` mount and YT IFrame API owner; resume the original selected video from the **handoff timestamp**, not a fabricated current position since the cross-origin iframe cannot report its background progress. Selecting another video while in native mode must remove the native iframe before normal playback. Keep normal desktop/Android/Safari PWA and non-opted-in YouTube `playsinline=1` exactly as before.
- **Race and UI gates:** if the normal YT API is still loading, prevent late `onReady`/player creation from introducing a second iframe during native mode. The background iframe must be uncropped (avoid TOP/BOTTOM cover rails) and iPhone Safari should see full controls and native fullscreen; the watch URL must NOT change. `Chạy nền` is visible only on Safari iOS TAB and non-LIVE video as before. No claim that locking directly from fullscreen auto-starts media; Home → PiP → Lock remains the proven path, and user must tap Play in native iframe.
- **Verified release (2026-10-14):** source patch `ffba300ee1eb88dcc9339a95e232634baae44991`, production release `f4d8c20a8114dbea35dad77f10b19e4c84a0e345`, regression test final `56966bcb448a8d61504970f1a31eb7371c7d888c`; Verify `38503352764` SUCCESS and Pages `38503352805` SUCCESS including frontend contracts and HTTPS custom domain. Safari physical E4 in-place flow and E5 byte delta pending; no guarantee direct Lock succeeds. Old code-only Pages run `38503112734` failed before tests were updated, not final production release.
- **Test/CI:** assertions for in-place transition, mount replacement, no `location.assign` or `/sources/background-listen.html` in the Watch handler, one active media iframe, matching timestamp, no successors when autoplay OFF, dedupe, no LIVE, toggle back and late onReady guard. GitHub Verify + Pages deployment plus actual Safari E4 device test. The independent demo pages stay untouched for regression comparison. Supersedes §0.F *navigation only*; other restrictions of §0.F remain active.

## 0.H. RESEARCH: AUTOMATIC BACKGROUND PLAY ON HOME OR DIRECT LOCK (2026-10-14)

- **User's goal:** stay in normal YouTube Watch by default, and have sound continue automatically when iPhone minimizes Safari (Home) or locks directly. The confirmed Safari native fullscreen → Home → system PiP → Lock path works on the user's device, including YouTube iframe playlist transition (user-reported). **Direct Lock from fullscreen paused and needed manual Play at lock screen**, while inline YouTube `playsinline=1` → Lock displayed no media controls.
- **Official platform findings:** YouTube's `playsinline=0` selects native fullscreen on iOS; `playsinline=1` selects inline. The `playlist` parameter queues successors but is not a background mode switch. Apple explains system automatic PiP when leaving fullscreen for Home if Start PiP Automatically is enabled. Browser `HTMLVideoElement.requestPictureInPicture()` requires transient user activation and a reference to a real video element. The actual YouTube `<video>` is inside a **cross-origin iframe**, so the parent `yt.taphoa.xyz` cannot access its HTMLVideoElement or invoke PiP in reaction to `visibilitychange` / lock / Home. WebKit describes that transient activation is not granted automatically to an unrelated cross-origin iframe. `allow="picture-in-picture"` grants permission, **not** a command to start it.
- **Decision:** DO NOT implement a silent iframe/player swap during `visibilitychange`, `pagehide`, background timers, synthetic clicks, MediaSession spoofing, hidden audio/video, service-worker media playback or automatic retry. It cannot guarantee iOS auto PiP and risks losing the stream, double playback, bandwidth or a broken normal Watch. DO NOT set `playsinline=0` for all Safari video by default, because user wants normal inline viewing. Keep existing explicit, in-place `Chạy nền` action, `playsinline=0` native fullscreen, user Play → Home → system PiP → Lock. On a direct Lock, fallback remains tap Play on lock screen if iOS shows controls.
- **Only viable possible future improvement for true one-tap automatic PiP:** a player with an **authorized first-party controllable HTMLVideoElement** where `requestPictureInPicture()` can run synchronously inside a user gesture, subject to Safari/permissions/device; this is **not** available via YouTube official embedded player. Do not attempt to obtain raw YouTube streams, use extraction/proxies, or violate provider and traffic guardrails. PWA PiP availability differs from Safari and cannot be inferred.
- **Grounding:** https://developers.google.com/youtube/player_parameters (playsinline / playlist); https://webkit.org/blog/13862/the-user-activation-api/ (cross-origin gesture boundaries); https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestPictureInPicture (gesture, permissions, real video element); https://developer.apple.com/documentation/avkit/adopting-picture-in-picture-in-a-standard-player (system automatic PiP settings). User acceptance on this specific iPhone is stronger than claims about all iOS versions. **No runtime code, UI, packages, egress or deployment changes for this research-only decision.**

## 0.I. DESKTOP CROSS-APP "XEM NỔI" LIKE TIKTOK — DOCUMENT PIP (2026-10-14)

- **User reference:** screenshots TikTok in Chrome on macOS floating video above Chrome AND another open Safari/ChatGPT window. This is OS/window-level PiP, NOT the existing in-site mobile-scroll mini-player and NOT the iPhone's Home→PiP→Lock "Chạy nền" mode.
- **API and support:** Chrome/Edge desktop (Chrome 116+, secure top-level HTTPS) expose `window.documentPictureInPicture.requestWindow({width,height})`. It requires a **direct user gesture**, yields an always-on-top browser-owned window and keeps same-origin DOM control. Safari/macOS, Safari/iOS and Chrome Android lack this Document PiP API: never fake OS PiP with `window.open()` or a CSS-fixed element and claim it overlays other apps. Only render the opt-in "Xem nổi" button if the API exists on a desktop browsing context.
- **Live player transfer:** On user tap, prepare validated current YouTube video ID, confirmed `getCurrentTime()` only when YT API reports the same video, at most 12 next valid/deduped YouTube IDs from already-loaded current feed (exclude LIVE; saved autoplay-next OFF means zero). Invoke `requestWindow()` immediately from click (never wait for async preflight). **Only after the PiP window exists** pause/destroy the standard YT player, guard pending/later YT API events, then mount exactly ONE official YouTube embed iframe `playsinline=1&autoplay=1&start=...&playlist=... ` in the PiP document. Chrome's embed autoplay might require another Play interaction; do not claim glitch-free seamless time preservation. One original player is removed before the new iframe is inserted. No media scraping, cloned stream, hidden audio, proxies, backend or polling.
- **Lifecycle:** keep main `#/watch` route, current feed and tab UI unchanged. When floating window is closed by titlebar X or "Trở lại xem", remove floating iframe and rebuild standard YT IFrame API player once in `#videoFrame` using the known handoff timestamp, **not** an invented time in the cross-origin PiP iframe. On selecting another video while floating, close old floating iframe without restoring its old video, then normal video plays. Late `ensureYoutubePlayer()`, `onReady`, `onStateChange` and aspect probes must never create/drive a second player. Close/fail/rapid-click/before-close guards prevent duplicate audio. If API rejects, preserve original video and show a small nonblocking status.
- **Separation:** Safari iPhone "Chạy nền" (`playsinline=0` via native fullscreen) remains as before and uses a different explicit button. Default Watch (`playsinline=1`) unchanged. Desktop "Xem nổi" is **opt-in**, never triggers on scrolling/visibility/tab-switch/lock. No changes to package, Supabase/Cloudflare/Render, SW/PWA, worker, or existing standalone demos.
- **Release verification:** implementation commits `630d9fecbebe2caed9fdc014872a2916e951f7a1`, `459a8bb27e24ca17dedeb4e2b53be00838083a69`; VM regression tests `352f666a57720b58f3fd445527c93426028c5293`; source final `8afe9355b53e9d15b73d463df7cd793a82e2a2f4`; **Verify `38520070565` SUCCESS and Pages `38520070443` SUCCESS incl. custom-domain HTTPS**. Earlier CI failed due a prohibited retired provider's name in a button tooltip, removed in final. E4 Mac Chrome actual topmost playback/PiP and E5 network bytes PENDING. Opening PiP can reload YouTube, so `autoplay=1` is a best effort only. No claim E4 PASS without user screenshot/test.
- **Acceptance gates:** CI asserts browser capability gating, one live iframe, same-route and actual `requestWindow` user gesture, source ID/time/queue, success/failure, close→restore, user picks new card, no PWA/mobile PiP fake, no double playback, default Safari background flows intact. GitHub Verify and Pages custom-domain deployment PASS are separate from **E4 actual Chrome Mac always-on-top above Safari** and E5 network measurements; do not claim user device success until confirmed.
- **References:** MDN Document Picture-in-Picture API https://developer.mozilla.org/en-US/docs/Web/API/Document_Picture-in-Picture_API ; Chrome implementation https://developer.chrome.com/docs/web-platform/document-picture-in-picture ; MDN requestWindow https://developer.mozilla.org/en-US/docs/Web/API/DocumentPictureInPicture/requestWindow .

## 0.J. FIX DOCUMENT PIP YOUTUBE ERROR 153 (2026-10-14)

- **E4 screenshot defect:** On Chrome/macOS, `Xem nổi` opens a genuine Document PiP window, but a YouTube-nocookie iframe **directly nested in its `about:blank` document** displays YouTube *Video player configuration error 153*, while original Watch player was destroyed/black. This is **NOT acceptance PASS**. Error 153 means missing `HTTP Referer` (or equivalent API client identity), officially documented in YouTube iframe API. Document PiP uses `about:blank` as document URL, so it is unsafe to assume the inner YouTube request inherits a valid HTTPS page Referer simply by adding an `origin` query parameter.
- **Fix at layer:** Retain browser-owned Document PiP always-on-top window. Instead of embedding YouTube directly from `about:blank`, mount **ONE small same-origin HTTPS host iframe** `https://yt.taphoa.xyz/sources/floating-youtube.html` inside Document PiP. This host document sets `Referrer-Policy: strict-origin-when-cross-origin` explicitly and creates ONE official YouTube-nocookie player inside its own HTTPS origin (YouTube now receives actual HTTP Referer from the host document). This is a same-origin wrapper, **NOT** an audio/video proxy or additional media engine, with no new backend or YouTube metadata lookups.
- Host must strictly validate `v` (11-character YouTube ID), integer `t` bounded to 86400 seconds, `next` <=12 distinct 11-char valid IDs excluding first, and reject invalid ID without loading YouTube. No user-supplied URLs, external origins, inline HTML injection or tracking. Load official `https://www.youtube.com/iframe_api` once in wrapper for `YT.Player` error callback and `onAutoplayBlocked`; exactly one YouTube stream. Use official host `youtube-nocookie.com`, `playsinline=1`, `start`/playlist, `autoplay=1` as best effort. No retry loops/timers.
- **Failure fallback (must):** if iframe player reports `onError` (especially 153 or embedding denied), host posts a fixed-origin typed `postMessage` to the Document PiP window; the Watch-owned PiP window listens only to the host iframe's own `contentWindow` and the `yt.taphoa.xyz` origin. Close the failed PiP window and automatically restore the normal Watch iframe at the saved handoff position. Display clear status on Watch; do not strand the main player black. `pagehide`/close should reuse the single existing restoration path.
- Existing browser feature gating (Chrome/Edge desktop), same-route, explicit click user gesture for `requestWindow`, no double YouTube players, unsupported Safari/iPhone, in-page Safari `Chạy nền`, and other projects' resource guardrails remain unchanged. Tests check explicit HTTPS referrer policy, YouTube onError fallback, host isolation, payload validation, identical handoff timestamp/next playlist, no direct YouTube embed in `about:blank`, CI Verify+Pages, and physical Chrome Mac video playback before claiming solved.
- **Release evidence:** same-origin host `a88d836e204033ada52724d61544871a788df8ee`, main Watch final `ee834e2b14ffb732c7035ccda0c72776265744d8`, regression tests `17106e6f3853cdd764602ccbf7372899642a42f3`; **Verify `38521033136` SUCCESS, Pages `38521032260` SUCCESS** including custom-domain HTTPS. Live device video in PiP E4 remains UNVERIFIED after fix; external deep-link HTTP check was network/DNS blocked in test environment; E5 bytes unmeasured. Error153 feedback is a recorded FAIL from prior release, not a verified fix until user retests. 
- **Sources:** https://support.google.com/youtube/answer/171780 ; https://developers.google.com/youtube/iframe_api_reference (error 153), https://developers.google.com/youtube/terms/required-minimum-functionality , https://wicg.github.io/document-picture-in-picture/ (about:blank document).
- Current §0.I "direct iframe inside PiP" is **superseded only where incompatible with §0.J**. No change to default playback or prior working demo pages.

## 0.K. XEM NỔI UX: ONE BORDERLESS VIDEO, BROWSER NATIVE PIP CONTROLS, AUTOPLAY FALLBACK (2026-10-15)

- **User Mac screenshots/feedback:** HTTPS-hosted Document PiP now shows YouTube video playing, but the floating window is too much like a tiny webpage: Chrome already provides window titlebar / return-to-tab / close, while our code duplicates another title + "Trở lại xem" toolbar inside the content and another big "Trở lại xem" button in Watch, wasting video area. User wants the frame to look like the main video and behave as a clean native floating player when resized. Also the PiP video does not begin automatically (browser says click Play).
- **New UI contract (supersedes only extra floating toolbar in §0.I):** Document PiP body must contain ONLY one full-bleed media mount with one same-origin `/sources/floating-youtube.html` host iframe (required by §0.J to prevent YouTube error153). Remove custom title/toolbar/"Trở lại xem" button from inside the PiP content entirely; rely on browser-owned titlebar return/close icons. When PiP active, hide the Watch-side extra "Trở lại xem" action/bar; the built-in PiP return control restores the normal Watch through existing `pagehide` cleanup. When PiP closes, restore normal "Xem nổi" button. On error, restore Watch and show a small status.
- **Sizing:** request initial PiP dimensions derived from the currently selected *trusted* media aspect ratio: default landscape 16:9 with browser titlebar allowance (~28–32 px), portrait 9:16 with a narrower frame, clamp unknown/aspect and window size. Floating content uses CSS `width:100%;height:100%;overflow:hidden`; inside the HTTPS host the YouTube iframe fills the content viewport and YouTube maintains its video aspect ratio without stretching/cropping. Browser/document PiP window itself remains user-resizable; there is **no reliable CSS property or Document PiP option to lock the entire OS window to aspect ratio** while dragging—letterboxing may occur when resizing to an arbitrary ratio. Do not force `window.resizeTo` from resize events, because that would jitter or fight user control. Do not hide YouTube's functional native video controls.
- **Autoplay:** keep official YouTube `autoplay=1`, `allow=autoplay` on the parent iframe, make one best-effort `player.playVideo()` in the HTTPS host `onReady`. Browser policy may still block because the YouTube iframe is newly created after the original gesture. On official `onAutoplayBlocked`, show **one unobtrusive, centered circular Play icon overlay inside the PiP's HTTPS host page**; a real click synchronously calls `player.playVideo()` to use user activation. Hide overlay on actual `PLAYING`, keep if browser rejects again. Never create hidden audio, mute to simulate success, repeated autoplay retries, a second stream, a proxy, or claim fully automatic seamless playback on all Chrome versions.
- **Release evidence (2026-10-15):** rule `8e7db480291ae5d431790042176da61776b5d4ac`; main `f83dc2d586c62b5a22f25ee4b54cb116f1979512`, HTTPS wrapper final `c26dcf9e87702c5384a7e8a148fd661546ddd140`, regression test `666f62a18aa9c3852cf16934d57ca8bc6240d140`; Verify after test `38653666923` SUCCESS, final source Verify `38653761328` SUCCESS, Pages `38653761322` SUCCESS (custom-domain HTTPS). **E4 Chrome/Mac actual new UI and auto-start still pending**; prior user screenshots confirmed media plays with manual Play, not auto. E5 network bytes unmeasured. No production code beyond floating DocumentPiP and its host was modified.
- **Isolation/safety:** preserve one iframe/player, official YouTube IFrame API and HTTPS Referer to prevent code153, original video timestamp and up-to-12 successors, failure `onError` restoring main Watch, same-route and anti-forgery checks, no new API/data calls, no changes to default Watch or iPhone Safari "Chạy nền", no SW/cache, no retired media provider. Regression tests for no duplicate toolbars/buttons, browser-native close restores Watch, source vs popup aspect/scale, autoplay-blocked overlay and single manual `playVideo()` call, no extra requests. Verify + Pages gate, **real Mac device acceptance still needed**; user screenshot proves *video was playing with controls* but autoplay failed.

# README MAINTENANCE — QUY TẮC BẮT BUỘC DỰ ÁN 1988

> **CURRENT RUNTIME OVERRIDE — 2026-10-05**
>
> TikTok runtime has been retired. Any TikTok sections later in this document are historical incident records only and MUST NOT be used to reconnect Render, Cloudflare TikTok, Supabase TikTok tables/functions, cron, or UI data paths.
>
> Current owner contract is `README_HOST_ARCHITECTURE.md` plus `1sl2tp/infrastructure/rules/02-EXTERNAL-DATA-SINGLE-SOURCE-OF-TRUTH.md`.
>

> **BẮT BUỘC ĐỌC TRƯỚC KHI SỬA.**  
> Mục tiêu số 1: **sửa nhanh, đúng lớp, không làm gián đoạn phần đang chạy**.  
> Áp dụng cho mọi sửa chữa, tối ưu, migration, UI, data, kết nối, deploy, rollback và bảo trì repo `1sl2tp/1988`.

## 0.A. SEARCH UX / RETIRE LOCK — 2026-10-09

- RUNTIME SCOPE: 1988 = **YouTube only**. Google Sheet `README Quy tac` #35–40 are RETIRED historical TikTok, not instructions to reactivate workers, cron, Render, libraries or video providers.
- SEARCH OWNER: MAIN `index.html` has the canonical existing `voiceSearchButton` / `startVoiceSearch`, so **never** inject a second mic controller in MAIN. `sources/index.html` + `sources/sources.js` own the separate source-management search inputs.
- For every real search field (MAIN current query, /sources/ channel/video, local source-name search), click/focus with a nonempty query selects the full text. This selection never dispatches input nor searches.
- Voice starts only after explicit mic press; use browser SpeechRecognition/webkitSpeechRecognition `vi-VN` if supported. Only one accepted final result causes ONE existing search submit (channel/video) or ONE local input event (source name). Speech provider may process audio remotely outside our infrastructure; never route raw audio through Supabase, Render or Cloudflare, nor create background polling/wake.
- Mobile UX: mic remains at the input's right without overlapping Search/+Source buttons; >=40px touch target, search input >=16px for coarse pointer to avoid Safari focus zoom. PIN/keyword/form values are not search targets; no mic there. Unsupported/denied prompts only after user action.
- Before declaring PROD VERIFIED: run existing Pages contract workflow incl. `tests/search-ux-1988.test.cjs`, inspect the Pages run/custom-domain HTTPS, then tap test on Safari/Chrome and measure any actual resource delta. Source patch or syntax-only tests are not a production check.

## 0.B. FEED DISPLAY / AUTO-NEXT / OPEN-WEB RULE — 2026-10-14

- Desktop search center is relative to the **viewport**, not leftover space after logo; mobile header is unchanged.
- Mobile one-column and desktop share `autoplayNext` (default ON; saved user OFF respected). YouTube `ENDED` may play next video in the current queue; no separate mobile player, no API fan-out.
- Non-LIVE server packages must be **fully browsable**: initial 18 thumbnail cards, append next 18 when user scrolls near bottom using RAM `feedMetas` ONLY; never truncate package permanently to 18, never re-fetch/rebuild on scroll. Preserve DOM nodes/player/position. LIVE package always shows every member (no render limit).
- Freshness is a separate backend contract: first visible daily visit may issue one scoped batch wake for latest/week/hashtags (not LIVE), but `accepted` means requested, not every scope completed. Verify config last_enqueued + refresh_state pending/last_ok + package hash/time/read-only counts. Empty/thin scopes cannot be 'fixed' with UI-side enrichment, source-guessing, additional client crawls or new cron.
- Preserve YouTube-only transport, Supabase canonical identity, 24h/7d filters and dedupe, on-demand LIVE, selected/blocked source state. Source/read-model test gates precede deploy; Safari/PWA and network delta require actual observation.

## 0.B. YOUTUBE AVATAR ORIGIN — 2026-10-14

- User report: BNC Now video `dxmuRFhd32o` shows a broken circular avatar, while channel name and verification remain correct. Targeted read-only `yt1988_packages` audit: 557/832 ordinary package video occurrences from 95 channel IDs have URLs with `piped-proxy.ducks.party` as the image transport and `host=yt3.googleusercontent.com` as the real upstream. Canonical `yt1988_channel_directory` contains the same proxy URL for BNC Now.
- **Source of truth unchanged:** package's `sourceId/sourceName/sourceAvatar/title` stay authoritative. Only rewrite the *transport URL* to `https://yt3.googleusercontent.com/<same image path>` (or whitelisted `yt3.ggpht.com`) when URL explicitly provides matching `host=yt3...`. Never borrow another channel's avatar, reassign source identity, or request profile for every card.
- Browser: `index.html::displayYoutubeAvatarUrl` for card/player/discovery; existing capture-phase image `error` handler substitutes a text-first-letter placeholder for failed image loads, never browser broken-image glyph. `src/media-meta.js` normalizes discovery URL; `supabase/functions/yt1988-refresh/index.ts::normalizeAvatarUrl` normalizes new package output. Existing package rows/database are not mass rewritten.
- Network: no extra AJAX, image probes, per-card Edge RPC, Live wake, cron, Supabase writes, proxy binary storage, or manual full refresh. A CDN-origin avatar is one ordinary image request, lazy policy preserved. Read-only package counts are evidence, not an invitation to query all sources again.
- Release evidence: commit `48494211a62504f59d60d83f411e35f8d56cd783`, Verify `38493221932` SUCCESS, Pages `38493221925` SUCCESS including domain; Supabase `yt1988-refresh` Edge v33 ACTIVE (source readback identical to GitHub); previous v32 confirmed byte-identical to GitHub baseline before deploy. Legacy package and directory DB rows are NOT rewritten; browser fixes them at display, normal new builds from v33 will store direct CDN. No refresh launched; real image Safari/PWA E4 and live egress E5 PENDING.

## 0. FAST REPAIR — quy trình ưu tiên ít gián đoạn

### 0.1. Trước khi viết code phải nói được 4 ý

1. **Lỗi thuộc lớp nào?** UI / Supabase / Render / Cloudflare / DNS-GitHub Pages.
2. **Bằng chứng ngắn nhất là gì?** Một endpoint, một log, một row DB, một screenshot, một workflow.
3. **Thay đổi nhỏ nhất có thể sửa lỗi là gì?**
4. **Rollback về đâu nếu sai?**

Người sửa/AI phải **gợi ý cách nhanh và an toàn hơn** nếu yêu cầu ban đầu có nguy cơ kéo dài downtime, gọi API thừa, sửa nhiều lớp hoặc làm phình dữ liệu. Không máy móc làm theo một cơ chế kém hơn khi đã thấy đường ngắn hơn.

### 0.2. 90 giây đầu: phân loại, không sửa lan

| Triệu chứng | Owner đầu tiên | Kiểm tra đầu tiên |
|---|---|---|
| Web 404 / domain | GitHub Pages + DNS | Pages run, custom domain, CNAME/HTTPS |
| UI lệch / click sai | Frontend | `index.html`, `src/**`, browser state |
| Feed/package cũ hoặc rỗng | Supabase | package hash/version + Edge Function |
| Tên/avatar/subscriber/tích xanh sai | Channel library | `yt1988-state.state.channelLibrary` + canonical tables |
| TikTok profile/video list sai | Render + Supabase canonical | library endpoint + `yt1988_tiktok_*` |
| TikTok LIVE/VOD không phát | Cloudflare edge | live state / video-stream / resolver |
| YouTube LIVE không hiện | YouTube live edge | edge live endpoint |
| DB/log/egress tăng | Writer/scheduler | job lặp, payload lớn, media bytes |

### 0.3. Khi production đang hỏng

- **Rollback trước, điều tra sau** nếu lỗi là regression từ deploy gần nhất và rollback rõ ràng.
- Không refactor, dọn file, đổi kiến trúc hoặc tối ưu thêm trong lúc production đang hỏng.
- Không chồng fix thứ hai lên fix thứ nhất nếu chưa biết fix thứ nhất có tác dụng.
- Nếu 2 deploy liên tiếp cùng incident đều fail: **dừng, quay về last-known-good**, thu bằng chứng rồi làm lại.
- Bản production cũ phải tiếp tục phục vụ cho tới khi bản mới PASS; không xóa fallback tốt trước deploy.

### 0.4. Khi production vẫn chạy

- **Một lỗi → một owner → một patch → một deploy owner.**
- Ưu tiên probe 1 kênh / 1 video / 1 endpoint; không scan toàn hệ thống để chẩn đoán.
- Migration phải **additive/backward-compatible trước**; deploy backend/schema trước, consumer UI sau; chỉ xóa field cũ ở đợt riêng khi đã verify.
- Không tạo thêm cache/package/table nếu source of truth đã tồn tại.
- Không deploy standby host khi production host không dùng nó.

### 0.5. Quy tắc commit/deploy nhanh

- Gom các file cùng một sửa chữa thành **một commit code chính** khi có thể.
- Không tạo chuỗi commit nhỏ trên `main` chỉ để thử từng ý; việc đó kích nhiều deploy và làm chậm.
- Frontend: chỉ commit cuối cần deploy Pages; run cũ được phép cancel khi commit mới hơn xuất hiện.
- Backend/Supabase/Worker: chỉ deploy runtime bị ảnh hưởng; không rebuild frontend nếu không đổi frontend.
- Commit tài liệu/nhật ký sau verify phải là **docs-only và không kích workflow production riêng**.
- Nếu GitHub vẫn tạo run **`pages build and deployment` event=`dynamic`** cho commit Markdown, repo đang còn Pages native/branch mode song song. Phải vào **Settings → Pages → Build and deployment → Source = GitHub Actions**. Không cố ép bằng `GITHUB_TOKEN`; quyền `pages:write` hiện trả 403 cho thao tác đổi source.
- Không kích Cloudflare static-site/Render static-site standby trong repair bình thường.

### 0.6. Trạng thái bắt buộc

Dùng đúng chuỗi trạng thái:
`DIAGNOSED → PATCHED → TEST PASS → DEPLOYED → PROD VERIFIED → DOC UPDATED`.

Chỉ được nói **“xong”** sau `PROD VERIFIED` và `DOC UPDATED`.

### 0.7. NO-WAIT — không đứng chờ một job

Bắt buộc áp dụng `README_NO_WAIT_WORKFLOW.md`:

- job/lease/deploy đang chạy → không tạo job thứ hai;
- còn phần việc độc lập → tiếp tục làm ngay, không trả lời “đợi”;
- cùng một cơ chế fail 2 lần → dừng retry mù, đổi owner/runtime hoặc rollback;
- gặp quota/429/403/CAPTCHA → dừng spam request, dùng cache/fallback/batch và đúng runtime owner;
- không polling workflow/API liên tục chỉ để chờ trạng thái;
- hard limit là constraint thiết kế, không phải lý do tạo fan-out hoặc nhiều account/job song song.

## 1. Nguồn sự thật

- **Source code:** GitHub repo `1sl2tp/1988`.
- **Production branch:** `main`.
- **Frontend production:** GitHub Pages tại `https://yt.taphoa.xyz/`.
- **Canonical data/state/current package:** Supabase.
- **Realtime detection/edge cache:** Cloudflare Workers.
- **Heavy TikTok resolver/session:** Render `1988-tiktok-session`.
- **Host/data/action contract:** `README_HOST_ARCHITECTURE.md`.
- **Tài liệu vận hành:** Google Sheet **1988 - Vận hành kết nối bảo trì**  
  https://docs.google.com/spreadsheets/d/1lGx0zMSzqbUF2liGxWor4GxAdEZx2gHn73Ee6sySnuU/edit
- **Nhật ký:** `NHAT_KY.md`.
- **Rollback/checkpoint:** `CHECKPOINT.md`.

## 1.1. TikTok LIVE — rule khóa direct Cloud/TikTok

TikTok LIVE là ngoại lệ realtime riêng và phải giữ luồng ngắn nhất:

```text
Cloudflare → TikTok /api-live/user/room
status=2 → đọc FLV/HLS ngay từ liveRoom.streamData / pull_data
→ trả thẳng cho browser/player
```

Bắt buộc:
- một targeted check chỉ gọi TikTok user-room một lần;
- LIVE link lấy từ **chính response xác định status=2**;
- không qua Render để tìm/resolve LIVE;
- không resolver/probe lần hai trước khi render;
- không HEAD/GET media chỉ để quyết định có hiển thị LIVE;
- click LIVE không được kích hoạt một quy trình “tìm link” mới;
- không full-scan nếu thao tác chỉ liên quan một handle;
- Render vẫn là owner profile/video-list/VOD metadata, không phải owner của TikTok LIVE direct link.

Nếu code hiện tại khác rule này, coi đó là regression kiến trúc và sửa về direct path trước khi thêm fallback mới.

## 2. Trước mọi lần sửa

1. **Bắt buộc đọc `CURRENT_WORK.md` trước** để biết incident/trạng thái/commit/runtime gần nhất. Không được sửa chỉ dựa vào trí nhớ hội thoại.
2. Đọc file này + `README_NO_WAIT_WORKFLOW.md` và tab **README Quy tac** trong Sheet.
3. Nếu thay đổi **host / owner data / action flow**, bắt buộc đọc `README_HOST_ARCHITECTURE.md`.
4. Nếu thay đổi liên quan **polling / scheduler / package / API / cache / log / media / Supabase traffic**, bắt buộc đọc `README_RESOURCE_GUARDRAILS.md` và kiểm tra checklist Egress/Log/Data trước khi merge.
4. Đọc tab liên quan:
   - UI/web: `02 Web va the`, `07 Sua Deploy`, `09 Su co`.
   - DB/Supabase: `03 Database`, `08 Bao tri`.
   - Render: `04 Render`.
   - TikTok: `05 TikTok`.
   - YouTube: `06 YouTube`.
5. Ghi nhận branch, HEAD/base commit, last-known-good, file/bảng/endpoint cần sửa.
6. Kiểm tra source of truth trước. **Không sửa UI để chữa dữ liệu nguồn sai.**
7. Nêu patch nhỏ nhất và rollback trước khi chỉnh production.

## 3. Nguyên tắc dữ liệu và channel library

- YouTube canonical: `yt1988_channel_directory`.
- TikTok canonical: `yt1988_tiktok_channels`.
- Web nhận schema chung qua `yt1988-state.state.channelLibrary`.
- UI identity phải ưu tiên `channelLibrary`; metadata video/package chỉ fallback.
- Chuẩn chung gồm: `key/platform/id/userId/handle/name/description/profileUrl/avatar/verification/verified/badges/stats/status/source/checkedAt/updatedAt`.
- `verification.known=false` nghĩa là **chưa có nguồn xác nhận**, không được hiểu thành “không verified”.
- Field chưa biết dùng `null`/rỗng đúng contract; **không bịa số 0 thành dữ liệu thật**.
- Không tạo bảng channel-library thứ ba. Chỉ normalize khi đọc.
- Không ghi binary/video/audio vào database hoặc log.
- Không giữ URL tạm/đã hết hạn trong package UI nếu browser không dùng.
- Cache phải có TTL/retention; không xóa canonical channel/video/selected/blocked chỉ để giảm dung lượng.

## 4. Sửa đúng lớp chịu trách nhiệm

- UI: render/interaction/cache client.
- Supabase: canonical data/state/package/schema/Edge Functions.
- Render: TikTok session/profile/library metadata; không gánh media bytes nếu không cần.
- Cloudflare: realtime LIVE/stream/VOD resolver.
- GitHub Pages + DNS: frontend hosting/domain.

**Một lỗi không được sửa đồng thời ở 3–4 lớp chỉ để “thử xem”.**

## 5. Kiểm thử và deploy

1. Chạy đúng contract/integration test của lớp thay đổi.
2. Workflow/deploy tương ứng phải PASS.
3. Xác nhận đúng commit/image/function version đã live.
4. Probe production bằng mẫu nhỏ nhất.
5. UI change: kiểm tra production web.
6. Data change: kiểm tra row/contract thực tế.
7. Nếu deploy fail hoặc production sai: rollback trước, không chồng nhiều sửa mới.
8. Docs-only không được kích production deployment.

## 6. BẮT BUỘC sau mỗi repair/deploy

Cập nhật **cả hai**:

### A. `CURRENT_WORK.md` + `NHAT_KY.md`

- `CURRENT_WORK.md`: cập nhật incident gần nhất, owner, bằng chứng, commit/runtime, production verify, việc còn lại và next probe để chat sau đọc là tiếp tục được ngay.
- `NHAT_KY.md`: ghi thời gian, branch, base/commit, owner layer, nguyên nhân, patch, test, deploy, production, data impact, rollback.

### B. Google Sheet **1988 - Vận hành kết nối bảo trì**

Append tab **Nhat ky sua chua** với:
- thời gian;
- branch/base/commit;
- layer;
- file/bảng/endpoint;
- nguyên nhân;
- patch;
- test;
- workflow/deploy;
- trạng thái production;
- ảnh hưởng data;
- rollback;
- tab tài liệu đã cập nhật.

Nếu kiến trúc/UI/data/kết nối thay đổi thì cập nhật thêm tab chuyên môn tương ứng.

## 7. Quy tắc theo branch

- `main` = production.
- Branch khác = NOT PRODUCTION cho tới khi merge/cherry-pick vào `main`.
- Không để branch/proof tự publish vào production.
- Không dùng proof/demo file trong artifact production.
- Commit ghi trong Sheet phải là commit thật chứa thay đổi.

## 8. Điều kiện được nói “xong”

Phải đủ:
- code đúng branch;
- test PASS;
- runtime đúng commit/version đã deploy;
- production verified;
- không tạo deploy thừa ở runtime khác;
- `NHAT_KY.md` cập nhật;
- Sheet cập nhật;
- tab chuyên môn cập nhật nếu contract thay đổi.

Thiếu một mục → **chưa hoàn tất**.

## 9. Mẫu FAST REPAIR

```text
Triệu chứng:
Owner nghi ngờ:
Bằng chứng:
Last-known-good:
Patch nhỏ nhất:
Test:
Deploy owner:
Production probe:
Rollback:
Docs cập nhật:
```

## 10. Mục tiêu

Mỗi repair phải trả lời được ngay:
1. Lỗi ở đâu?
2. Bằng chứng gì?
3. Patch nhỏ nhất là gì?
4. Deploy đúng runtime nào?
5. Production đã verify chưa?
6. Rollback về đâu?
7. Tài liệu đã cập nhật chưa?

## SDD — SPEC → TEST → ACCEPTANCE (RULE 04, 2026-10-09)

Trước khi thay đổi 1988, đọc [RULE 04 — SDD/Spec/Test/Acceptance](https://github.com/1sl2tp/infrastructure/blob/main/rules/04-SDD-SPEC-TEST-ACCEPTANCE.md) và [RULE CHUNG Google Sheets](https://docs.google.com/spreadsheets/d/1vu8mlXSr_E6klO3UjrsoWjos2MefCWkDra3MBbI6NHQ/edit) tab **08 - SDD SPEC TEST ACCEPTANCE**, sau các rule owner/resource hiện hành của repo.

- Mỗi task có SPEC ID; mô tả Given/When/Then, root owner và read/write path, MUST-STAY, case lỗi, rollback, nguồn chứng cứ và resource impact. Lỗi UI nhỏ dùng 1 dòng Spec, **không thêm tool GraphRAG/server/cron**.
- Trước patch khóa E0 SPEC + owner; test theo từng case E1/E2; đọc đúng commit/release E3; kiểm hành vi trên production/device thực E4; resource và user acceptance E5. Mock/unit xanh **không** phải bằng chứng UI thật đã sửa xong.
- Drift Check: không mở rộng file/provider/permission, không vô tình làm khác hành vi cũ. Với bug người dùng còn nhìn thấy, test string/CSS/CI đạt không được gọi DONE. Chưa có browser/account thực → `PROD PENDING`.
- YouTube-only; không revive TikTok/News; LIVE demand-only, package/hash; không sinh poll khi test.
- Docs-only update **không deploy production** và không cập nhật trạng thái nguồn nghiệp vụ; không sửa task `CURRENT_WORK` đang chờ nghiệm thu chỉ vì thêm SDD rule.

