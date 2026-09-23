import http from 'node:http';
import { Readable } from 'node:stream';

const PORT = Number(process.env.PORT || 10000);

const ALLOWED_ORIGINS = new Set([
  'https://yt.taphoa.xyz',
  'https://1sl2tp.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

function isAllowedTarget(hostname) {
  const h = String(hostname || '').toLowerCase().split(':')[0];
  return h === 'youtube.com' ||
    h.endsWith('.youtube.com') ||
    h === 'youtubei.googleapis.com' ||
    h.endsWith('.googlevideo.com') ||
    h.endsWith('.googleapis.com') ||
    h.endsWith('.googleusercontent.com') ||
    h.endsWith('.ytimg.com') ||
    h.endsWith('.gstatic.com');
}

function corsHeaders(origin, requestedHeaders = '') {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://yt.taphoa.xyz';
  const allowHeaders = requestedHeaders || [
    'accept',
    'accept-language',
    'authorization',
    'content-type',
    'range',
    'x-goog-visitor-id',
    'x-origin',
    'x-youtube-client-name',
    'x-youtube-client-version'
  ].join(', ');

  return {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': 'GET,POST,HEAD,OPTIONS',
    'access-control-allow-headers': allowHeaders,
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'content-length,content-type,content-range,accept-ranges,content-disposition,cache-control,etag,last-modified,x-kira-proxy',
    'access-control-max-age': '86400',
    'vary': 'Origin, Access-Control-Request-Headers',
    'x-kira-proxy': '1988-render-v2-cors'
  };
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function copySafeResponseHeaders(from, to) {
  const names = [
    'content-type',
    'content-range',
    'accept-ranges',
    'content-disposition',
    'cache-control',
    'etag',
    'last-modified'
  ];
  for (const name of names) {
    const value = from.get(name);
    if (value) to[name] = value;
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  console.log('[proxy-request]', req.method, req.url);

  if (req.method === 'OPTIONS') {
    const requestedHeaders = String(req.headers['access-control-request-headers'] || '');
    console.log('[proxy-preflight]', req.url, 'origin=' + origin, 'headers=' + requestedHeaders);
    res.writeHead(204, corsHeaders(origin, requestedHeaders));
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, {
      ...corsHeaders(origin),
      'content-type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify({
      ok: true,
      service: '1988-kira-proxy',
      version: 'render-v1'
    }));
    return;
  }

  try {
    const incoming = new URL(req.url, 'https://kira-proxy.local');
    const targetHost = incoming.searchParams.get('__host') || '';

    if (!targetHost || !isAllowedTarget(targetHost)) {
      res.writeHead(400, {
        ...corsHeaders(origin),
        'content-type': 'text/plain; charset=utf-8'
      });
      res.end('Invalid or disallowed __host');
      return;
    }

    let serializedHeaders = [];
    try {
      const parsed = JSON.parse(incoming.searchParams.get('__headers') || '[]');
      if (Array.isArray(parsed)) serializedHeaders = parsed;
    } catch {}

    incoming.searchParams.delete('__host');
    incoming.searchParams.delete('__headers');

    const target = new URL('https://' + targetHost + incoming.pathname + incoming.search);
    const upstreamHeaders = new Headers(serializedHeaders);

    if (req.headers.range && !upstreamHeaders.has('range')) {
      upstreamHeaders.set('range', req.headers.range);
    }

    upstreamHeaders.delete('host');
    upstreamHeaders.delete('content-length');
    upstreamHeaders.delete('connection');
    upstreamHeaders.delete('accept-encoding');

    const body = await readBody(req);
    const startedAt = Date.now();
    const upstream = await fetch(target, {
      method: req.method,
      headers: upstreamHeaders,
      body,
      redirect: 'follow'
    });
    console.log(
      '[proxy-response]',
      req.method,
      incoming.pathname,
      'host=' + targetHost,
      'status=' + upstream.status,
      'ms=' + (Date.now() - startedAt),
      'encoding=' + (upstream.headers.get('content-encoding') || '-'),
      'length=' + (upstream.headers.get('content-length') || '-')
    );

    const responseHeaders = corsHeaders(origin);
    copySafeResponseHeaders(upstream.headers, responseHeaders);

    if (!upstream.ok) {
      const errorBytes = Buffer.from(await upstream.arrayBuffer());
      const errorText = errorBytes.toString('utf8').slice(0, 4000);
      console.log(
        '[proxy-upstream-error]',
        req.method,
        incoming.pathname,
        'host=' + targetHost,
        'status=' + upstream.status,
        'body=' + errorText.replace(/\s+/g, ' ')
      );
      res.writeHead(upstream.status, responseHeaders);
      res.end(errorBytes);
      return;
    }

    res.writeHead(upstream.status, responseHeaders);

    if (req.method === 'HEAD' || !upstream.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    res.writeHead(502, {
      ...corsHeaders(origin),
      'content-type': 'application/json; charset=utf-8'
    });
    res.end(JSON.stringify({
      ok: false,
      error: String(error?.message || error)
    }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[1988-kira-proxy] listening on ' + PORT);
});
