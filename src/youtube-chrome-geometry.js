(() => {
  "use strict";

  // Geometry-only helper for YouTube iframe chrome.
  // It never reads the cross-origin iframe DOM. Instead it uses the player box,
  // the native play-control invariant (center of player), orientation, and
  // calibrated responsive samples. Title length is used only to estimate
  // whether YouTube's top title area grows to two lines.
  const VERSION = "2026-09-28.2";

  const PROFILES = {
    // Calibrated from real YouTube embed chrome at several PiP widths.
    // Top chrome is deeper because it carries avatar + title + channel.
    // Bottom chrome is intentionally much shallower so we keep more picture.
    landscape: [
      { w: 160, top: 42, bottom: 22 },
      { w: 190, top: 44, bottom: 23 },
      { w: 220, top: 46, bottom: 24 },
      { w: 280, top: 50, bottom: 26 },
      { w: 360, top: 54, bottom: 28 },
      { w: 520, top: 58, bottom: 30 },
      { w: 720, top: 62, bottom: 32 },
      { w: 960, top: 66, bottom: 34 }
    ],
    portrait: [
      { w: 120, top: 44, bottom: 22 },
      { w: 150, top: 47, bottom: 23 },
      { w: 180, top: 50, bottom: 24 },
      { w: 220, top: 53, bottom: 26 },
      { w: 280, top: 57, bottom: 28 },
      { w: 360, top: 61, bottom: 30 },
      { w: 460, top: 65, bottom: 32 }
    ]
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  function orientationOf(width, height) {
    if (height > width * 1.12) return "portrait";
    if (width > height * 1.12) return "landscape";
    return "square";
  }

  function interpolateProfile(kind, width) {
    const key = kind === "portrait" ? "portrait" : "landscape";
    const list = PROFILES[key];
    if (width <= list[0].w) return { ...list[0] };
    if (width >= list[list.length - 1].w) return { ...list[list.length - 1] };

    for (let i = 0; i < list.length - 1; i += 1) {
      const a = list[i];
      const b = list[i + 1];
      if (width >= a.w && width <= b.w) {
        const t = (width - a.w) / Math.max(1, b.w - a.w);
        return {
          w: width,
          top: lerp(a.top, b.top, t),
          bottom: lerp(a.bottom, b.bottom, t)
        };
      }
    }
    return { ...list[list.length - 1] };
  }

  function estimateTitleLines(width, title = "") {
    const text = String(title || "").trim();
    if (!text) return 1;

    // At small widths YouTube reserves avatar + right-side actions, so title has
    // much less usable width than the player itself.
    const reserved = width < 240 ? 86 : width < 360 ? 104 : 126;
    const usable = Math.max(72, width - reserved);
    const avgGlyph = clamp(width * 0.032, 6.2, 8.2);
    const estimatedPixels = text.length * avgGlyph;
    return clamp(Math.ceil(estimatedPixels / usable), 1, 2);
  }

  function measure(input = {}, options = {}) {
    const width = Math.max(1, Number(input.width) || 1);
    const height = Math.max(1, Number(input.height) || 1);
    const orientation = options.orientation || orientationOf(width, height);
    const profileKind = orientation === "portrait" ? "portrait" : "landscape";
    const base = interpolateProfile(profileKind, width);

    const titleLines = estimateTitleLines(width, options.title || "");
    const secondLineExtra = titleLines > 1
      ? clamp(width * 0.038, 9, 14)
      : 0;

    const topChrome = base.top + secondLineExtra;
    const bottomChrome = base.bottom;

    const playCenter = {
      x: width / 2,
      y: height / 2
    };

    // Crop top and bottom independently. The native Play/Pause remains at the
    // real player center; we only guarantee a clear area around that center so
    // the control is never clipped. This keeps substantially more picture than
    // the old symmetric max(top,bottom) crop.
    const playClearance = clamp(Math.min(width, height) * 0.16, 26, 42);
    const maxTopInset = Math.max(0, playCenter.y - playClearance);
    const maxBottomInset = Math.max(0, (height - playCenter.y) - playClearance);
    const topInset = clamp(topChrome, 0, maxTopInset);
    const bottomInset = clamp(bottomChrome, 0, maxBottomInset);

    return {
      version: VERSION,
      orientation,
      width,
      height,
      playCenter,
      playClearance,
      titleLines,
      topChrome,
      bottomChrome,
      topInset,
      bottomInset,
      // Legacy compatibility for callers that still expect a single value.
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
    element.style.setProperty("--safe-edge", result.safeEdge.toFixed(2) + "px");
    element.style.setProperty("--yt-play-x", result.playCenter.x.toFixed(2) + "px");
    element.style.setProperty("--yt-play-y", result.playCenter.y.toFixed(2) + "px");
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
    PROFILES,
    orientationOf,
    estimateTitleLines,
    measure,
    apply,
    observe
  });
})();
