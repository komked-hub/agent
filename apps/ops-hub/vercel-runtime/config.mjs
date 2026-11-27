export class DeploymentConfigurationError extends Error {}

function requireSetting(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new DeploymentConfigurationError('Missing ' + name);
  return value;
}

function canonicalOrigin(env) {
  const fromVercel = env.VERCEL_PROJECT_PRODUCTION_URL;
  let url;
  try {
    url = new URL(env.APP_ORIGIN || (fromVercel ? 'https://' + fromVercel : ''));
  } catch {
    throw new DeploymentConfigurationError('APP_ORIGIN must be an HTTPS origin');
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new DeploymentConfigurationError('APP_ORIGIN must be an HTTPS origin');
  }
  return url.origin;
}

function jsonObject(value, name) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch {}
  throw new DeploymentConfigurationError('Invalid ' + name);
}

function spreadsheetId(env, name) {
  const id = requireSetting(env, name);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(id)) throw new DeploymentConfigurationError('Invalid ' + name);
  return id;
}

export function readDeploymentConfig(env) {
  const allowed = new Set(requireSetting(env, 'KOMKED_ALLOWED_EMAILS').toLowerCase()
    .split(',').map(email => email.trim()).filter(Boolean));
  const admin = requireSetting(env, 'SITE_LAYOUT_ADMIN_EMAIL').toLowerCase();
  if (!allowed.has(admin)) throw new DeploymentConfigurationError('The admin email must be allowlisted');
  const secret = requireSetting(env, 'APP_SESSION_SECRET');
  if (Buffer.byteLength(secret) < 32) throw new DeploymentConfigurationError('APP_SESSION_SECRET is too short');
  const aliases = jsonObject(env.KOMKED_LEGACY_OWNER_MAP || '{}', 'KOMKED_LEGACY_OWNER_MAP');
  const legacyIds = new Set();
  for (const [email, id] of Object.entries(aliases)) {
    if (!allowed.has(email) || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,160}$/.test(id) || legacyIds.has(id)) {
      throw new DeploymentConfigurationError('Invalid or duplicate legacy identity mapping');
    }
    legacyIds.add(id);
  }
  const sheets = jsonObject(requireSetting(env, 'GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON'), 'GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON');
  if (typeof sheets.client_email !== 'string' || typeof sheets.private_key !== 'string') {
    throw new DeploymentConfigurationError('A Google Sheets service account is required');
  }
  const cloudflareAccount = requireSetting(env, 'CLOUDFLARE_ACCOUNT_ID');
  const d1Id = requireSetting(env, 'CLOUDFLARE_D1_DATABASE_ID');
  if (!/^[0-9a-f]{32}$/i.test(cloudflareAccount) || !/^[0-9a-f-]{36}$/i.test(d1Id)) {
    throw new DeploymentConfigurationError('Invalid Cloudflare account or D1 database ID');
  }
  return {
    origin: canonicalOrigin(env), allowed, admin, secret, aliases,
    oauthClient: requireSetting(env, 'GOOGLE_OAUTH_CLIENT_ID'),
    oauthSecret: requireSetting(env, 'GOOGLE_OAUTH_CLIENT_SECRET'),
    sheets: { client_email: sheets.client_email, private_key: sheets.private_key },
    spreadsheets: {
      calendar: spreadsheetId(env, 'GOOGLE_CALENDAR_SPREADSHEET_ID'),
      channels: spreadsheetId(env, 'GOOGLE_CHANNELS_SPREADSHEET_ID'),
      receipts: spreadsheetId(env, 'GOOGLE_RECEIPTS_SPREADSHEET_ID'),
    },
    receiptFolder: spreadsheetId(env, 'GOOGLE_RECEIPTS_FOLDER_ID'),
    cloudflareAccount, d1Id, d1Token: requireSetting(env, 'CLOUDFLARE_D1_API_TOKEN'),
    r2Bucket: requireSetting(env, 'CLOUDFLARE_R2_BUCKET'),
    r2Access: requireSetting(env, 'CLOUDFLARE_R2_ACCESS_KEY_ID'),
    r2Secret: requireSetting(env, 'CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
  };
}
