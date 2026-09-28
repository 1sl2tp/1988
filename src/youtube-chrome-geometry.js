(() => {
  "use strict";

  // Responsive geometry model for YouTube iframe chrome.
  // Cross-origin iframe DOM/pixels cannot be inspected by the parent page, so
  // this library models YouTube's UI clusters from calibrated player sizes.
  // The native Play/Pause anchor is always the geometric player center.
  const VERSION = "2026-09-28.12";

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Each sample describes the OUTER BOUNDS of YouTube's visible UI clusters.
  // top: avatar/logo + title block + channel line + top padding.
  // bottom: left action/share + "Video khác" + YouTube branding + seek/lower padding.
  //
  // Values are calibrated as cluster depths from the player's corresponding
  // edge, not as symmetric crops.
  const UI_PROFILES = {
    // Bottom controls are modeled as {height + offsetFromBottom}. The visible
    // depth is NOT the icon/text height; it is the full outer pill/card box
    // plus its vertical offset from the player edge.
    landscape: [
      { w:160, h:90,  avatarEdge:34, title1Edge:30, title2Edge:42, channelEdge:44, auxEdge:46, topRightEdge:32,
        linkH:27, linkOff:6, nextH:31, nextOff:7, youtubeH:24, youtubeOff:7, seekH:5, seekOff:4 },
      { w:190, h:107, avatarEdge:37, title1Edge:32, title2Edge:45, channelEdge:47, auxEdge:50, topRightEdge:34,
        linkH:28, linkOff:7, nextH:33, nextOff:8, youtubeH:25, youtubeOff:8, seekH:5, seekOff:4 },
      { w:220, h:124, avatarEdge:40, title1Edge:34, title2Edge:48, channelEdge:50, auxEdge:54, topRightEdge:36,
        linkH:29, linkOff:8, nextH:35, nextOff:9, youtubeH:26, youtubeOff:9, seekH:5, seekOff:5 },
      { w:280, h:158, avatarEdge:44, title1Edge:37, title2Edge:52, channelEdge:54, auxEdge:59, topRightEdge:39,
        linkH:31, linkOff:9, nextH:37, nextOff:10, youtubeH:28, youtubeOff:10, seekH:5, seekOff:5 },
      { w:360, h:203, avatarEdge:48, title1Edge:40, title2Edge:56, channelEdge:59, auxEdge:66, topRightEdge:42,
        linkH:33, linkOff:10, nextH:39, nextOff:11, youtubeH:30, youtubeOff:11, seekH:6, seekOff:5 },
      { w:520, h:293, avatarEdge:54, title1Edge:44, title2Edge:62, channelEdge:65, auxEdge:78, topRightEdge:47,
        linkH:35, linkOff:12, nextH:41, nextOff:13, youtubeH:32, youtubeOff:12, seekH:6, seekOff:6 },
      { w:720, h:405, avatarEdge:60, title1Edge:48, title2Edge:68, channelEdge:72, auxEdge:88, topRightEdge:52,
        linkH:38, linkOff:13, nextH:44, nextOff:14, youtubeH:35, youtubeOff:13, seekH:6, seekOff:7 },
      { w:960, h:540, avatarEdge:66, title1Edge:52, title2Edge:74, channelEdge:78, auxEdge:96, topRightEdge:57,
        linkH:41, linkOff:15, nextH:47, nextOff:16, youtubeH:38, youtubeOff:15, seekH:7, seekOff:8 }
    ],
    portrait: [
      { w:120, h:213, avatarEdge:34, title1Edge:30, title2Edge:42, channelEdge:44, auxEdge:47, topRightEdge:32,
        linkH:27, linkOff:6, nextH:31, nextOff:7, youtubeH:24, youtubeOff:7, seekH:5, seekOff:4 },
      { w:150, h:267, avatarEdge:37, title1Edge:32, title2Edge:45, channelEdge:47, auxEdge:51, topRightEdge:34,
        linkH:28, linkOff:7, nextH:33, nextOff:8, youtubeH:25, youtubeOff:8, seekH:5, seekOff:4 },
      { w:180, h:320, avatarEdge:40, title1Edge:34, title2Edge:48, channelEdge:50, auxEdge:55, topRightEdge:36,
        linkH:29, linkOff:8, nextH:35, nextOff:9, youtubeH:26, youtubeOff:9, seekH:5, seekOff:5 },
      { w:220, h:391, avatarEdge:43, title1Edge:36, title2Edge:51, channelEdge:53, auxEdge:59, topRightEdge:38,
        linkH:30, linkOff:9, nextH:36, nextOff:10, youtubeH:27, youtubeOff:10, seekH:5, seekOff:5 },
      { w:280, h:498, avatarEdge:47, title1Edge:39, title2Edge:55, channelEdge:58, auxEdge:65, topRightEdge:41,
        linkH:32, linkOff:10, nextH:38, nextOff:11, youtubeH:29, youtubeOff:11, seekH:6, seekOff:5 },
      { w:360, h:640, avatarEdge:51, title1Edge:42, title2Edge:59, channelEdge:62, auxEdge:72, topRightEdge:44,
        linkH:34, linkOff:11, nextH:40, nextOff:12, youtubeH:31, youtubeOff:12, seekH:6, seekOff:6 },
      { w:460, h:818, avatarEdge:56, title1Edge:46, title2Edge:64, channelEdge:67, auxEdge:80, topRightEdge:48,
        linkH:37, linkOff:12, nextH:43, nextOff:13, youtubeH:34, youtubeOff:13, seekH:6, seekOff:7 }
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
    if (width <= list[0].w) {
      const first=list[0];
      const scale=clamp(width/first.w,.72,1);
      const out={ w:width, range:[0,first.w] };
      for(const k of Object.keys(first)){
        if(k==="w"){continue}
        if(k==="h"){
          out[k]=first[k]*scale;
          continue;
        }
        out[k]=typeof first[k]==="number" ? first[k]*scale : first[k];
      }
      return out;
    }
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

  function resolveLayoutState(width, height, orientation, options = {}) {
    // YouTube changes which chrome blocks exist as the iframe crosses responsive
    // sizes. Presence is discrete; geometry inside an active state is continuous.
    // For landscape, height also limits the usable UI span.
    const uiSpan = orientation === "portrait"
      ? width
      : Math.min(width, height * (16 / 9));

    let tier = "xl";
    if (uiSpan < 200) tier = "xs";
    else if (uiSpan < 300) tier = "sm";
    else if (uiSpan < 420) tier = "md";
    else if (uiSpan < 640) tier = "lg";

    const nativeControls = options.controls !== false;

    // Presence is component-specific, not one shared tier. YouTube introduces
    // each metadata/control box at a different player span while resizing.
    // Calibrated order:
    // TOP: title -> channel logo -> channel name.
    // BOTTOM: YouTube -> link/share -> "Video khác".
    const top = {
      title: true,
      avatar: uiSpan >= 175,
      channel: uiSpan >= 235
    };

    const bottom = {
      youtube: true,
      link: uiSpan >= 210,
      next: uiSpan >= 275,
      seek: nativeControls && uiSpan >= 300
    };

    const density = uiSpan < 200 ? "tight" : uiSpan < 300 ? "compact" : "normal";
    // Small embeds truncate the native title rather than growing the top block.
    const maxTitleLines = uiSpan < 390 ? 1 : 2;

    return {
      id: orientation + "-" + tier + "-" +
        (top.avatar?"A":"")+(top.title?"T":"")+(top.channel?"C":"") + "-" +
        (bottom.link?"L":"")+(bottom.next?"N":"")+(bottom.youtube?"Y":"") +
        (nativeControls ? "-controls" : "-minimal"),
      tier,
      density,
      maxTitleLines,
      uiSpan,
      top,
      bottom
    };
  }

  function topBoxes(sample, titleLines, visibility) {
    // TOP is intentionally limited to the three YouTube metadata elements that
    // belong to the player chrome: channel logo, title and channel name.
    // Never include artwork/logo inside the video frame or auxiliary UI.
    const boxes = {
      avatar: { active:!!visibility.avatar, edge:sample.avatarEdge },
      title: { active:!!visibility.title, edge:titleLines > 1 ? sample.title2Edge : sample.title1Edge },
      channel: { active:!!visibility.channel, edge:sample.channelEdge }
    };
    const activeEdges = Object.values(boxes).filter(x=>x.active).map(x=>x.edge);
    return {
      ...boxes,
      outerMax: activeEdges.length ? Math.max(...activeEdges) : 0
    };
  }

  function bottomBoxes(sample, visibility) {
    const boxes = {
      link: {
        active:!!visibility.link,
        height:sample.linkH,
        offset:sample.linkOff,
        edge:sample.linkOff + sample.linkH
      },
      next: {
        active:!!visibility.next,
        height:sample.nextH,
        offset:sample.nextOff,
        edge:sample.nextOff + sample.nextH
      },
      youtube: {
        active:!!visibility.youtube,
        height:sample.youtubeH,
        offset:sample.youtubeOff,
        edge:sample.youtubeOff + sample.youtubeH
      },
      seek: {
        active:!!visibility.seek,
        height:sample.seekH,
        offset:sample.seekOff,
        edge:sample.seekOff + sample.seekH
      }
    };
    const activeEdges = Object.values(boxes).filter(x=>x.active).map(x=>x.edge);
    return {
      ...boxes,
      outerMax: activeEdges.length ? Math.max(...activeEdges) : 0
    };
  }

  function dynamicSample(width, height, orientation) {
    // Compute UI geometry from the CURRENT player box. No breakpoint profile is
    // used for dimensions: dragging 1px changes the measured geometry 1px-flow
    // immediately. Breakpoints only decide which YouTube boxes exist.
    const uiSpan = orientation === "portrait"
      ? width
      : Math.min(width, height * (16 / 9));

    const s = clamp(uiSpan / 520, .42, 1.35);
    const topPad = clamp(11 * s, 6, 14);
    const avatar = clamp(44 * s, 26, 56);
    const title1 = clamp(23 * s, 15, 29);
    const title2 = clamp(42 * s, 27, 52);
    const channel = clamp(15 * s, 10, 19);
    const topGap = clamp(5 * s, 2, 7);

    const bottomPad = clamp(12 * s, 5, 16);
    const linkH = clamp(38 * s, 26, 48);
    // "Video khác" is a full pill/card with thumbnail + background + padding.
    // Its OUTER box is visibly taller than the text and taller than the old
    // estimate, so model the whole card instead of the label height.
    const nextH = clamp(52 * s, 36, 60);
    const youtubeH = clamp(34 * s, 23, 44);
    const seekH = clamp(6 * s, 3, 8);

    return {
      w: width,
      h: height,
      avatarEdge: topPad + avatar,
      title1Edge: topPad + title1,
      title2Edge: topPad + title2,
      channelEdge: topPad + title1 + topGap + channel,
      // Full outer boxes + live edge offsets from the CURRENT player bottom.
      linkH,
      linkOff: bottomPad,
      nextH,
      nextOff: bottomPad,
      youtubeH,
      youtubeOff: bottomPad,
      seekH,
      seekOff: clamp(bottomPad * .55, 3, 9),
      range:[width,width]
    };
  }

  function measure(input = {}, options = {}) {
    const width = Math.max(1, Number(input.width) || 1);
    const height = Math.max(1, Number(input.height) || 1);
    const orientation = options.orientation || orientationOf(width, height);
    const sample = dynamicSample(width, height, orientation);
    const layoutState = resolveLayoutState(width, height, orientation, options);
    const titleLines = Math.min(
      estimateTitleLines(width, options.title || ""),
      layoutState.maxTitleLines
    );

    const playCenter = { x: width / 2, y: height / 2 };
    const topBoxMetrics = topBoxes(sample, titleLines, layoutState.top);
    const topChromeRaw = topBoxMetrics.outerMax;
    const bottomBoxMetrics = bottomBoxes(sample, layoutState.bottom);
    const bottomChromeRaw = bottomBoxMetrics.outerMax;

    // YouTube pills/cards can paint a tiny antialiased edge/shadow beyond their
    // nominal outer box. Keep a small visual bleed so no white rim peeks through.
    const topBleed = 2;
    const bottomBleed = 2;
    const topChrome = topChromeRaw + topBleed;
    const bottomChrome = bottomChromeRaw + bottomBleed;

    // Native Play/Pause remains centered. At small player sizes YouTube also
    // shrinks that control, so do not use a large fixed minimum radius.
    const playDiameter =
      layoutState.density === "tight" ? clamp(Math.min(width,height)*.29,24,28) :
      layoutState.density === "compact" ? clamp(Math.min(width,height)*.27,28,34) :
      clamp(Math.min(width,height)*.22,34,52);
    const playRadius = playDiameter/2;
    const playGap =
      layoutState.density === "tight" ? 1 :
      layoutState.density === "compact" ? 2 : 5;
    const playSafety = playRadius + playGap;

    // Our own top buttons and bottom seek must stay entirely inside the masked
    // bands. Their minimum required band depth changes with compact density.
    const topBarMin =
      layoutState.density === "tight" ? 28 :
      layoutState.density === "compact" ? 32 : 38;
    const bottomBarMin =
      layoutState.density === "tight" ? 18 :
      layoutState.density === "compact" ? 22 : 30;

    const wantedTop = Math.max(topChrome, topBarMin);
    const wantedBottom = Math.max(bottomChrome, bottomBarMin);
    const maxTopInset = Math.max(0, playCenter.y - playSafety);
    const maxBottomInset = Math.max(0, (height - playCenter.y) - playSafety);

    const topCollision = wantedTop > maxTopInset;
    const bottomCollision = wantedBottom > maxBottomInset;

    // Only when a band reaches the native Play/Pause do we stop at its edge.
    // Until that point, never shrink the mask below the actual YouTube chrome.
    const topInset = Math.min(wantedTop, maxTopInset);
    const bottomInset = Math.min(wantedBottom, maxBottomInset);
    const collisionMode = topCollision || bottomCollision;

    return {
      version: VERSION,
      orientation,
      width,
      height,
      titleLines,
      playCenter,
      playRadius,
      playSafety,
      topBarMin,
      bottomBarMin,
      collisionMode,
      collisions:{top:topCollision,bottom:bottomCollision},
      sampleRange: sample.range || [sample.w,sample.w],
      layoutState,
      clusters: {
        top: {
          avatarBox: topBoxMetrics.avatar,
          titleBox: topBoxMetrics.title,
          channelBox: topBoxMetrics.channel,
          outerMax: topChrome,
          height: topChrome
        },
        bottom: {
          linkBox: bottomBoxMetrics.link,
          nextBox: bottomBoxMetrics.next,
          youtubeBox: bottomBoxMetrics.youtube,
          seekBox: bottomBoxMetrics.seek,
          outerMax: bottomChrome,
          height: bottomChrome
        }
      },
      topChrome,
      bottomChrome,
      topChromeRaw,
      bottomChromeRaw,
      topBleed,
      bottomBleed,
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
    element.dataset.ytChromeLayout = result.layoutState.id;
    element.dataset.ytChromeTier = result.layoutState.tier;
    element.dataset.ytChromeDensity = result.layoutState.density;
    element.dataset.ytChromeCollision = result.collisionMode ? "1" : "0";
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
    resolveLayoutState,
    dynamicSample,
    measure,
    apply,
    observe
  });
})();
