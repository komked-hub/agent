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

function safeSourceId(name) {
  const value = process.env[name]?.trim() || '';
  return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : '';
}

async function setupMode(request, url) {
  if (url.pathname === '/login') {
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: '/' } });
  }
  if (url.pathname === '/api/calendar/time' && request.method === 'GET') {
    return json({ now: Date.now(), mode: 'limited' }, 200);
  }
  const isAsset = workspaceAssets.test(url.pathname);
  if ((url.pathname !== '/' && !isAsset) || !['GET', 'HEAD'].includes(request.method)) {
    return json({ error: 'setup_required' }, 503);
  }
  const sourceRequest = new Request(url, { method: request.method, headers: request.headers });
  const response = await app.fetch(sourceRequest, {}, {});
  if (url.pathname !== '/' || request.method === 'HEAD' || !response.ok) return withPrivateHeaders(response);
  const notice = `<div role="status" style="position:relative;z-index:20;padding:.7rem 1rem;background:#fff4d6;color:#5c4310;border-bottom:1px solid #e5c879;font:600 14px/1.5 system-ui,sans-serif">연결 준비 모드 · 화면과 브라우저 저장 기능은 사용할 수 있습니다. 팀 로그인, 공용 저장, 영수증 업로드와 관리 변경은 운영 연결이 완료될 때까지 잠겨 있습니다.</div>`;
  const html = (await response.text())
    .replace('<body>', '<body>' + notice)
    .replaceAll('{{calendar-spreadsheet-id}}', safeSourceId('GOOGLE_CALENDAR_SPREADSHEET_ID'))
    .replaceAll('{{channels-spreadsheet-id}}', safeSourceId('GOOGLE_CHANNELS_SPREADSHEET_ID'));
  return withPrivateHeaders(response, html);
}

export default {
  async fetch(request) {
    const url = requestURL(request);
    if (!url) return json({ error: 'not_found' }, 404);
    const { config, auth, env, context } = getRuntime();

    if (url.pathname === '/api/health') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      return json({ status: config ? 'configured' : 'limited' }, 200);
    }
    if (!config) return setupMode(request, url);
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
