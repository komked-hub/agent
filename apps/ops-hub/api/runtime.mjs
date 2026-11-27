import app from '../dist/server/index.js';
import { createAuth } from '../vercel-runtime/auth.mjs';
import { createBindings } from '../vercel-runtime/bindings.mjs';
import { readDeploymentConfig } from '../vercel-runtime/config.mjs';

const authPaths = new Set(['/login', '/oauth/return', '/signin-with-chatgpt']);
const identityHeaders = [
  'oai-authenticated-user-id',
  'oai-authenticated-user-email',
  'oai-authenticated-user-full-name',
  'oai-authenticated-user-full-name-encoding',
];
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};
const uploadLimit = 4 * 1024 * 1024;
const workspaceAssets = /^\/[a-z-]+\.(?:js|css)$/;
let runtime;

function getRuntime() {
  if (runtime) return runtime;
  try {
    const config = readDeploymentConfig(process.env);
    runtime = { config, auth: createAuth(config), ...createBindings(config) };
  } catch (error) {
    console.warn(error?.name === 'Error' ? 'KOMKED runtime setup failed' : 'KOMKED runtime is awaiting configuration');
    runtime = { config: null };
  }
  return runtime;
}

function requestURL(request) {
  const url = new URL(request.url);
  if (url.pathname === '/api/runtime') {
    const path = url.searchParams.get('__ops_path');
    if (!path || !/^\/(?:[a-z0-9.-]+(?:\/[a-z0-9.-]+)*)?$/.test(path) || path === '/api/runtime') return null;
    if (path.split('/').some(segment => segment === '.' || segment === '..')) return null;
    url.pathname = path;
  }
  url.searchParams.delete('__ops_path');
  return url;
}

function withPrivateHeaders(response, body = response.body) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
  return new Response(body, { status: response.status, headers });
}

function json(payload, status) {
  return Response.json(payload, { status, headers: privateHeaders });
}

function setupStatus() {
  return new Response('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KOMKED 팀 운영 공간</title><body><main><h1>KOMKED 팀 운영 공간</h1><p>Vercel 배포가 준비되었습니다. 팀 로그인과 저장소를 연결하면 운영 공간을 열 수 있습니다.</p></main></body></html>', {
    status: 503,
    headers: { ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'" },
  });
}

export default {
  async fetch(request) {
    const url = requestURL(request);
    if (!url) return json({ error: 'not_found' }, 404);
    const { config, auth, env, context } = getRuntime();

    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      return json({ status: config ? 'configured' : 'setup_required' }, config ? 200 : 503);
    }
    if (!config) {
      if (url.pathname === '/' || url.pathname === '/login') return setupStatus();
      return json({ error: 'setup_required' }, 503);
    }
    if (url.origin !== config.origin) {
      if (url.pathname === '/' && request.method === 'GET') {
        return new Response(null, { status: 303, headers: { ...privateHeaders, Location: config.origin + '/' } });
      }
      return json({ error: 'invalid_origin' }, 403);
    }
    if (authPaths.has(url.pathname)) return auth.route(request, url);

    const identity = auth.getIdentity(request);
    if (!identity) {
      if (url.pathname === '/' && request.method === 'GET') {
        return new Response(null, { status: 303, headers: { ...privateHeaders, Location: '/login' } });
      }
      return json({ error: 'sign_in_required' }, 401);
    }
    if (url.pathname !== '/' && !url.pathname.startsWith('/api/') && !workspaceAssets.test(url.pathname)) {
      return json({ error: 'not_found' }, 404);
    }
    if (url.pathname === '/api/workspace/receipts' && request.method === 'POST'
      && Number(request.headers.get('content-length')) > uploadLimit + 16 * 1024) {
      return json({ error: 'file_too_large' }, 413);
    }

    const headers = new Headers(request.headers);
    for (const name of identityHeaders) headers.delete(name);
    headers.set(identityHeaders[0], identity.id);
    headers.set(identityHeaders[1], identity.email);
    if (identity.name) {
      headers.set(identityHeaders[2], encodeURIComponent(identity.name));
      headers.set(identityHeaders[3], 'percent-encoded-utf-8');
    }
    const options = { method: request.method, headers, signal: request.signal };
    if (request.body) Object.assign(options, { body: request.body, duplex: 'half' });
    const response = await app.fetch(new Request(url, options), { ...env, RECEIPT_UPLOAD_LIMIT: uploadLimit }, context);
    if (url.pathname === '/' && request.method === 'GET' && response.ok) {
      const html = (await response.text())
        .replaceAll('{{calendar-spreadsheet-id}}', config.spreadsheets.calendar)
        .replaceAll('{{channels-spreadsheet-id}}', config.spreadsheets.channels)
        .replace('id="receiptForm"', 'id="receiptForm" data-upload-max="' + uploadLimit + '"')
        .replace('사진 1장 · 최대 10 MB', '사진 1장 · 최대 4 MB');
      return withPrivateHeaders(response, html);
    }
    return withPrivateHeaders(response);
  },
};
