(() => {
  "use strict";

  // Responsive geometry model for YouTube iframe chrome.
  // Cross-origin iframe DOM/pixels cannot be inspected by the parent page, so
  // this library models YouTube's UI clusters from calibrated player sizes.
  // The native Play/Pause anchor is always the geometric player center.
  const VERSION = "2026-09-28.30";

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
    const cleanEmbed=String(options.embedMode||"")==="nocookie-controls0-clean";
    const top = cleanEmbed
      ? {title:true,avatar:true,channel:true}
      : {
          title:true,
          avatar:uiSpan>=175,
          channel:uiSpan>=255
        };

    const bottom = cleanEmbed
      ? {
          youtube:true,
          link:uiSpan>=200,
          next:uiSpan>=275,
          seek:false
        }
      : {
          youtube:true,
          link:uiSpan>=210,
          next:uiSpan>=275,
          seek:nativeControls&&uiSpan>=300
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

  // Dedicated calibration library for the exact PiP embed:
  // youtube-nocookie + controls:0 + fs:0 + disablekb:1.
  // These are OUTER chrome bounds measured from the corresponding player edge.
  // PiP never derives them from Play/Pause or from artwork inside the video.
  const CLEAN_EMBED_CALIBRATION = Object.freeze({
    // Same rule for every orientation:
    // TOP    = lowest visible bottom edge among avatar/title/channel.
    // BOTTOM = highest visible top edge among link/next/YouTube. Because the
    //          bottom boxes are expressed as depth from the player bottom,
    //          that is simply the largest active depth.
    landscape:Object.freeze([
      {w:140, avatarEdge:46,title1Edge:34,title2Edge:46,channelEdge:50,
        linkH:0,linkOff:0,nextH:0,nextOff:0,youtubeH:31,youtubeOff:7},
      {w:170, avatarEdge:47,title1Edge:35,title2Edge:47,channelEdge:51,
        linkH:0,linkOff:0,nextH:0,nextOff:0,youtubeH:32,youtubeOff:8},
      {w:200, avatarEdge:48,title1Edge:36,title2Edge:48,channelEdge:52,
        linkH:34,linkOff:9,nextH:0,nextOff:0,youtubeH:33,youtubeOff:9},
      {w:240, avatarEdge:49,title1Edge:37,title2Edge:49,channelEdge:53,
        linkH:35,linkOff:10,nextH:0,nextOff:0,youtubeH:34,youtubeOff:10},
      {w:280, avatarEdge:51,title1Edge:39,title2Edge:51,channelEdge:55,
        linkH:35,linkOff:10,nextH:44,nextOff:10,youtubeH:34,youtubeOff:10},
      {w:360, avatarEdge:54,title1Edge:42,title2Edge:54,channelEdge:58,
        linkH:37,linkOff:11,nextH:46,nextOff:11,youtubeH:36,youtubeOff:11},
      {w:520, avatarEdge:58,title1Edge:46,title2Edge:58,channelEdge:62,
        linkH:40,linkOff:13,nextH:50,nextOff:13,youtubeH:39,youtubeOff:13},
      {w:760, avatarEdge:62,title1Edge:50,title2Edge:62,channelEdge:66,
        linkH:49,linkOff:16,nextH:67,nextOff:16,youtubeH:44,youtubeOff:16}
    ]),
    portrait:Object.freeze([
      {w:140, avatarEdge:54,title1Edge:42,title2Edge:54,channelEdge:58,
        linkH:0,linkOff:0,nextH:0,nextOff:0,youtubeH:31,youtubeOff:7},
      {w:170, avatarEdge:54,title1Edge:42,title2Edge:54,channelEdge:58,
        linkH:0,linkOff:0,nextH:0,nextOff:0,youtubeH:32,youtubeOff:8},
      {w:200, avatarEdge:55,title1Edge:43,title2Edge:55,channelEdge:59,
        linkH:0,linkOff:0,nextH:0,nextOff:0,youtubeH:33,youtubeOff:9},
      {w:220, avatarEdge:55,title1Edge:43,title2Edge:55,channelEdge:59,
        linkH:34,linkOff:9,nextH:0,nextOff:0,youtubeH:33,youtubeOff:9},
      {w:240, avatarEdge:55,title1Edge:43,title2Edge:55,channelEdge:59,
        linkH:35,linkOff:10,nextH:0,nextOff:0,youtubeH:34,youtubeOff:10},
      {w:280, avatarEdge:56,title1Edge:44,title2Edge:56,channelEdge:60,
        linkH:35,linkOff:10,nextH:44,nextOff:10,youtubeH:34,youtubeOff:10},
      {w:320, avatarEdge:56,title1Edge:44,title2Edge:56,channelEdge:60,
        linkH:36,linkOff:10,nextH:45,nextOff:10,youtubeH:35,youtubeOff:10},
      {w:360, avatarEdge:57,title1Edge:45,title2Edge:57,channelEdge:61,
        linkH:37,linkOff:11,nextH:46,nextOff:11,youtubeH:36,youtubeOff:11},
      {w:460, avatarEdge:58,title1Edge:46,title2Edge:58,channelEdge:62,
        linkH:39,linkOff:12,nextH:49,nextOff:12,youtubeH:38,youtubeOff:12}
    ])
  });

  function interpolateCalibration(list,width){
    if(width<=list[0].w)return {...list[0],w:width,range:[list[0].w,list[0].w]};
    const last=list[list.length-1];
    if(width>=last.w)return {...last,w:width,range:[last.w,last.w]};
    for(let i=0;i<list.length-1;i+=1){
      const a=list[i],b=list[i+1];
      if(width<a.w||width>b.w)continue;
      const t=(width-a.w)/Math.max(1,b.w-a.w);
      const out={w:width,range:[a.w,b.w]};
      for(const key of Object.keys(a)){
        if(key==="w")continue;
        out[key]=lerp(a[key],b[key],t);
      }
      return out;
    }
    return {...last,w:width,range:[last.w,last.w]};
  }

  const EMBED_PROFILES = Object.freeze({
    "nocookie-controls0-clean": Object.freeze({
      controls:false,
      nativeSeek:false,
      // Exact family used by PiP max in iframe-demo.html.
      top:{
        // Only YouTube CHANNEL metadata belongs to TOP:
        // channel avatar + video title + channel name.
        // Never use artwork/watermarks/logos inside the video pixels.
        padMin:7,
        avatarMin:28,
        avatarMax:38,
        title1Min:17,
        title1Max:21,
        title2Min:31,
        title2Max:38,
        channelMin:12,
        channelMax:14,
        gapMin:2,
        gapMax:3,
        outer:2
      },
      bottom:{
        padMin:8,
        linkMin:34,
        nextMin:44,
        youtubeMin:28,
        outer:2
      }
    }),
    "youtube-controls1": Object.freeze({
      controls:true,
      nativeSeek:true,
      top:{
        padMin:8,
        avatarMin:30,
        avatarMax:40,
        title1Min:18,
        title1Max:22,
        title2Min:34,
        title2Max:40,
        channelMin:13,
        channelMax:15,
        gapMin:3,
        gapMax:4,
        outer:3
      },
      bottom:{
        padMin:9,
        linkMin:34,
        nextMin:44,
        youtubeMin:28,
        outer:3
      }
    })
  });

  function embedProfile(options = {}) {
    const key=String(options.embedMode||"");
    if(key&&EMBED_PROFILES[key])return {key,profile:EMBED_PROFILES[key]};
    const controls=options.controls!==false;
    const fallback=controls?"youtube-controls1":"nocookie-controls0-clean";
    return {key:fallback,profile:EMBED_PROFILES[fallback]};
  }

  function dynamicSample(width, height, orientation, options = {}) {
    const {key:embedKey,profile}=embedProfile(options);

    if(embedKey==="nocookie-controls0-clean"){
      const kind=orientation==="portrait"?"portrait":"landscape";
      const row=interpolateCalibration(CLEAN_EMBED_CALIBRATION[kind],width);
      return {
        ...row,
        embedKey,
        nativeSeek:false,
        seekH:0,
        seekOff:0,
        extremeBounds:true,
        h:height,
        range:row.range||[width,width]
      };
    }

    const uiSpan = orientation === "portrait"
      ? width
      : Math.min(width, height * (16 / 9));

    const topT = clamp((uiSpan - 140) / 620, 0, 1);
    const topPad = profile.top.padMin + topT*2;
    const avatar = lerp(profile.top.avatarMin,profile.top.avatarMax,topT);
    const title1 = lerp(profile.top.title1Min,profile.top.title1Max,topT);
    const title2 = lerp(profile.top.title2Min,profile.top.title2Max,topT);
    const channel = lerp(profile.top.channelMin,profile.top.channelMax,topT);
    const topGap = lerp(profile.top.gapMin,profile.top.gapMax,topT);

    const s = clamp(uiSpan / 520, .72, 1.28);
    const bottomPad = Math.max(profile.bottom.padMin, 11*s);
    const linkH = Math.max(profile.bottom.linkMin, 38*s);
    const nextH = Math.max(profile.bottom.nextMin, 52*s);
    const youtubeH = Math.max(profile.bottom.youtubeMin, 34*s);

    return {
      embedKey,
      nativeSeek:profile.nativeSeek,
      w:width,
      h:height,
      avatarEdge:topPad+avatar+profile.top.outer,
      title1Edge:topPad+title1+profile.top.outer,
      title2Edge:topPad+title2+profile.top.outer,
      channelEdge:topPad+title1+topGap+channel+profile.top.outer,
      linkH,
      linkOff:bottomPad+profile.bottom.outer,
      nextH,
      nextOff:bottomPad+profile.bottom.outer,
      youtubeH,
      youtubeOff:bottomPad+profile.bottom.outer,
      seekH:profile.nativeSeek?Math.max(4,6*s):0,
      seekOff:profile.nativeSeek?Math.max(3,bottomPad*.55):0,
      range:[width,width]
    };
  }

  function measure(input = {}, options = {}) {
    const width = Math.max(1, Number(input.width) || 1);
    const height = Math.max(1, Number(input.height) || 1);
    const orientation = options.orientation || orientationOf(width, height);
    const sample = dynamicSample(width, height, orientation, options);
    const profileInfo=embedProfile(options);
    const layoutState = resolveLayoutState(width, height, orientation, {
      ...options,
      controls:profileInfo.profile.controls,
      embedMode:sample.embedKey
    });

    if(sample.directBounds){
      const topInset=Math.max(0,Number(sample.topInset)||0);
      const bottomInset=Math.max(0,Number(sample.bottomInset)||0);
      return {
        version:VERSION,
        orientation,
        width,
        height,
        titleLines:1,
        embedMode:sample.embedKey,
        sampleRange:sample.range||[sample.w,sample.w],
        layoutState,
        directBounds:true,
        clusters:{
          top:{outerMax:topInset,height:topInset},
          bottom:{outerMax:bottomInset,height:bottomInset}
        },
        topChrome:topInset,
        bottomChrome:bottomInset,
        topChromeRaw:topInset,
        bottomChromeRaw:bottomInset,
        topBleed:0,
        bottomBleed:0,
        topInset,
        bottomInset,
        signedGap:height-topInset-bottomInset,
        overlap:Math.max(0,topInset+bottomInset-height),
        safeEdge:Math.max(topInset,bottomInset),
        safeWindow:{
          x:0,
          y:topInset,
          width,
          height:height-topInset-bottomInset
        }
      };
    }

    if(!sample.nativeSeek)layoutState.bottom.seek=false;
    const titleLines=Math.min(
      estimateTitleLines(width,options.title||""),
      layoutState.maxTitleLines
    );
    const topBoxMetrics=topBoxes(sample,titleLines,layoutState.top);
    const topChromeRaw=topBoxMetrics.outerMax;
    const bottomBoxMetrics=bottomBoxes(sample,layoutState.bottom);
    const bottomChromeRaw=bottomBoxMetrics.outerMax;
    const topBleed=sample.extremeBounds?0:1;
    const bottomBleed=sample.extremeBounds?0:1;
    const topChrome=topChromeRaw+topBleed;
    const bottomChrome=bottomChromeRaw+bottomBleed;
    const topInset=topChrome;
    const bottomInset=bottomChrome;

    return {
      version:VERSION,
      orientation,
      width,
      height,
      titleLines,
      embedMode:sample.embedKey,
      sampleRange:sample.range||[sample.w,sample.w],
      layoutState,
      clusters:{
        top:{
          avatarBox:topBoxMetrics.avatar,
          titleBox:topBoxMetrics.title,
          channelBox:topBoxMetrics.channel,
          outerMax:topChrome,
          height:topChrome
        },
        bottom:{
          linkBox:bottomBoxMetrics.link,
          nextBox:bottomBoxMetrics.next,
          youtubeBox:bottomBoxMetrics.youtube,
          seekBox:bottomBoxMetrics.seek,
          outerMax:bottomChrome,
          height:bottomChrome
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
      signedGap:height-topInset-bottomInset,
      overlap:Math.max(0,topInset+bottomInset-height),
      safeEdge:Math.max(topInset,bottomInset),
      safeWindow:{
        x:0,
        y:topInset,
        width,
        height:height-topInset-bottomInset
      }
    };
  }

  function normalizeViewportTrim(trim = {}) {
    return {
      top:clamp(Number(trim.top)||0,0,.45),
      right:clamp(Number(trim.right)||0,0,.45),
      bottom:clamp(Number(trim.bottom)||0,0,.45),
      left:clamp(Number(trim.left)||0,0,.45),
      source:String(trim.source||"none")
    };
  }

  function transformMeasurementToViewport(rawResult, trimInput = {}, viewport = {}) {
    if(!rawResult)return null;
    const trim=normalizeViewportTrim(trimInput);
    const rawW=Math.max(1,rawResult.width);
    const rawH=Math.max(1,rawResult.height);

    const trimTop=rawH*trim.top;
    const trimBottom=rawH*trim.bottom;
    const trimLeft=rawW*trim.left;
    const trimRight=rawW*trim.right;
    const visibleW=Math.max(1,rawW-trimLeft-trimRight);
    const visibleH=Math.max(1,rawH-trimTop-trimBottom);

    const viewportW=Math.max(1,Number(viewport.width)||visibleW);
    const viewportH=Math.max(1,Number(viewport.height)||visibleH);
    const scaleX=viewportW/visibleW;
    const scaleY=viewportH/visibleH;

    // The PiP viewport physically crops the player's black bars first.
    // Convert raw iframe coordinates into that cropped viewport afterwards.
    const topInset=Math.max(0,(rawResult.topInset-trimTop)*scaleY);
    const bottomInset=Math.max(0,(rawResult.bottomInset-trimBottom)*scaleY);

    return {
      ...rawResult,
      width:viewportW,
      height:viewportH,
      rawWidth:rawW,
      rawHeight:rawH,
      rawTopInset:rawResult.topInset,
      rawBottomInset:rawResult.bottomInset,
      viewportTrim:{
        ...trim,
        topPx:trimTop,
        rightPx:trimRight,
        bottomPx:trimBottom,
        leftPx:trimLeft,
        visibleW,
        visibleH,
        viewportW,
        viewportH,
        scaleX,
        scaleY,
        renderedRawW:rawW*scaleX,
        renderedRawH:rawH*scaleY,
        renderedLeft:-trimLeft*scaleX,
        renderedTop:-trimTop*scaleY
      },
      topInset,
      bottomInset,
      signedGap:viewportH-topInset-bottomInset,
      overlap:Math.max(0,topInset+bottomInset-viewportH),
      safeEdge:Math.max(topInset,bottomInset),
      safeWindow:{
        x:0,
        y:topInset,
        width:viewportW,
        height:viewportH-topInset-bottomInset
      }
    };
  }

  function buildMediaLibrary(options = {}) {
    const videoId = String(options.videoId || "");
    const title = String(options.title || "");
    const rawAspect = clamp(Number(options.rawAspect)||Number(options.aspect)||(16/9),.25,4);
    const minWidth = Math.max(96, Math.round(Number(options.minWidth) || 140));
    const maxWidth = Math.max(minWidth, Math.round(Number(options.maxWidth) || 760));
    const step = Math.max(1, Math.round(Number(options.step) || 2));
    const modeInfo=embedProfile(options);
    const controls = modeInfo.profile.controls;
    const embedMode=modeInfo.key;
    const viewportTrim=normalizeViewportTrim(options.viewportTrim||{});
    const visibleX=Math.max(.1,1-viewportTrim.left-viewportTrim.right);
    const visibleY=Math.max(.1,1-viewportTrim.top-viewportTrim.bottom);
    const derivedContentAspect=rawAspect*visibleX/visibleY;
    const contentAspect=clamp(
      Number(options.contentAspect)||derivedContentAspect,
      .25,
      4
    );
    const samples = [];

    const makeSample=(viewportW)=>{
      const viewportH=viewportW/contentAspect;
      const rawW=viewportW/visibleX;
      const rawH=viewportH/visibleY;
      const rawResult=measure(
        {width:rawW,height:rawH},
        {title,controls,embedMode,orientation:options.orientation}
      );
      return transformMeasurementToViewport(
        rawResult,
        viewportTrim,
        {width:viewportW,height:viewportH}
      );
    };

    for (let w=minWidth;w<=maxWidth;w+=step){
      samples.push(makeSample(w));
    }
    if(!samples.length||Math.round(samples[samples.length-1].width)!==maxWidth){
      samples.push(makeSample(maxWidth));
    }

    return {
      version: VERSION,
      videoId,
      title,
      aspect:contentAspect,
      rawAspect,
      contentAspect,
      minWidth,
      maxWidth,
      step,
      controls,
      embedMode,
      viewportTrim,
      createdAt: Date.now(),
      samples
    };
  }

  function applyManualCalibration(library, points = []) {
    if(!library||!Array.isArray(library.samples)||!library.samples.length)return library;
    const clean=(Array.isArray(points)?points:[])
      .map(p=>({
        width:Number(p.width),
        topInset:Number(p.topInset),
        bottomInset:Number(p.bottomInset)
      }))
      .filter(p=>Number.isFinite(p.width)&&Number.isFinite(p.topInset)&&Number.isFinite(p.bottomInset))
      .sort((a,b)=>a.width-b.width);
    if(!clean.length)return library;

    const baseLookup=(width)=>{
      const w=clamp(Number(width)||library.minWidth,library.minWidth,library.maxWidth);
      const index=clamp(
        Math.round((w-library.minWidth)/Math.max(1,library.step)),
        0,
        library.samples.length-1
      );
      return library.samples[index]||library.samples[library.samples.length-1];
    };

    const deltas=clean.map(p=>{
      const base=baseLookup(p.width);
      return {
        width:p.width,
        top:p.topInset-(Number(base?.topInset)||0),
        bottom:p.bottomInset-(Number(base?.bottomInset)||0)
      };
    });

    const deltaAt=(width,key)=>{
      if(deltas.length===1)return deltas[0][key];
      if(width<=deltas[0].width)return deltas[0][key];
      const last=deltas[deltas.length-1];
      if(width>=last.width)return last[key];
      for(let i=0;i<deltas.length-1;i+=1){
        const a=deltas[i],b=deltas[i+1];
        if(width<a.width||width>b.width)continue;
        const t=(width-a.width)/Math.max(1,b.width-a.width);
        return lerp(a[key],b[key],t);
      }
      return 0;
    };

    const samples=library.samples.map(sample=>{
      const topInset=Math.max(0,(Number(sample.topInset)||0)+deltaAt(sample.width,"top"));
      const bottomInset=Math.max(0,(Number(sample.bottomInset)||0)+deltaAt(sample.width,"bottom"));
      return {
        ...sample,
        topInset,
        bottomInset,
        manualCalibration:true,
        signedGap:sample.height-topInset-bottomInset,
        overlap:Math.max(0,topInset+bottomInset-sample.height),
        safeEdge:Math.max(topInset,bottomInset),
        safeWindow:{
          x:0,
          y:topInset,
          width:sample.width,
          height:sample.height-topInset-bottomInset
        }
      };
    });

    return {
      ...library,
      manualCalibrationPoints:clean,
      samples
    };
  }

  function lookupMediaLibrary(library, width) {
    if (!library || !Array.isArray(library.samples) || !library.samples.length) return null;
    const w = clamp(Number(width) || library.minWidth, library.minWidth, library.maxWidth);
    const index = clamp(
      Math.round((w - library.minWidth) / Math.max(1, library.step)),
      0,
      library.samples.length - 1
    );
    return library.samples[index] || library.samples[library.samples.length - 1];
  }

  function applyMediaLibrary(element, library) {
    if (!element || !library) return null;
    const rect = element.getBoundingClientRect();
    const result = lookupMediaLibrary(library, rect.width);
    if (!result) return null;

    element.style.setProperty("--yt-top-inset", result.topInset.toFixed(2) + "px");
    element.style.setProperty("--yt-bottom-inset", result.bottomInset.toFixed(2) + "px");
    element.dataset.ytChromeOrientation = result.orientation;
    element.dataset.ytTitleLines = String(result.titleLines);
    element.dataset.ytChromeLayout = result.layoutState.id;
    element.dataset.ytChromeTier = result.layoutState.tier;
    element.dataset.ytChromeDensity = result.layoutState.density;
    delete element.dataset.ytChromeCollision;
    return result;
  }

  function apply(element, options = {}) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const result = measure(rect, options);

    element.style.setProperty("--yt-top-inset", result.topInset.toFixed(2) + "px");
    element.style.setProperty("--yt-bottom-inset", result.bottomInset.toFixed(2) + "px");
    element.dataset.ytChromeOrientation = result.orientation;
    element.dataset.ytTitleLines = String(result.titleLines);
    element.dataset.ytChromeLayout = result.layoutState.id;
    element.dataset.ytChromeTier = result.layoutState.tier;
    element.dataset.ytChromeDensity = result.layoutState.density;
    delete element.dataset.ytChromeCollision;
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
    CLEAN_EMBED_CALIBRATION,
    EMBED_PROFILES,
    orientationOf,
    estimateTitleLines,
    resolveLayoutState,
    dynamicSample,
    measure,
    normalizeViewportTrim,
    transformMeasurementToViewport,
    buildMediaLibrary,
    applyManualCalibration,
    lookupMediaLibrary,
    applyMediaLibrary,
    apply,
    observe
  });
})();
