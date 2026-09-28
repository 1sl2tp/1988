(() => {
  "use strict";

  // Geometry-only helper for YouTube iframe chrome.
  // It never reads the cross-origin iframe DOM. Instead it uses the player box,
  // the native play-control invariant (center of player), orientation, and
  // calibrated responsive samples. Title length is used only to estimate
  // whether YouTube's top title area grows to two lines.
  const VERSION = "2026-09-28.1";

  const PROFILES = {
    landscape: [
      { w: 160, top: 44, bottom: 38 },
      { w: 190, top: 46, bottom: 40 },
      { w: 220, top: 48, bottom: 41 },
      { w: 280, top: 50, bottom: 43 },
      { w: 360, top: 54, bottom: 46 },
      { w: 520, top: 60, bottom: 50 },
      { w: 720, top: 66, bottom: 54 },
      { w: 960, top: 72, bottom: 58 }
    ],
    portrait: [
      { w: 120, top: 46, bottom: 40 },
      { w: 150, top: 50, bottom: 42 },
      { w: 180, top: 54, bottom: 45 },
      { w: 220, top: 58, bottom: 48 },
      { w: 280, top: 62, bottom: 51 },
      { w: 360, top: 67, bottom: 55 },
      { w: 460, top: 72, bottom: 59 }
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
      ? clamp(width * 0.048, 11, 18)
      : 0;

    const topChrome = base.top + secondLineExtra;
    const bottomChrome = base.bottom;

    // Preserve the native YouTube play/pause at exact geometric center by using
    // a symmetric inset. Keep at least ~52 px around the center control.
    const minCenterWindow = clamp(Math.min(width, height) * 0.34, 52, 88);
    const maxInset = Math.max(0, (height - minCenterWindow) / 2);
    const safeEdge = clamp(Math.max(topChrome, bottomChrome), 0, maxInset);

    const playCenter = {
      x: width / 2,
      y: height / 2
    };

    return {
      version: VERSION,
      orientation,
      width,
      height,
      playCenter,
      titleLines,
      topChrome,
      bottomChrome,
      safeEdge,
      safeWindow: {
        x: 0,
        y: safeEdge,
        width,
        height: Math.max(0, height - safeEdge * 2)
      }
    };
  }

  function apply(element, options = {}) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const result = measure(rect, options);
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
