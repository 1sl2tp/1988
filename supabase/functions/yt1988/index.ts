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
  const first = await chooseApi();
  try {
    return { source: first, data: await fetchJson(first, path, 5000) };
  } catch {
    if (preferredApi === first) {
      preferredApi = "";
      preferredUntil = 0;
    }
    const second = await chooseApi(first);
    return { source: second, data: await fetchJson(second, path, 5000) };
  }
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

    let path = "";
    let maxAge = 20;

    if (action === "trending") {
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
      if (!q) return json({ ok: true, source: "", data: [] }, 200, 10);
      path = `/suggestions?query=${enc(q)}`;
      maxAge = 60;
    } else if (action === "video") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (!validId(id, "video")) return json({ ok: false, error: "invalid_video" }, 400, 0);
      path = `/streams/${enc(id)}`;
      maxAge = 30;
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