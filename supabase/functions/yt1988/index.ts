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
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "content-type",
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

async function chooseApi(exclude = "") {
  if (preferredApi && preferredApi !== exclude && Date.now() < preferredUntil) {
    return preferredApi;
  }
  const candidates = PIPED_APIS.filter((url) => url !== exclude);
  for (let i = 0; i < candidates.length; i += 5) {
    const group = candidates.slice(i, i + 5);
    try {
      const winner = await Promise.any(
        group.map(async (base) => {
          await fetchJson(base, "/config", 1700);
          return base;
        }),
      );
      preferredApi = winner;
      preferredUntil = Date.now() + API_TTL_MS;
      return winner;
    } catch {
      // Try next group.
    }
  }
  throw new Error("no_piped_instance");
}

async function piped(path: string) {
  if (preferredApi && Date.now() < preferredUntil) {
    try {
      return { source: preferredApi, data: await fetchJson(preferredApi, path, 2400) };
    } catch {
      preferredApi = "";
      preferredUntil = 0;
    }
  }

  for (let i = 0; i < PIPED_APIS.length; i += 5) {
    const group = PIPED_APIS.slice(i, i + 5);
    try {
      const winner = await Promise.any(group.map(async (base) => {
        const data = await fetchJson(base, path, 2800);
        return { base, data };
      }));
      preferredApi = winner.base;
      preferredUntil = Date.now() + API_TTL_MS;
      return { source: winner.base, data: winner.data };
    } catch {
      // race next group
    }
  }
  throw new Error("no_piped_instance");
}

function enc(value: string) {
  return encodeURIComponent(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405, 0);

  const url = new URL(req.url);
  const action = String(url.searchParams.get("action") || "health").toLowerCase();

  try {
    if (action === "background") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "video")) return json({ ok: false, error: "invalid_video" }, 400, 0);
      const result = await piped(`/streams/${enc(id)}`);
      const info: any = result.data || {};
      const streams = Array.isArray(info.audioStreams) ? info.audioStreams.filter((s: any) => s?.url) : [];
      if (!streams.length) return json({ ok: false, error: "no_audio_stream" }, 404, 0);

      const proxify = (raw: string) => {
        try {
          const media = new URL(raw);
          if (media.hostname.endsWith(".googlevideo.com") && info.proxyUrl) {
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

      const sources = streams
        .slice()
        .sort((a: any, b: any) => {
          const aType = String(a?.mimeType || "");
          const bType = String(b?.mimeType || "");
          const aMp4 = aType.includes("audio/mp4") ? 2 : aType.includes("mp4") ? 1 : 0;
          const bMp4 = bType.includes("audio/mp4") ? 2 : bType.includes("mp4") ? 1 : 0;
          if (aMp4 !== bMp4) return bMp4 - aMp4;
          return (Number(b?.bitrate) || 0) - (Number(a?.bitrate) || 0);
        })
        .slice(0, 8)
        .map((stream: any) => ({
          url: proxify(String(stream.url)),
          mimeType: String(stream.mimeType || ""),
          bitrate: Number(stream.bitrate) || 0,
        }));

      return json({
        ok: true,
        source: result.source,
        data: {
          id,
          title: info.title || "",
          uploader: info.uploader || "",
          thumbnailUrl: info.thumbnailUrl || "",
          duration: Number(info.duration) || 0,
          audioUrl: sources[0]?.url || "",
          mimeType: sources[0]?.mimeType || "",
          bitrate: sources[0]?.bitrate || 0,
          sources,
        },
      }, 200, 20);
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

    let path = "";
    let maxAge = 20;

    if (action === "home") {
      const seed = String(url.searchParams.get("seed") || "khám phá việt nam").trim().slice(0, 120);
      path = `/search?q=${enc(seed)}&filter=videos`;
      maxAge = 45;
    } else if (action === "trending") {
      const region = String(url.searchParams.get("region") || "VN").toUpperCase().slice(0, 2);
      path = `/trending?region=${enc(region)}`;
      maxAge = 60;
    } else if (action === "search") {
      const q = String(url.searchParams.get("q") || "").trim();
      const filter = String(url.searchParams.get("filter") || "all").trim();
      if (!q) return json({ ok: true, source: "", data: { items: [], nextpage: null } }, 200, 5);
      path = `/search?q=${enc(q)}&filter=${enc(filter)}`;
      maxAge = 20;
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
        const timer = setTimeout(() => controller.abort(), 1800);
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
            return json({ ok: true, source: "youtube-suggest", data: rows }, 200, 120);
          }
        }
      } catch {}
      const fallback = await piped(`/suggestions?query=${enc(q)}`);
      const rows = (Array.isArray(fallback.data?.[1]) ? fallback.data[1] : (Array.isArray(fallback.data) ? fallback.data : []))
        .filter((x: unknown) => typeof x === "string")
        .map((x: string) => x.normalize("NFC").replace(/\s+/g, " ").trim())
        .filter((x: string) => x && !x.includes("\uFFFD"))
        .slice(0, 10);
      return json({ ok: true, source: fallback.source, data: rows }, 200, 60);
    } else if (action === "playlist") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "playlist")) return json({ ok: false, error: "invalid_playlist" }, 400, 0);
      path = `/playlists/${enc(id)}`;
      maxAge = 60;
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

    const result = await piped(path);
    return json({ ok: true, source: result.source, data: result.data }, 200, maxAge);
  } catch (error) {
    console.error("yt1988", action, error);
    return json({ ok: false, error: "upstream_unavailable" }, 503, 0);
  }
});