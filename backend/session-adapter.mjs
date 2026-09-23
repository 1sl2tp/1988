import http from "node:http";

const port = Number(process.env.PORT || 8080);
const upstream = "http://127.0.0.1:4416";

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
  });
  res.end(data);
}

async function getPot(res) {
  try {
    const response = await fetch(upstream + "/get_pot", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(25000),
    });

    const text = await response.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}

    if (!response.ok) {
      return json(res, response.status, {
        error: data?.error || text || "bgutil_failed",
      });
    }

    const potoken = String(data?.poToken || "");
    const visitor_data = String(data?.contentBinding || "");
    if (!potoken || !visitor_data) {
      return json(res, 502, { error: "bgutil_invalid_response" });
    }

    return json(res, 200, {
      potoken,
      visitor_data,
      expires_at: data?.expiresAt || null,
    });
  } catch (error) {
    return json(res, 502, {
      error: String(error?.message || error || "bgutil_unavailable"),
    });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/ping") {
    try {
      const upstreamResponse = await fetch(upstream + "/ping", {
        signal: AbortSignal.timeout(3000),
      });
      const data = await upstreamResponse.json();
      return json(res, upstreamResponse.ok ? 200 : 502, {
        ok: upstreamResponse.ok,
        adapter: "1988-bgutil",
        upstream: data,
      });
    } catch (error) {
      return json(res, 503, {
        ok: false,
        error: String(error?.message || error),
      });
    }
  }

  if ((req.url === "/get_pot" || req.url === "/token") && (req.method === "POST" || req.method === "GET")) {
    return getPot(res);
  }

  json(res, 404, { error: "not_found" });
});

server.listen(port, "0.0.0.0", () => {
  console.log("[1988-session-adapter] listening on 0.0.0.0:" + port);
});
