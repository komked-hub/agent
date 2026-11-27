import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

const sessionCookie = '__Host-komked-session';
const loginCookie = '__Host-komked-login';
const sessionDuration = 8 * 60 * 60;
const loginDuration = 8 * 60;
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

function cookie(request, name) {
  const input = request.headers.get('cookie') ?? '';
  return input.split(';').map(item => item.trim()).find(item => item.startsWith(name + '='))?.slice(name.length + 1);
}

function encode(secret, kind, data, ttl) {
  const body = Buffer.from(JSON.stringify({ ...data, expire: Date.now() + ttl * 1000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(kind + '.' + body).digest('base64url');
  return body + '.' + signature;
}

function decode(secret, kind, input) {
  if (!input || input.length > 4000) return null;
  const [body, signature, extra] = input.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = createHmac('sha256', secret).update(kind + '.' + body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    return Number.isFinite(data?.expire) && data.expire > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function writeCookie(name, value, ttl) {
  return name + '=' + value + '; Max-Age=' + ttl + '; Path=/; Secure; HttpOnly; SameSite=Lax';
}

function redirect(destination, cookies = []) {
  const headers = new Headers({ ...privateHeaders, Location: destination });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 303, headers });
}

function returnTo(value) {
  return /^\/(?:#[a-z]+(?:\?[a-z0-9=&-]{1,180})?)?$/i.test(value ?? '') ? value : '/';
}

function loginPage(problem = false) {
  const body = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>KOMKED 팀 운영 공간 로그인</title><style>
  *,*::before{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#faf6f2;color:#1c1c19;font:16px system-ui,sans-serif}
  main{width:min(100%,440px);padding:32px;background:#fff;border-radius:16px;border:1px solid #d4c1b1}
  h1{font-size:1.4rem}p{line-height:1.55;color:#645249}a{display:inline-flex;min-height:44px;align-items:center;padding:0 18px;border-radius:10px;background:#645249;color:white;text-decoration:none}
  @media(prefers-color-scheme:dark){body{background:#141311;color:#e5e2de}main{background:#1c1c19;border-color:#4f4540}p{color:#d2c4bd}a{background:#dac2b6;color:#3d2d25}}
  </style></head><body><main><h1>KOMKED 팀 운영 공간</h1>
  <p>${problem ? '로그인할 수 없어요. 허용된 KOMKED 계정인지 확인하고 다시 시도해 주세요.' : '등록된 KOMKED 팀 계정으로 로그인하세요.'}</p>
  <a href="/signin-with-chatgpt">Google 계정으로 로그인</a></main></body></html>`;
  return new Response(body, { status: problem ? 403 : 200, headers: {
    ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  } });
}

export function createAuth(config) {
  const callback = config.origin + '/oauth/return';
  const client = new OAuth2Client(config.oauthClient, config.oauthSecret, callback);

  function getIdentity(request) {
    const identity = decode(config.secret, 'session', cookie(request, sessionCookie));
    if (!identity || typeof identity.sub !== 'string' || !identity.sub || !config.allowed.has(identity.email)) return null;
    const legacy = Object.hasOwn(config.aliases, identity.email) ? config.aliases[identity.email] : null;
    return { id: legacy || 'google:' + identity.sub, email: identity.email, name: identity.name };
  }

  async function route(request, url) {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: privateHeaders });
    if (url.pathname === '/login') return getIdentity(request) ? redirect('/') : loginPage();
    if (url.pathname === '/signin-with-chatgpt') {
      const state = randomBytes(32).toString('base64url');
      const verifier = randomBytes(48).toString('base64url');
      const nonce = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const login = encode(config.secret, 'oauth', { state, verifier, nonce, to: returnTo(url.searchParams.get('return_to')) }, loginDuration);
      const target = client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'], state, nonce,
        code_challenge_method: 'S256', code_challenge: challenge, prompt: 'select_account',
      });
      return redirect(target, [writeCookie(loginCookie, login, loginDuration)]);
    }

    const saved = decode(config.secret, 'oauth', cookie(request, loginCookie));
    const code = url.searchParams.get('code');
    if (!saved || url.searchParams.get('state') !== saved.state || !code) return loginPage(true);
    try {
      const { tokens } = await client.getToken({ code, codeVerifier: saved.verifier, redirect_uri: callback });
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.oauthClient });
      const user = ticket.getPayload();
      const email = user?.email?.trim().toLowerCase();
      if (!user?.sub || user.nonce !== saved.nonce || user.email_verified !== true || !config.allowed.has(email)) return loginPage(true);
      const signed = encode(config.secret, 'session', {
        sub: user.sub, email, name: String(user.name ?? '').trim().slice(0, 80),
      }, sessionDuration);
      return redirect(returnTo(saved.to), [
        writeCookie(loginCookie, '', 0), writeCookie(sessionCookie, signed, sessionDuration),
      ]);
    } catch {
      return loginPage(true);
    }
  }
  return { getIdentity, route, login: loginPage };
}
