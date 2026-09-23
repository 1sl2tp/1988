// Example Deno based proxy server for those who can't or don't want to use the
// companion browser extension.

import { serve } from 'https://deno.land/std@0.148.0/http/server.ts';

const port = 8080;

const COBALT_INSTANCES = [
  'https://cobaltapi.cjs.nz',
  'https://api.cobalt.liubquanti.click'
];

function proxyCors(origin: string) {
  return new Headers({
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
    'Access-Control-Allow-Credentials': origin ? 'true' : 'false',
    'Content-Type': 'application/json'
  });
}

async function resolveWithCobalt(payload: Record<string, unknown>) {
  let lastError = 'no_resolver_response';

  for (const instance of COBALT_INSTANCES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(instance + '/', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': '1988-CobaltProxy/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (
        response.ok &&
        data &&
        typeof data === 'object' &&
        ['tunnel', 'redirect'].includes(String(data.status || '')) &&
        typeof data.url === 'string' &&
        data.url
      ) {
        return { ok: true as const, data };
      }

      lastError = data?.error?.code || ('HTTP_' + response.status);
      console.warn('[cobalt]', instance, lastError);
    } catch (error) {
      lastError = error instanceof DOMException && error.name === 'AbortError'
        ? 'timeout'
        : String(error);
      console.warn('[cobalt]', instance, lastError);
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false as const, error: lastError };
}

const ALLOWED_HEADERS = [
  'Origin',
  'X-Requested-With',
  'Content-Type',
  'Accept',
  'Authorization',
  'x-goog-visitor-id',
  'x-goog-api-key',
  'x-origin',
  'x-youtube-client-version',
  'x-youtube-client-name',
  'x-goog-api-format-version',
  'x-goog-authuser',
  'x-user-agent',
  'Accept-Language',
  'X-Goog-FieldMask',
  'Range',
  'Referer',
  'Cookie'
].join(', ');

function copyHeader(headerName: string, to: Headers, from: Headers) {
  const hdrVal = from.get(headerName);
  if (hdrVal) {
    to.set(headerName, hdrVal);
  }
}

const handler = async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin') || '';

  // If options send do CORS preflight
  if (request.method === 'OPTIONS') {
    const response = new Response('', {
      status: 200,
      headers: new Headers({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': ALLOWED_HEADERS,
        'Access-Control-Max-Age': '86400',
        'Access-Control-Allow-Credentials': 'true'
      })
    });
    return response;
  }

  const url = new URL(request.url, 'http://localhost/');

  if (url.pathname === '/api/cobalt') {
    if (request.method !== 'POST' && request.method !== 'GET') {
      return new Response(JSON.stringify({ status: 'error', error: { code: 'method_not_allowed' } }), {
        status: 405,
        headers: proxyCors(origin)
      });
    }

    let input: any = {};
    if (request.method === 'POST') {
      try {
        input = await request.json();
      } catch {
        return new Response(JSON.stringify({ status: 'error', error: { code: 'invalid_json' } }), {
          status: 400,
          headers: proxyCors(origin)
        });
      }
    } else {
      input = Object.fromEntries(url.searchParams.entries());
    }

    const videoUrl = String(input?.url || '').trim();
    if (!/^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//i.test(videoUrl)) {
      return new Response(JSON.stringify({ status: 'error', error: { code: 'invalid_youtube_url' } }), {
        status: 400,
        headers: proxyCors(origin)
      });
    }

    const boolParam = (value: unknown, fallback: boolean) => {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value === 'true' || value === '1') return true;
        if (value === 'false' || value === '0') return false;
      }
      return fallback;
    };

    const payload = {
      url: videoUrl,
      videoQuality: String(input?.videoQuality || '360'),
      youtubeVideoCodec: 'h264',
      youtubeVideoContainer: 'mp4',
      downloadMode: 'auto',
      alwaysProxy: boolParam(input?.alwaysProxy, true),
      youtubeHLS: boolParam(input?.youtubeHLS, false),
      localProcessing: String(input?.localProcessing || 'disabled')
    };

    const resolved = await resolveWithCobalt(payload);
    if (!resolved.ok) {
      return new Response(JSON.stringify({
        status: 'error',
        error: { code: 'all_cobalt_instances_failed', detail: resolved.error }
      }), {
        status: 502,
        headers: proxyCors(origin)
      });
    }

    return new Response(JSON.stringify(resolved.data), {
      status: 200,
      headers: proxyCors(origin)
    });
  }
  if (!url.searchParams.has('__host')) {
    return new Response(
      'Request is formatted incorrectly. Please include __host in the query string.',
      { status: 400 }
    );
  }

  // Set the URL host to the __host parameter
  url.host = url.searchParams.get('__host')!;
  url.protocol = 'https';
  url.port = '443';
  url.searchParams.delete('__host');

  // Copy headers from the request to the new request
  const request_headers = new Headers(
    JSON.parse(url.searchParams.get('__headers') || '{}')
  );
  copyHeader('range', request_headers, request.headers);

  if (!request_headers.has('user-agent'))
    copyHeader('user-agent', request_headers, request.headers);

  url.searchParams.delete('__headers');


  if (url.host === 'www.youtube.com' || url.host.endsWith('.youtube.com')) {
    request_headers.set('origin', 'https://www.youtube.com');
    request_headers.set('referer', 'https://www.youtube.com/');
  } else if (url.host === 'youtubei.googleapis.com') {
    // Server-to-server Google APIs calls must not carry the browser-facing
    // YouTube Origin/Referer pair or Google rejects them as XD3 mismatch.
    request_headers.delete('origin');
    request_headers.delete('referer');
  }

  if (request.method === 'POST' && url.pathname.startsWith('/youtubei/')) {
    request_headers.set('content-type', 'application/json');
    request_headers.set('accept', '*/*');
  }
  
  if (request.headers.has('Authorization')) {
    request_headers.set('Authorization', request.headers.get('Authorization')!);
  }

  const started = Date.now();
  let fetchRes: Response;
  try {
    fetchRes = await fetch(url, {
      method: request.method,
      headers: request_headers,
      body: request.body,
      credentials: 'same-origin'
    });
  } catch (error) {
    console.error('[proxy]', request.method, url.host, url.pathname, 'fetch_error', String(error));
    return new Response('upstream_fetch_failed', {
      status: 502,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true'
      }
    });
  }
  if (fetchRes.status >= 400) {
    let detail = '';
    try {
      detail = (await fetchRes.clone().text()).replace(/\s+/g, ' ').slice(0, 500);
    } catch {}
    console.warn('[proxy]', request.method, url.host, url.pathname, fetchRes.status, Date.now() - started + 'ms', detail);
  }

  // Construct the return headers
  const headers = new Headers();

  // Copy content headers
  copyHeader('content-length', headers, fetchRes.headers);
  copyHeader('content-type', headers, fetchRes.headers);
  copyHeader('content-disposition', headers, fetchRes.headers);
  copyHeader('accept-ranges', headers, fetchRes.headers);
  copyHeader('content-range', headers, fetchRes.headers);

  // Add cors headers
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Credentials', 'true');

  // Return the proxied response
  return new Response(fetchRes.body, {
    status: fetchRes.status,
    headers: headers
  });
};

await serve(handler, { port });
