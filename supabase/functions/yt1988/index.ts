const PIPED_APIS = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://pipedapi-libre.kavin.rocks",
  "https://piped-api.privacy.com.de",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://pipedapi.owo.si",
  "https://pipedapi.ducks.party",
  "https://piped-api.codespace.cz",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.private.coffee",
  "https://pipedapi.darkness.services",
  "https://pipedapi.orangenet.cc",
];

const PLAYER_FRONTS = [
  "https://piped.video",
  "https://cf.piped.video",
  "https://vc.piped.video",
  "https://re.piped.video",
  "https://nf.piped.video",
];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,HEAD,OPTIONS",
  "access-control-allow-headers": "content-type,range",
  "access-control-expose-headers": "content-type,content-length,content-range,accept-ranges",
  "access-control-max-age": "86400",
};

let preferredApi = "";
let preferredUntil = 0;
const API_TTL_MS = 20 * 60 * 1000;

function json(data: unknown, status = 200, maxAge = 20) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}, stale-while-revalidate=${Math.max(maxAge, 30)}`,
    },
  });
}

function validId(value: string, kind: "video" | "playlist" | "channel") {
  if (kind === "video") return /^[A-Za-z0-9_-]{11}$/.test(value);
  if (kind === "playlist") return /^[A-Za-z0-9_-]{8,120}$/.test(value);
  return /^[A-Za-z0-9_@.-]{3,160}$/.test(value);
}

async function fetchJson(base: string, path: string, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(base + path, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const upstreamCache = new Map<string, { at: number; source: string; data: any }>();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getUpstreamCache(path: string, ttlMs: number) {
  if (!ttlMs) return null;
  const row = upstreamCache.get(path);
  if (!row || Date.now() - row.at >= ttlMs) {
    if (row) upstreamCache.delete(path);
    return null;
  }
  return { source: row.source, data: row.data };
}

function setUpstreamCache(path: string, source: string, data: any) {
  upstreamCache.set(path, { at: Date.now(), source, data });
  if (upstreamCache.size > 120) upstreamCache.delete(upstreamCache.keys().next().value);
}

async function raceApis(path: string, candidates: string[], timeoutMs = 1900) {
  const winner = await Promise.any(
    candidates.map(async (base, index) => {
      // Give the first known instances a short head start, then fan out quickly.
      if (index >= 7) await delay(300);
      const data = await fetchJson(base, path, timeoutMs);
      return { base, data };
    }),
  );
  return winner;
}

async function chooseApi(exclude = "") {
  if (preferredApi && preferredApi !== exclude && Date.now() < preferredUntil) {
    return preferredApi;
  }
  const candidates = PIPED_APIS.filter((url) => url !== exclude);
  try {
    const winner = await raceApis("/config", candidates, 1300);
    preferredApi = winner.base;
    preferredUntil = Date.now() + API_TTL_MS;
    return winner.base;
  } catch {
    throw new Error("no_piped_instance");
  }
}

async function piped(path: string, cacheMs = 0) {
  const cached = getUpstreamCache(path, cacheMs);
  if (cached) return cached;

  if (preferredApi && Date.now() < preferredUntil) {
    try {
      const data = await fetchJson(preferredApi, path, 1600);
      if (cacheMs) setUpstreamCache(path, preferredApi, data);
      return { source: preferredApi, data };
    } catch {
      preferredApi = "";
      preferredUntil = 0;
    }
  }

  try {
    const winner = await raceApis(path, PIPED_APIS, 1900);
    preferredApi = winner.base;
    preferredUntil = Date.now() + API_TTL_MS;
    if (cacheMs) setUpstreamCache(path, winner.base, winner.data);
    return { source: winner.base, data: winner.data };
  } catch {
    throw new Error("no_piped_instance");
  }
}

function enc(value: string) {
  return encodeURIComponent(value);
}


function regionalChannelId(row: any) {
  const raw = String(row?.uploaderUrl || row?.uploader_url || "").trim();
  const match = raw.match(/\/channel\/([^/?#]+)/);
  return match?.[1] || "";
}

async function regionalUploadFeed(region = "VN") {
  const code = String(region || "VN").toUpperCase().slice(0, 2);
  const trending = await piped(`/trending?region=${enc(code)}`, 120 * 1000);
  const trendingRows = Array.isArray(trending.data) ? trending.data : [];
  const channels = [...new Set(
    trendingRows
      .map(regionalChannelId)
      .filter((id) => /^[A-Za-z0-9_-]{12,80}$/.test(id))
  )].slice(0, 30);

  if (!channels.length) {
    return { source: trending.source, channels, data: trendingRows };
  }

  try {
    const feedPath = `/feed/unauthenticated?channels=${enc(channels.join(","))}`;
    const feed = await piped(feedPath, 60 * 1000);
    const feedRows = Array.isArray(feed.data) ? feed.data : [];
    return {
      source: feed.source,
      channels,
      data: feedRows.length ? feedRows : trendingRows,
    };
  } catch {
    return { source: trending.source, channels, data: trendingRows };
  }
}

async function probeMediaUrl(raw: string, timeoutMs = 3200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(raw, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Range: "bytes=0-1023",
        Accept: "*/*",
      },
    });

    const type = String(res.headers.get("content-type") || "").toLowerCase();
    const okStatus = res.status === 200 || res.status === 206;
    const looksBlocked =
      type.includes("text/html") ||
      type.includes("application/json") ||
      type.includes("text/plain");

    try { await res.body?.cancel(); } catch {}
    if (!okStatus || looksBlocked) throw new Error(`media_probe_${res.status}`);
    return raw;
  } finally {
    clearTimeout(timer);
  }
}

function proxifyPipedMedia(raw: string, info: any) {
  try {
    const media = new URL(raw);
    if (media.hostname.endsWith(".googlevideo.com") && info?.proxyUrl) {
      const proxy = new URL(String(info.proxyUrl));
      const prefix = proxy.pathname.endsWith("/") ? proxy.pathname.slice(0, -1) : proxy.pathname;
      media.searchParams.set("host", media.host);
      media.protocol = proxy.protocol;
      media.host = proxy.host;
      media.pathname = prefix + media.pathname;
    }
    return media.toString();
  } catch {
    return raw;
  }
}

function mediaQualityNumber(value: unknown) {
  const match = String(value || "").match(/(\d{3,4})/);
  return match ? Number(match[1]) : 0;
}

function mediaCandidates(info: any, kind: "video" | "audio") {
  const rows = kind === "audio"
    ? (Array.isArray(info?.audioStreams) ? info.audioStreams : [])
    : (Array.isArray(info?.videoStreams) ? info.videoStreams : []).filter((s: any) => s?.videoOnly !== true);

  const sorted = rows
    .filter((s: any) => s?.url)
    .slice()
    .sort((a: any, b: any) => {
      const aType = String(a?.mimeType || a?.format || "").toLowerCase();
      const bType = String(b?.mimeType || b?.format || "").toLowerCase();
      const aMp4 = aType.includes("mp4") ? 1 : 0;
      const bMp4 = bType.includes("mp4") ? 1 : 0;
      if (aMp4 !== bMp4) return bMp4 - aMp4;
      if (kind === "video") {
        const aq = mediaQualityNumber(a?.quality);
        const bq = mediaQualityNumber(b?.quality);
        if (aq !== bq) return bq - aq;
      }
      return (Number(b?.bitrate) || 0) - (Number(a?.bitrate) || 0);
    })
    .slice(0, kind === "audio" ? 3 : 4)
    .map((s: any) => proxifyPipedMedia(String(s.url), info));

  if (typeof info?.hls === "string" && info.hls) {
    sorted.push(proxifyPipedMedia(info.hls, info));
  }

  return [...new Set(sorted.filter(Boolean))];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (!["GET", "HEAD"].includes(req.method)) return json({ ok: false, error: "method_not_allowed" }, 405, 0);

  const url = new URL(req.url);
  const action = String(url.searchParams.get("action") || "health").toLowerCase();

  try {
    if (action === "media") {
      const id = String(url.searchParams.get("id") || "").trim();
      const kindRaw = String(url.searchParams.get("kind") || "video").toLowerCase();
      if (!validId(id, "video") || !["video", "audio"].includes(kindRaw)) {
        return json({ ok: false, error: "invalid_media_request" }, 400, 0);
      }
      const kind = kindRaw as "video" | "audio";
      const path = `/streams/${enc(id)}`;

      const orderedBases = [
        ...(preferredApi && Date.now() < preferredUntil ? [preferredApi] : []),
        ...PIPED_APIS,
      ].filter((base, index, rows) => base && rows.indexOf(base) === index).slice(0, 10);

      const settled = await Promise.allSettled(
        orderedBases.map(async (base, index) => {
          if (index >= 5) await delay(180);
          return { base, data: await fetchJson(base, path, 2800) };
        }),
      );

      const successes = settled
        .filter((row): row is PromiseFulfilledResult<{ base: string; data: any }> => row.status === "fulfilled")
        .map((row) => row.value);

      if (!successes.length) {
        return json({ ok: false, error: "no_piped_instance" }, 503, 0);
      }

      const incomingRange = req.headers.get("range") || "";
      let lastStatus = 0;

      for (const result of successes) {
        const candidates = mediaCandidates(result.data || {}, kind);
        for (const target of candidates) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 8000);
          try {
            const headers = new Headers({ Accept: "*/*" });
            if (incomingRange) headers.set("Range", incomingRange);
            else headers.set("Range", "bytes=0-");

            const upstream = await fetch(target, {
              method: req.method,
              redirect: "follow",
              signal: controller.signal,
              headers,
            });
            lastStatus = upstream.status;

            if (upstream.status !== 200 && upstream.status !== 206) {
              try { await upstream.body?.cancel(); } catch {}
              continue;
            }

            const upstreamType = String(upstream.headers.get("content-type") || "").toLowerCase();
            if (
              upstreamType.includes("text/html") ||
              upstreamType.includes("application/json") ||
              upstreamType.includes("text/plain")
            ) {
              try { await upstream.body?.cancel(); } catch {}
              continue;
            }

            preferredApi = result.base;
            preferredUntil = Date.now() + API_TTL_MS;

            const headersOut = new Headers(CORS);
            headersOut.set(
              "content-type",
              upstream.headers.get("content-type") ||
                (kind === "audio" ? "audio/mp4" : "video/mp4"),
            );
            headersOut.set("cache-control", "no-store");
            headersOut.set("accept-ranges", upstream.headers.get("accept-ranges") || "bytes");

            for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
              const value = upstream.headers.get(name);
              if (value) headersOut.set(name, value);
            }

            return new Response(req.method === "HEAD" ? null : upstream.body, {
              status: upstream.status,
              headers: headersOut,
            });
          } catch {
            // Try the next candidate/instance.
          } finally {
            clearTimeout(timer);
          }
        }
      }

      return json({
        ok: false,
        error: "no_working_media_source",
        upstreamStatus: lastStatus || undefined,
      }, 502, 0);
    }

    if (action === "playback") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "video")) return json({ ok: false, error: "invalid_video" }, 400, 0);

      const path = `/streams/${enc(id)}`;
      const orderedBases = [
        ...(preferredApi && Date.now() < preferredUntil ? [preferredApi] : []),
        ...PIPED_APIS,
      ].filter((base, index, rows) => base && rows.indexOf(base) === index).slice(0, 8);

      const settled = await Promise.allSettled(
        orderedBases.map(async (base, index) => {
          if (index >= 5) await delay(160);
          return { base, data: await fetchJson(base, path, 2400) };
        }),
      );

      const successes = settled
        .filter((row): row is PromiseFulfilledResult<{ base: string; data: any }> => row.status === "fulfilled")
        .map((row) => row.value);

      if (!successes.length) {
        return json({ ok: false, error: "no_piped_instance" }, 503, 0);
      }

      preferredApi = successes[0].base;
      preferredUntil = Date.now() + API_TTL_MS;

      let title = "";
      let uploader = "";
      let thumbnailUrl = "";
      let duration = 0;
      let livestream = false;

      const videoRows: any[] = [];
      const audioRows: any[] = [];
      const hlsRows: any[] = [];

      for (const result of successes) {
        const info: any = result.data || {};
        if (!title) title = String(info.title || "");
        if (!uploader) uploader = String(info.uploader || "");
        if (!thumbnailUrl) thumbnailUrl = String(info.thumbnailUrl || "");
        if (!duration) duration = Number(info.duration) || 0;
        livestream = livestream || !!info.livestream;

        const proxify = (raw: string) => proxifyPipedMedia(raw, info);

        for (const s of (Array.isArray(info.videoStreams) ? info.videoStreams : [])) {
          if (!s?.url || s?.videoOnly === true) continue;
          const directUrl = String(s.url);
          const proxyUrl = proxify(directUrl);
          const baseRow = {
            mimeType: String(s.mimeType || s.format || ""),
            format: String(s.format || ""),
            codec: String(s.codec || ""),
            quality: String(s.quality || ""),
            fps: Number(s.fps) || 0,
            bitrate: Number(s.bitrate) || 0,
            videoOnly: false,
            sourceApi: result.base,
          };
          videoRows.push({ ...baseRow, url: directUrl, via: "direct" });
          if (proxyUrl && proxyUrl !== directUrl) {
            videoRows.push({ ...baseRow, url: proxyUrl, via: "proxy" });
          }
        }

        for (const s of (Array.isArray(info.audioStreams) ? info.audioStreams : [])) {
          if (!s?.url) continue;
          const directUrl = String(s.url);
          const proxyUrl = proxify(directUrl);
          const baseRow = {
            mimeType: String(s.mimeType || s.format || ""),
            bitrate: Number(s.bitrate) || 0,
            sourceApi: result.base,
          };
          audioRows.push({ ...baseRow, url: directUrl, via: "direct" });
          if (proxyUrl && proxyUrl !== directUrl) {
            audioRows.push({ ...baseRow, url: proxyUrl, via: "proxy" });
          }
        }

        if (typeof info.hls === "string" && info.hls) {
          const directUrl = String(info.hls);
          const proxyUrl = proxify(directUrl);
          hlsRows.push({
            url: directUrl,
            mimeType: "application/vnd.apple.mpegurl",
            sourceApi: result.base,
            via: "direct",
          });
          if (proxyUrl && proxyUrl !== directUrl) {
            hlsRows.push({
              url: proxyUrl,
              mimeType: "application/vnd.apple.mpegurl",
              sourceApi: result.base,
              via: "proxy",
            });
          }
        }
      }

      const dedupe = (rows: any[]) => {
        const seen = new Set<string>();
        return rows.filter((row) => {
          const key = String(row?.url || "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const sources = dedupe(videoRows)
        .sort((a: any, b: any) => {
          const aType = (a.mimeType + a.format).toLowerCase();
          const bType = (b.mimeType + b.format).toLowerCase();
          const aMp4 = aType.includes("mp4") ? 1 : 0;
          const bMp4 = bType.includes("mp4") ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          const aDirect = a.via === "direct" ? 1 : 0;
          const bDirect = b.via === "direct" ? 1 : 0;
          if (aDirect !== bDirect) return bDirect - aDirect;
          const aq = mediaQualityNumber(a.quality);
          const bq = mediaQualityNumber(b.quality);
          if (aq !== bq) return bq - aq;
          return b.bitrate - a.bitrate;
        })
        .slice(0, 24);

      const audioSources = dedupe(audioRows)
        .sort((a: any, b: any) => {
          const aMp4 = String(a.mimeType).toLowerCase().includes("mp4") ? 1 : 0;
          const bMp4 = String(b.mimeType).toLowerCase().includes("mp4") ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          const aDirect = a.via === "direct" ? 1 : 0;
          const bDirect = b.via === "direct" ? 1 : 0;
          if (aDirect !== bDirect) return bDirect - aDirect;
          return b.bitrate - a.bitrate;
        })
        .slice(0, 16);

      const hlsSources = dedupe(hlsRows).slice(0, 12);

      if (!sources.length && !hlsSources.length) {
        return json({ ok: false, error: "no_native_stream" }, 404, 5);
      }

      return json({
        ok: true,
        source: successes.map((row) => row.base),
        data: {
          id,
          title,
          uploader,
          thumbnailUrl,
          duration,
          livestream,
          hls: hlsSources[0]?.url || "",
          hlsSources,
          sources,
          audioSources,
        },
      }, 200, livestream ? 5 : 20);
    }

    if (action === "background") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "video")) return json({ ok: false, error: "invalid_video" }, 400, 0);

      const path = `/streams/${enc(id)}`;
      const orderedBases = [
        ...(preferredApi && Date.now() < preferredUntil ? [preferredApi] : []),
        ...PIPED_APIS,
      ].filter((base, index, rows) => base && rows.indexOf(base) === index).slice(0, 7);

      const settled = await Promise.allSettled(
        orderedBases.map(async (base) => ({
          base,
          data: await fetchJson(base, path, 1900),
        })),
      );

      const successes = settled
        .filter((row): row is PromiseFulfilledResult<{ base: string; data: any }> => row.status === "fulfilled")
        .map((row) => row.value);

      if (!successes.length) {
        return json({ ok: false, error: "no_background_stream" }, 503, 0);
      }

      preferredApi = successes[0].base;
      preferredUntil = Date.now() + API_TTL_MS;

      const allSources: Array<{
        url: string;
        mimeType: string;
        bitrate: number;
        sourceApi: string;
      }> = [];
      let title = "";
      let uploader = "";
      let thumbnailUrl = "";
      let duration = 0;

      const proxify = (raw: string, info: any) => {
        try {
          const media = new URL(raw);
          if (media.hostname.endsWith(".googlevideo.com") && info?.proxyUrl) {
            const proxy = new URL(String(info.proxyUrl));
            const prefix = proxy.pathname.endsWith("/") ? proxy.pathname.slice(0, -1) : proxy.pathname;
            media.searchParams.set("host", media.host);
            media.protocol = proxy.protocol;
            media.host = proxy.host;
            media.pathname = prefix + media.pathname;
          }
          return media.toString();
        } catch {
          return raw;
        }
      };

      for (const result of successes) {
        const info: any = result.data || {};
        if (!title) title = String(info.title || "");
        if (!uploader) uploader = String(info.uploader || "");
        if (!thumbnailUrl) thumbnailUrl = String(info.thumbnailUrl || "");
        if (!duration) duration = Number(info.duration) || 0;

        const streams = Array.isArray(info.audioStreams)
          ? info.audioStreams.filter((stream: any) => stream?.url)
          : [];

        for (const stream of streams) {
          allSources.push({
            url: proxify(String(stream.url), info),
            mimeType: String(stream.mimeType || stream.format || ""),
            bitrate: Number(stream.bitrate) || 0,
            sourceApi: result.base,
          });
        }

        if (typeof info.hls === "string" && info.hls) {
          allSources.push({
            url: proxify(info.hls, info),
            mimeType: "application/vnd.apple.mpegurl",
            bitrate: 0,
            sourceApi: result.base,
          });
        }
      }

      const seen = new Set<string>();
      const sources = allSources
        .filter((row) => {
          if (!row.url || seen.has(row.url)) return false;
          seen.add(row.url);
          return true;
        })
        .sort((a, b) => {
          const rank = (row: { mimeType: string; bitrate: number }) => {
            const type = row.mimeType.toLowerCase();
            const formatScore = type.includes("audio/mp4") || type.includes("m4a")
              ? 4
              : type.includes("mpegurl") || type.includes("m3u8")
                ? 3
                : type.includes("audio/webm")
                  ? 2
                  : 1;
            return formatScore * 1_000_000_000 + Math.min(row.bitrate, 999_999_999);
          };
          return rank(b) - rank(a);
        })
        .slice(0, 16);

      if (!sources.length) return json({ ok: false, error: "no_background_stream" }, 404, 0);

      return json({
        ok: true,
        source: successes.map((row) => row.base),
        data: {
          id,
          title,
          uploader,
          thumbnailUrl,
          duration,
          audioUrl: sources[0]?.url || "",
          mimeType: sources[0]?.mimeType || "",
          bitrate: sources[0]?.bitrate || 0,
          sources,
        },
      }, 200, 15);
    }

    if (action === "branding") {
      const raw = String(url.searchParams.get("ids") || "");
      const ids = [...new Set(raw.split(",").map((v) => v.trim()).filter((v) => validId(v, "video")))].slice(0, 24);
      if (!ids.length) return json({ ok: true, data: {} }, 200, 300);

      const fetchBranding = async (id: string) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2200);
        try {
          const endpoint = new URL("https://sponsor.ajay.app/api/branding");
          endpoint.searchParams.set("videoID", id);
          endpoint.searchParams.set("fetchAll", "true");
          const res = await fetch(endpoint, {
            signal: controller.signal,
            headers: { accept: "application/json" },
          });
          if (res.status === 404) return [id, null] as const;
          if (!res.ok) throw new Error(`dearrow_http_${res.status}`);
          const data = await res.json();

          const titleRow = Array.isArray(data?.titles)
            ? data.titles.find((row: any) => row && row.original === false && typeof row.title === "string")
            : null;
          const thumbRow = Array.isArray(data?.thumbnails)
            ? data.thumbnails.find((row: any) => row && row.original === false && Number.isFinite(Number(row.timestamp)))
            : null;

          const out: Record<string, unknown> = {};
          if (titleRow?.title) out.title = String(titleRow.title).replaceAll("‹", "<");
          if (thumbRow) {
            const thumb = new URL("https://dearrow-thumb.ajay.app/api/v1/getThumbnail");
            thumb.searchParams.set("videoID", id);
            thumb.searchParams.set("time", String(Number(thumbRow.timestamp)));
            out.thumbnailUrl = thumb.toString();
            out.thumbnailTime = Number(thumbRow.timestamp);
          }
          return [id, Object.keys(out).length ? out : null] as const;
        } catch {
          return [id, null] as const;
        } finally {
          clearTimeout(timer);
        }
      };

      const rows = await Promise.all(ids.map(fetchBranding));
      const data = Object.fromEntries(rows.filter(([, value]) => value));
      return json({ ok: true, data }, 200, 300);
    }

    if (action === "player") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "video")) return json({ ok: false, error: "invalid_video" }, 400, 0);
      const n = Math.max(0, Number(url.searchParams.get("n")) || 0);
      const base = PLAYER_FRONTS[n % PLAYER_FRONTS.length];
      const target = `${base}/embed/${enc(id)}?autoplay=1`;
      return new Response(null, {
        status: 302,
        headers: { ...CORS, location: target, "cache-control": "no-store" },
      });
    }

    if (action === "health") {
      const source = await chooseApi();
      return json({ ok: true, source }, 200, 10);
    }

    if (action === "video") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "video")) return json({ ok: false, error: "invalid_video" }, 400, 0);

      try {
        const result = await piped(`/streams/${enc(id)}`);
        const data: any = result.data || {};
        if (!Array.isArray(data.relatedStreams) || !data.relatedStreams.length) {
          const title = String(data.title || "").trim();
          if (title) {
            try {
              const related = await piped(`/search?q=${enc(title)}&filter=videos`);
              const items = Array.isArray(related.data?.items) ? related.data.items : [];
              data.relatedStreams = items.filter((row: any) => !String(row?.url || "").includes(id)).slice(0, 18);
            } catch {}
          }
        }
        return json({ ok: true, source: result.source, data }, 200, 30);
      } catch {}

      try {
        const endpoint = new URL("https://www.youtube.com/oembed");
        endpoint.searchParams.set("url", `https://www.youtube.com/watch?v=${id}`);
        endpoint.searchParams.set("format", "json");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2200);
        const res = await fetch(endpoint, { signal: controller.signal, headers: { accept: "application/json" } });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`oembed_http_${res.status}`);
        const meta: any = await res.json();
        const title = String(meta?.title || "").trim();
        let relatedStreams: any[] = [];
        if (title) {
          try {
            const related = await piped(`/search?q=${enc(title)}&filter=videos`);
            relatedStreams = (Array.isArray(related.data?.items) ? related.data.items : [])
              .filter((row: any) => !String(row?.url || "").includes(id))
              .slice(0, 18);
          } catch {}
        }
        return json({
          ok: true,
          source: "youtube-oembed",
          data: {
            title,
            uploader: String(meta?.author_name || ""),
            uploaderUrl: String(meta?.author_url || ""),
            thumbnailUrl: String(meta?.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`),
            views: 0,
            uploadDate: "",
            description: "",
            relatedStreams,
          },
        }, 200, 120);
      } catch {
        return json({
          ok: true,
          source: "youtube",
          data: {
            title: "",
            uploader: "",
            thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            relatedStreams: [],
          },
        }, 200, 20);
      }
    }

    if (action === "regional_feed") {
      const region = String(url.searchParams.get("region") || "VN").toUpperCase().slice(0, 2);
      const result = await regionalUploadFeed(region);
      return json({
        ok: true,
        source: result.source,
        channels: result.channels,
        data: result.data,
      }, 200, 60);
    }

    if (action === "playlist") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "playlist")) return json({ ok: false, error: "invalid_playlist" }, 400, 0);
      const playlistPath = `/playlists/${enc(id)}`;
      let fallback: { base: string; data: any } | null = null;

      for (let i = 0; i < PIPED_APIS.length; i += 5) {
        const group = PIPED_APIS.slice(i, i + 5);
        try {
          const winner = await Promise.any(group.map(async (base) => {
            const data: any = await fetchJson(base, playlistPath, 3200);
            const rows = Array.isArray(data?.relatedStreams) ? data.relatedStreams : [];
            const count = Number(data?.videos) || 0;
            if (!fallback && data) fallback = { base, data };
            if (count > 0 && !rows.length) throw new Error("empty_playlist_items");
            return { base, data };
          }));
          preferredApi = winner.base;
          preferredUntil = Date.now() + API_TTL_MS;
          return json({ ok: true, source: winner.base, data: winner.data }, 200, 60);
        } catch {}
      }

      if (fallback) {
        return json({ ok: true, source: fallback.base, data: fallback.data }, 200, 30);
      }
      throw new Error("no_playlist_instance");
    }

    let path = "";
    let maxAge = 20;

    if (action === "home") {
      const seed = String(url.searchParams.get("seed") || "khám phá việt nam").trim().slice(0, 120);
      path = `/search?q=${enc(seed)}&filter=videos`;
      maxAge = 300;
    } else if (action === "trending") {
      const region = String(url.searchParams.get("region") || "VN").toUpperCase().slice(0, 2);
      path = `/trending?region=${enc(region)}`;
      maxAge = 120;
    } else if (action === "search") {
      const q = String(url.searchParams.get("q") || "").trim();
      const filter = String(url.searchParams.get("filter") || "all").trim();
      if (!q) return json({ ok: true, source: "", data: { items: [], nextpage: null } }, 200, 5);
      path = `/search?q=${enc(q)}&filter=${enc(filter)}`;
      maxAge = 60;
    } else if (action === "search_next") {
      const q = String(url.searchParams.get("q") || "").trim();
      const filter = String(url.searchParams.get("filter") || "all").trim();
      const nextpage = String(url.searchParams.get("nextpage") || "");
      if (!q || !nextpage) return json({ ok: false, error: "missing_search_page" }, 400, 0);
      path = `/nextpage/search?q=${enc(q)}&filter=${enc(filter)}&nextpage=${enc(nextpage)}`;
      maxAge = 10;
    } else if (action === "suggestions") {
      const q = String(url.searchParams.get("q") || "").trim();
      if (!q) return json({ ok: true, source: "youtube-suggest", data: [] }, 200, 10);
      try {
        const suggest = new URL("https://suggestqueries.google.com/complete/search");
        suggest.searchParams.set("client", "firefox");
        suggest.searchParams.set("ds", "yt");
        suggest.searchParams.set("hl", "vi");
        suggest.searchParams.set("gl", "VN");
        suggest.searchParams.set("ie", "utf-8");
        suggest.searchParams.set("oe", "utf-8");
        suggest.searchParams.set("q", q);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1000);
        const res = await fetch(suggest, { signal: controller.signal, headers: { accept: "application/json" } });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          const rows = Array.isArray(data?.[1])
            ? data[1]
                .filter((x: unknown) => typeof x === "string")
                .map((x: string) => x.normalize("NFC").replace(/\s+/g, " ").trim())
                .filter((x: string) => x && !x.includes("\uFFFD"))
                .slice(0, 10)
            : [];
          if (rows.length >= 3) {
            return json({ ok: true, source: "youtube-suggest", data: rows }, 200, 300);
          }
        }
      } catch {}
      const fallback = await piped(`/suggestions?query=${enc(q)}`, 60 * 1000);
      const rows = (Array.isArray(fallback.data?.[1]) ? fallback.data[1] : (Array.isArray(fallback.data) ? fallback.data : []))
        .filter((x: unknown) => typeof x === "string")
        .map((x: string) => x.normalize("NFC").replace(/\s+/g, " ").trim())
        .filter((x: string) => x && !x.includes("\uFFFD"))
        .slice(0, 10);
      return json({ ok: true, source: fallback.source, data: rows }, 200, 180);
    } else if (action === "playlist_next") {
      const id = String(url.searchParams.get("id") || "").trim();
      const nextpage = String(url.searchParams.get("nextpage") || "");
      if (!validId(id, "playlist") || !nextpage) return json({ ok: false, error: "missing_playlist_page" }, 400, 0);
      path = `/nextpage/playlists/${enc(id)}?nextpage=${enc(nextpage)}`;
      maxAge = 15;
    } else if (action === "channel") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "channel")) return json({ ok: false, error: "invalid_channel" }, 400, 0);
      path = `/channel/${enc(id)}`;
      maxAge = 60;
    } else if (action === "channel_next") {
      const id = String(url.searchParams.get("id") || "").trim();
      const nextpage = String(url.searchParams.get("nextpage") || "");
      if (!validId(id, "channel") || !nextpage) return json({ ok: false, error: "missing_channel_page" }, 400, 0);
      path = `/nextpage/channel/${enc(id)}?nextpage=${enc(nextpage)}`;
      maxAge = 15;
    } else if (action === "user") {
      const name = String(url.searchParams.get("name") || "").trim();
      if (!name) return json({ ok: false, error: "missing_user" }, 400, 0);
      path = `/user/${enc(name)}`;
      maxAge = 60;
    } else if (action === "sponsors") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "video")) return json({ ok: false, error: "invalid_video" }, 400, 0);
      const categories = JSON.stringify(["sponsor", "selfpromo", "interaction"]);
      path = `/sponsors/${enc(id)}?category=${enc(categories)}`;
      maxAge = 300;
    } else {
      return json({ ok: false, error: "unknown_action" }, 404, 0);
    }

    const result = await piped(path, Math.max(maxAge, 20) * 1000);
    return json({ ok: true, source: result.source, data: result.data }, 200, maxAge);
  } catch (error) {
    console.error("yt1988", action, error);
    return json({ ok: false, error: "upstream_unavailable" }, 503, 0);
  }
});