// Runtime adapter for Render.
// Proxy behavior below mirrors LuanRT/kira proxy/deno.ts @ 7a41cdc541cc80235a88314383b29a4a4ea712d1.

import http from 'node:http';
import { Readable } from 'node:stream';

const port = Number(process.env.PORT || 10000);

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

function copyHeader(headerName, to, from) {
  const value = from.get(headerName);
  if (value) to.set(headerName, value);
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': ALLOWED_HEADERS,
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true'
    });
    res.end('');
    return;
  }

  try {
    const url = new URL(req.url || '/', 'http://localhost/');

    if (!url.searchParams.has('__host')) {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Request is formatted incorrectly. Please include __host in the query string.');
      return;
    }

    url.host = url.searchParams.get('__host');
    url.protocol = 'https:';
    url.port = '443';
    url.searchParams.delete('__host');

    const requestHeaders = new Headers(
      JSON.parse(url.searchParams.get('__headers') || '{}')
    );

    if (req.headers.range) {
      requestHeaders.set('range', req.headers.range);
    }

    if (!requestHeaders.has('user-agent') && req.headers['user-agent']) {
      requestHeaders.set('user-agent', req.headers['user-agent']);
    }

    url.searchParams.delete('__headers');

    if (url.host.includes('youtube')) {
      requestHeaders.set('origin', 'https://www.youtube.com');
      requestHeaders.set('referer', 'https://www.youtube.com/');
    }

    if (req.headers.authorization) {
      requestHeaders.set('Authorization', req.headers.authorization);
    }

    const body = await readBody(req);
    const fetchRes = await fetch(url, {
      method: req.method,
      headers: requestHeaders,
      body,
      credentials: 'same-origin'
    });

    const headers = new Headers();
    copyHeader('content-length', headers, fetchRes.headers);
    copyHeader('content-type', headers, fetchRes.headers);
    copyHeader('content-disposition', headers, fetchRes.headers);
    copyHeader('accept-ranges', headers, fetchRes.headers);
    copyHeader('content-range', headers, fetchRes.headers);

    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Credentials', 'true');

    const responseHeaders = Object.fromEntries(headers.entries());
    res.writeHead(fetchRes.status, responseHeaders);

    if (!fetchRes.body || req.method === 'HEAD') {
      res.end();
      return;
    }

    Readable.fromWeb(fetchRes.body).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(String(error?.stack || error));
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log('Kira proxy listening on ' + port);
});
