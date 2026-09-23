const ALLOWED_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtubei.googleapis.com",
  "www.google.com",
]);

const PASS_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "range",
  "x-goog-api-key",
  "x-goog-visitor-id",
  "x-origin",
  "x-youtube-client-name",
  "x-youtube-client-version",
];

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
    "Cache-Control": "no-store",
  };
}

function allowed(host) {
  if (ALLOWED_HOSTS.has(host)) return true;
  return [...ALLOWED_HOSTS].some((x) => host.endsWith("." + x));
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    if (!["GET", "HEAD", "POST"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405, headers: cors() });
    }

    const incoming = new URL(request.url);
    const raw = incoming.searchParams.get("url");
    if (!raw) return new Response("Missing ?url=", { status: 400, headers: cors() });

    let target;
    try { target = new URL(raw); }
    catch { return new Response("Invalid URL", { status: 400, headers: cors() }); }

    if (target.protocol !== "https:" || !allowed(target.hostname)) {
      return new Response("Host not allowed", { status: 403, headers: cors() });
    }

    const headers = new Headers();
    for (const name of PASS_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const upstream = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.arrayBuffer() : undefined,
      redirect: "follow",
    });

    const outHeaders = new Headers(upstream.headers);
    for (const [k, v] of Object.entries(cors())) outHeaders.set(k, v);

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: outHeaders,
    });
  },
};
