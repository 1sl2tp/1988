(() => {
  "use strict";

  // Responsive geometry model for YouTube iframe chrome.
  // Cross-origin iframe DOM/pixels cannot be inspected by the parent page, so
  // this library models YouTube's UI clusters from calibrated player sizes.
  // The native Play/Pause anchor is always the geometric player center.
  const VERSION = "2026-09-28.5";

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Each sample describes the OUTER BOUNDS of YouTube's visible UI clusters.
  // top: avatar/logo + title block + channel line + top padding.
  // bottom: left action/share + "Video khác" + YouTube branding + seek/lower padding.
  //
  // Values are calibrated as cluster depths from the player's corresponding
  // edge, not as symmetric crops.
  const UI_PROFILES = {
    // Values below are OUTER EDGE DEPTHS measured from the player edge.
    // They are not text/icon heights. This matters because YouTube pills/cards
    // include background, thumbnail, padding, border and sometimes extend much
    // farther than the text/icon inside them.
    landscape: [
      { w:160, h:90,  avatarEdge:34, title1Edge:30, title2Edge:42, channelEdge:44, auxEdge:46, topRightEdge:32, linkEdge:29, nextEdge:31, youtubeEdge:25, seekEdge:10 },
      { w:190, h:107, avatarEdge:37, title1Edge:32, title2Edge:45, channelEdge:47, auxEdge:50, topRightEdge:34, linkEdge:31, nextEdge:33, youtubeEdge:26, seekEdge:10 },
      { w:220, h:124, avatarEdge:40, title1Edge:34, title2Edge:48, channelEdge:50, auxEdge:54, topRightEdge:36, linkEdge:32, nextEdge:35, youtubeEdge:27, seekEdge:11 },
      { w:280, h:158, avatarEdge:44, title1Edge:37, title2Edge:52, channelEdge:54, auxEdge:59, topRightEdge:39, linkEdge:34, nextEdge:38, youtubeEdge:29, seekEdge:11 },
      { w:360, h:203, avatarEdge:48, title1Edge:40, title2Edge:56, channelEdge:59, auxEdge:66, topRightEdge:42, linkEdge:36, nextEdge:41, youtubeEdge:31, seekEdge:12 },
      { w:520, h:293, avatarEdge:54, title1Edge:44, title2Edge:62, channelEdge:65, auxEdge:78, topRightEdge:47, linkEdge:39, nextEdge:45, youtubeEdge:33, seekEdge:13 },
      { w:720, h:405, avatarEdge:60, title1Edge:48, title2Edge:68, channelEdge:72, auxEdge:88, topRightEdge:52, linkEdge:43, nextEdge:49, youtubeEdge:36, seekEdge:14 },
      { w:960, h:540, avatarEdge:66, title1Edge:52, title2Edge:74, channelEdge:78, auxEdge:96, topRightEdge:57, linkEdge:47, nextEdge:53, youtubeEdge:39, seekEdge:15 }
    ],
    portrait: [
      { w:120, h:213, avatarEdge:34, title1Edge:30, title2Edge:42, channelEdge:44, auxEdge:47, topRightEdge:32, linkEdge:29, nextEdge:31, youtubeEdge:25, seekEdge:10 },
      { w:150, h:267, avatarEdge:37, title1Edge:32, title2Edge:45, channelEdge:47, auxEdge:51, topRightEdge:34, linkEdge:31, nextEdge:33, youtubeEdge:26, seekEdge:10 },
      { w:180, h:320, avatarEdge:40, title1Edge:34, title2Edge:48, channelEdge:50, auxEdge:55, topRightEdge:36, linkEdge:32, nextEdge:35, youtubeEdge:27, seekEdge:11 },
      { w:220, h:391, avatarEdge:43, title1Edge:36, title2Edge:51, channelEdge:53, auxEdge:59, topRightEdge:38, linkEdge:33, nextEdge:37, youtubeEdge:28, seekEdge:11 },
      { w:280, h:498, avatarEdge:47, title1Edge:39, title2Edge:55, channelEdge:58, auxEdge:65, topRightEdge:41, linkEdge:35, nextEdge:40, youtubeEdge:30, seekEdge:12 },
      { w:360, h:640, avatarEdge:51, title1Edge:42, title2Edge:59, channelEdge:62, auxEdge:72, topRightEdge:44, linkEdge:38, nextEdge:43, youtubeEdge:32, seekEdge:13 },
      { w:460, h:818, avatarEdge:56, title1Edge:46, title2Edge:64, channelEdge:67, auxEdge:80, topRightEdge:48, linkEdge:41, nextEdge:47, youtubeEdge:35, seekEdge:14 }
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
    if (width <= list[0].w) return { ...list[0], range:[list[0].w,list[0].w] };
    if (width >= list[list.length - 1].w) {
      const last=list[list.length - 1];
      return { ...last, range:[last.w,last.w] };
    }

    for (let i = 0; i < list.length - 1; i += 1) {
      const a = list[i];
      const b = list[i + 1];
      if (width >= a.w && width <= b.w) {
        const t = (width - a.w) / Math.max(1, b.w - a.w);
        const out = { w: width, range:[a.w,b.w] };
        for (const k of Object.keys(a)) {
          if (k === "w") continue;
          out[k] = lerp(a[k], b[k], t);
        }
        return out;
      }
    }
    const last=list[list.length - 1];
    return { ...last, range:[last.w,last.w] };
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
    const titleEdge = titleLines > 1 ? sample.title2Edge : sample.title1Edge;
    return Math.max(
      sample.avatarEdge,
      titleEdge,
      sample.channelEdge,
      sample.auxEdge,
      sample.topRightEdge
    );
  }

  function bottomCluster(sample) {
    return Math.max(
      sample.linkEdge,
      sample.nextEdge,
      sample.youtubeEdge,
      sample.seekEdge
    );
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
      sampleRange: sample.range || [sample.w,sample.w],
      clusters: {
        top: {
          avatarEdge: sample.avatarEdge,
          titleEdge: titleLines > 1 ? sample.title2Edge : sample.title1Edge,
          channelEdge: sample.channelEdge,
          auxEdge: sample.auxEdge,
          topRightEdge: sample.topRightEdge,
          outerMax: topChrome,
          height: topChrome
        },
        bottom: {
          linkEdge: sample.linkEdge,
          nextEdge: sample.nextEdge,
          youtubeEdge: sample.youtubeEdge,
          seekEdge: sample.seekEdge,
          outerMax: bottomChrome,
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
