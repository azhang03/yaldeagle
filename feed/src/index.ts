// The public store of the YALDAQ feed. GET serves the files from R2 to every origin.
// PUT takes uploads from the exporter. The exporter must send the upload token, and the
// file must pass the same check that the dev server runs.

import { env } from 'cloudflare:workers';
import { checkUpload } from '../../src/yaldaq/data/check';
import { FEED_PATH, cacheSeconds } from '../../src/yaldaq/data/feed-paths';

const MAX_BYTES = 2_000_000;
const JSON_TYPE = 'application/json; charset=utf-8';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'access-control-allow-origin': '*', 'content-type': JSON_TYPE, ...headers },
  });
}

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

async function get(request: Request, path: string): Promise<Response> {
  const obj = await env.FEED.get(path, { onlyIf: request.headers });
  const cors = { 'access-control-allow-origin': '*' };
  // A missing file is "not there yet". A 204 keeps the page console free of errors.
  if (obj === null) {
    return new Response(null, {
      status: 204,
      headers: { ...cors, 'cache-control': 'public, max-age=20' },
    });
  }
  if (!('body' in obj)) {
    return new Response(null, { status: 304, headers: { ...cors, etag: obj.httpEtag } });
  }
  return new Response(request.method === 'HEAD' ? null : obj.body, {
    status: 200,
    headers: {
      ...cors,
      'content-type': JSON_TYPE,
      etag: obj.httpEtag,
      'cache-control': `public, max-age=${cacheSeconds(path, Date.now())}`,
    },
  });
}

async function put(request: Request, path: string): Promise<Response> {
  const token = (env as unknown as { UPLOAD_TOKEN?: string }).UPLOAD_TOKEN;
  if (!token) return json(503, { error: 'no-token' });
  const [given, wanted] = await Promise.all([
    sha256(request.headers.get('authorization') ?? ''),
    sha256(`Bearer ${token}`),
  ]);
  if (!crypto.subtle.timingSafeEqual(given, wanted)) return json(401, { error: 'unauthorized' });

  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES) {
    return json(413, { error: 'too-large' });
  }
  const text = await request.text();
  if (text.length > MAX_BYTES) return json(413, { error: 'too-large' });

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return json(400, { error: 'bad-json' });
  }
  const result = checkUpload(path, data, Date.now());
  if (!result.ok) return json(422, { error: result.rule });

  const obj = await env.FEED.put(path, text, { httpMetadata: { contentType: JSON_TYPE } });
  return json(200, { ok: true, etag: obj.httpEtag });
}

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const path = pathname.startsWith('/v1/') ? pathname.slice(4) : '';
    if (!FEED_PATH.test(path)) return json(404, { error: 'not-found' });

    switch (request.method) {
      case 'OPTIONS':
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, HEAD, OPTIONS',
            'access-control-allow-headers': 'if-none-match',
            'access-control-max-age': '86400',
          },
        });
      case 'GET':
      case 'HEAD':
        return get(request, path);
      case 'PUT':
        return put(request, path);
      default:
        return json(405, { error: 'method' });
    }
  },
} satisfies ExportedHandler;
