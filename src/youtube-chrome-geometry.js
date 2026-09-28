(() => {
  "use strict";

  // Responsive geometry model for YouTube iframe chrome.
  // Cross-origin iframe DOM/pixels cannot be inspected by the parent page, so
  // this library models YouTube's UI clusters from calibrated player sizes.
  // The native Play/Pause anchor is always the geometric player center.
  const VERSION = "2026-09-28.4";

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Each sample describes the OUTER BOUNDS of YouTube's visible UI clusters.
  // top: avatar/logo + title block + channel line + top padding.
  // bottom: left action/share + "Video khác" + YouTube branding + seek/lower padding.
  //
  // Values are calibrated as cluster depths from the player's corresponding
  // edge, not as symmetric crops.
  const UI_PROFILES = {
    landscape: [
      { w:160, h:90,  avatar:28, title1:17, title2:31, channel:12, topPad:7,  topGap:4, linkBox:28, nextBox:30, youtubeBox:24, seekBox:4, bottomPad:5 },
      { w:190, h:107, avatar:30, title1:18, title2:33, channel:12, topPad:7,  topGap:4, linkBox:30, nextBox:32, youtubeBox:25, seekBox:4, bottomPad:5 },
      { w:220, h:124, avatar:32, title1:18, title2:34, channel:13, topPad:8,  topGap:4, linkBox:31, nextBox:34, youtubeBox:26, seekBox:4, bottomPad:6 },
      { w:280, h:158, avatar:36, title1:20, title2:37, channel:13, topPad:9,  topGap:4, linkBox:33, nextBox:37, youtubeBox:28, seekBox:4, bottomPad:6 },
      { w:360, h:203, avatar:40, title1:21, title2:39, channel:14, topPad:10, topGap:5, linkBox:35, nextBox:40, youtubeBox:30, seekBox:5, bottomPad:7 },
      { w:520, h:293, avatar:44, title1:23, title2:42, channel:15, topPad:11, topGap:5, linkBox:38, nextBox:44, youtubeBox:32, seekBox:5, bottomPad:8 },
      { w:720, h:405, avatar:48, title1:25, title2:45, channel:16, topPad:12, topGap:6, linkBox:42, nextBox:48, youtubeBox:35, seekBox:5, bottomPad:9 },
      { w:960, h:540, avatar:52, title1:27, title2:48, channel:17, topPad:13, topGap:6, linkBox:46, nextBox:52, youtubeBox:38, seekBox:6, bottomPad:10 }
    ],
    portrait: [
      { w:120, h:213, avatar:28, title1:17, title2:31, channel:12, topPad:7,  topGap:4, linkBox:28, nextBox:30, youtubeBox:24, seekBox:4, bottomPad:5 },
      { w:150, h:267, avatar:30, title1:18, title2:33, channel:12, topPad:7,  topGap:4, linkBox:30, nextBox:32, youtubeBox:25, seekBox:4, bottomPad:5 },
      { w:180, h:320, avatar:32, title1:18, title2:34, channel:13, topPad:8,  topGap:4, linkBox:31, nextBox:34, youtubeBox:26, seekBox:4, bottomPad:6 },
      { w:220, h:391, avatar:34, title1:19, title2:36, channel:13, topPad:8,  topGap:4, linkBox:32, nextBox:36, youtubeBox:27, seekBox:4, bottomPad:6 },
      { w:280, h:498, avatar:38, title1:20, title2:38, channel:14, topPad:9,  topGap:5, linkBox:34, nextBox:39, youtubeBox:29, seekBox:5, bottomPad:7 },
      { w:360, h:640, avatar:42, title1:22, title2:40, channel:15, topPad:10, topGap:5, linkBox:37, nextBox:42, youtubeBox:31, seekBox:5, bottomPad:8 },
      { w:460, h:818, avatar:46, title1:24, title2:43, channel:16, topPad:11, topGap:6, linkBox:40, nextBox:46, youtubeBox:34, seekBox:5, bottomPad:9 }
    ]
  };

  function orientationOf(width, height) {
    if (height > width * 1.12) return "portrait";
    if (width > height * 1.12) return "landscape";
    return "square";
  }

  function interpolateSample(kind, width) {
    const key = kind === "portrait" ? "portrait" : "landscape";
    const list = UI_PROFILES[key];
    if (width <= list[0].w) return { ...list[0] };
    if (width >= list[list.length - 1].w) return { ...list[list.length - 1] };

    for (let i = 0; i < list.length - 1; i += 1) {
      const a = list[i];
      const b = list[i + 1];
      if (width >= a.w && width <= b.w) {
        const t = (width - a.w) / Math.max(1, b.w - a.w);
        const out = { w: width };
        for (const k of Object.keys(a)) {
          if (k === "w") continue;
          out[k] = lerp(a[k], b[k], t);
        }
        return out;
      }
    }
    return { ...list[list.length - 1] };
  }

  function estimateTitleLines(width, title = "") {
    const text = String(title || "").trim();
    if (!text) return 1;

    // YouTube's title column loses room to avatar + right-side controls.
    const reserved = width < 200 ? 76 : width < 280 ? 92 : width < 420 ? 112 : 136;
    const usable = Math.max(64, width - reserved);
    const avgGlyph = clamp(width * 0.030, 5.9, 8.0);
    return clamp(Math.ceil((text.length * avgGlyph) / usable), 1, 2);
  }

  function topCluster(sample, titleLines) {
    const titleH = titleLines > 1 ? sample.title2 : sample.title1;
    // Avatar and text sit in the same row/block. The cluster bottom is the max
    // of avatar extent vs title + channel stack, plus outer padding/gap.
    const textStack = titleH + sample.channel + sample.topGap;
    const contentH = Math.max(sample.avatar, textStack);
    return sample.topPad + contentH;
  }

  function bottomCluster(sample) {
    // Measure the OUTER box of each native YouTube item, including its pill/card
    // background, thumbnail, internal padding and border. They share one band,
    // so the correct depth is the MAX outer box, not text/logo height and not
    // the sum of all controls.
    const outerMax = Math.max(
      sample.linkBox,
      sample.nextBox,
      sample.youtubeBox,
      sample.seekBox
    );
    return sample.bottomPad + outerMax;
  }

  function measure(input = {}, options = {}) {
    const width = Math.max(1, Number(input.width) || 1);
    const height = Math.max(1, Number(input.height) || 1);
    const orientation = options.orientation || orientationOf(width, height);
    const profileKind = orientation === "portrait" ? "portrait" : "landscape";
    const sample = interpolateSample(profileKind, width);
    const titleLines = estimateTitleLines(width, options.title || "");

    const playCenter = { x: width / 2, y: height / 2 };
    const topChrome = topCluster(sample, titleLines);
    const bottomChrome = bottomCluster(sample);

    // Keep the native center Play/Pause completely untouched. Insets are capped
    // independently so the top cluster never forces unnecessary bottom crop.
    const playRadius = clamp(Math.min(width, height) * 0.105, 18, 34);
    const playSafety = playRadius + clamp(Math.min(width, height) * 0.055, 8, 16);
    const maxTopInset = Math.max(0, playCenter.y - playSafety);
    const maxBottomInset = Math.max(0, (height - playCenter.y) - playSafety);

    const topInset = clamp(topChrome, 0, maxTopInset);
    const bottomInset = clamp(bottomChrome, 0, maxBottomInset);

    return {
      version: VERSION,
      orientation,
      width,
      height,
      titleLines,
      playCenter,
      playRadius,
      playSafety,
      clusters: {
        top: {
          avatar: sample.avatar,
          title: titleLines > 1 ? sample.title2 : sample.title1,
          channel: sample.channel,
          padding: sample.topPad,
          gap: sample.topGap,
          height: topChrome
        },
        bottom: {
          linkBox: sample.linkBox,
          nextBox: sample.nextBox,
          youtubeBox: sample.youtubeBox,
          seekBox: sample.seekBox,
          outerMax: Math.max(sample.linkBox,sample.nextBox,sample.youtubeBox,sample.seekBox),
          padding: sample.bottomPad,
          height: bottomChrome
        }
      },
      topChrome,
      bottomChrome,
      topInset,
      bottomInset,
      safeEdge: Math.max(topInset, bottomInset),
      safeWindow: {
        x: 0,
        y: topInset,
        width,
        height: Math.max(0, height - topInset - bottomInset)
      }
    };
  }

  function apply(element, options = {}) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const result = measure(rect, options);

    element.style.setProperty("--yt-top-inset", result.topInset.toFixed(2) + "px");
    element.style.setProperty("--yt-bottom-inset", result.bottomInset.toFixed(2) + "px");
    element.style.setProperty("--yt-play-x", result.playCenter.x.toFixed(2) + "px");
    element.style.setProperty("--yt-play-y", result.playCenter.y.toFixed(2) + "px");
    element.style.setProperty("--yt-play-safe", result.playSafety.toFixed(2) + "px");
    element.dataset.ytChromeOrientation = result.orientation;
    element.dataset.ytTitleLines = String(result.titleLines);
    return result;
  }

  function observe(element, getOptions, onMeasure) {
    if (!element || typeof ResizeObserver === "undefined") return () => {};
    const run = () => {
      const options = typeof getOptions === "function" ? getOptions() : (getOptions || {});
      const result = apply(element, options);
      if (result && typeof onMeasure === "function") onMeasure(result);
    };
    const ro = new ResizeObserver(run);
    ro.observe(element);
    run();
    return () => ro.disconnect();
  }

  window.YouTubeChromeGeometry = Object.freeze({
    VERSION,
    UI_PROFILES,
    orientationOf,
    estimateTitleLines,
    measure,
    apply,
    observe
  });
})();
