const fileMax = 10 * 1024 * 1024;
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const receiptColumns = 'id, title, paid_date, payer, account_group, account_section, account_item, description, media_type, created_at, reviewed_at';

class WorkspaceInputError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}

function workspaceAuthor(request) {
  const value = request.headers.get('oai-authenticated-user-full-name');
  if (!value) return '팀 멤버';
  try {
    const name = request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8'
      ? decodeURIComponent(value) : value;
    return name.trim().slice(0, 80) || '팀 멤버';
  } catch {
    return '팀 멤버';
  }
}

function validId(value) {
  if (typeof value !== 'string' || !idPattern.test(value)) throw new WorkspaceInputError('invalid_id');
  return value;
}

function workspaceText(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new WorkspaceInputError('invalid_details');
  }
  return value.trim();
}

async function boundedBody(request, max) {
  if (Number(request.headers.get('content-length')) > max) throw new WorkspaceInputError('file_too_large', 413);
  if (!request.body) throw new WorkspaceInputError('invalid_details');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new WorkspaceInputError('file_too_large', 413);
    }
    chunks.push(value);
  }
  return new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('content-type') || '' } });
}

async function workspaceJSON(request, maxBytes = 16 * 1024) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new WorkspaceInputError('invalid_details');
  const body = await boundedBody(request, maxBytes);
  return body.json().catch(() => { throw new WorkspaceInputError('invalid_details'); });
}

function receiptName(info) {
  return [
    info.paidDate.replaceAll('-', '.'),
    info.accountGroup,
    info.accountSection,
    info.accountItem,
    info.accountSubitem,
    info.payer,
  ].join(' - ');
}

function validPaidDate(value) {
  if (typeof value !== 'string' || !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const imageExtensions = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/gif': '.gif', 'image/avif': '.avif', 'image/heic': '.heic',
};

async function detectImage(file, limit) {
  if (!(file instanceof File) || file.size < 12) throw new WorkspaceInputError('invalid_image');
  if (file.size > limit) throw new WorkspaceInputError('file_too_large', 413);
  const bytes = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes[0] === 137 && text(1, 8) === 'PNG\r\n\x1a\n') return 'image/png';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a') return 'image/gif';
  if (text(4, 8) === 'ftyp') {
    if (/avif|avis/.test(text(8, 40))) return 'image/avif';
    if (/heic|heix|hevc|hevx|mif1|msf1/.test(text(8, 40))) return 'image/heic';
  }
  throw new WorkspaceInputError('invalid_image');
}

function receiptKey(owner, id) {
  return 'receipts/' + encodeURIComponent(owner) + '/' + id;
}

async function findReceipt(db, owner, id) {
  const row = await db.prepare('SELECT ' + receiptColumns + ' FROM receipts WHERE owner_id = ? AND id = ?')
    .bind(owner, id).first();
  if (!row) throw new WorkspaceInputError('not_found', 404);
  return row;
}

async function uploadReceipt(request, env, owner) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) {
    throw new WorkspaceInputError('invalid_details');
  }
  const bounded = await boundedBody(request, fileMax + 32 * 1024);
  const form = await bounded.formData().catch(() => { throw new WorkspaceInputError('invalid_details'); });
  const id = validId(form.get('id'));
  const info = {
    payer: workspaceText(form.get('payer'), 50),
    paidDate: form.get('paidDate'),
    accountGroup: workspaceText(form.get('accountGroup'), 30),
    accountSection: workspaceText(form.get('accountSection'), 30),
    accountItem: workspaceText(form.get('accountItem'), 30),
    accountSubitem: workspaceText(form.get('accountSubitem'), 80),
    description: workspaceText(form.get('description'), 500),
  };
  if (!validPaidDate(info.paidDate)) throw new WorkspaceInputError('invalid_date');
  const file = form.get('image');
  const type = await detectImage(file, env.RECEIPT_UPLOAD_LIMIT ?? fileMax);
  const existing = await env.DB.prepare('SELECT ' + receiptColumns + ' FROM receipts WHERE owner_id = ? AND id = ?')
    .bind(owner, id).first();
  if (existing) return response({ receipt: existing });
  const key = receiptKey(owner, id);
  await env.BUCKET.put(key, file, {
    onlyIf: { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: type },
  });
  if (!env.GOOGLE_WORKSPACE) throw new WorkspaceInputError('workspace_unavailable', 503);
  await env.GOOGLE_WORKSPACE.saveReceipt({
    id, title: receiptName(info), file, mediaType: type, info,
    submittedAt: Date.now(), submittedBy: workspaceAuthor(request),
  });
  await env.DB.prepare(`INSERT OR IGNORE INTO receipts (
    owner_id, id, title, payer, paid_date, account_group, account_section,
    account_item, description, media_type, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(owner, id, receiptName(info), info.payer, info.paidDate, info.accountGroup,
      info.accountSection, info.accountItem + ' · ' + info.accountSubitem, info.description, type, Date.now()).run();
  return response({ receipt: await findReceipt(env.DB, owner, id) }, 201);
}

async function receiptRoutes(request, url, env, owner) {
  const db = env.DB;
  if (!env.BUCKET) return response({ error: 'storage_unavailable' }, 503);
  if (url.pathname === '/api/workspace/receipts') {
    if (request.method === 'POST') return uploadReceipt(request, env, owner);
    if (request.method !== 'GET') return response({ error: 'method_not_allowed' }, 405);
    const { results } = await db.prepare(`SELECT ${receiptColumns}
      FROM receipts WHERE owner_id = ? ORDER BY created_at DESC, id DESC`).bind(owner).all();
    return response({ receipts: results });
  }
  const [, , , , rawId, action, extra] = url.pathname.split('/');
  const id = validId(rawId);
  if (extra !== undefined) return response({ error: 'not_found' }, 404);
  if (action === undefined && request.method === 'GET') return response({ receipt: await findReceipt(db, owner, id) });
  if (action === 'image' && request.method === 'GET') {
    const row = await findReceipt(db, owner, id);
    const object = await env.BUCKET.get(receiptKey(owner, id));
    if (!object) return response({ error: 'not_found' }, 404);
    const contentType = object.httpMetadata?.contentType;
    if (!Object.hasOwn(imageExtensions, contentType)) return response({ error: 'invalid_image' }, 415);
    const headers = { ...jsonHeaders, 'Content-Type': contentType };
    if (url.searchParams.has('download')) {
      const name = row.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') + imageExtensions[contentType];
      const encoded = encodeURIComponent(name).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16));
      headers['Content-Disposition'] = "attachment; filename*=UTF-8''" + encoded;
    }
    return new Response(object.body, { headers });
  }
  if (action === 'review' && request.method === 'POST') {
    const body = await workspaceJSON(request);
    if (typeof body?.reviewed !== 'boolean') throw new WorkspaceInputError('invalid_details');
    await db.prepare('UPDATE receipts SET reviewed_at = ? WHERE owner_id = ? AND id = ?')
      .bind(body.reviewed ? Date.now() : null, owner, id).run();
    return response({ receipt: await findReceipt(db, owner, id) });
  }
  return response({ error: 'not_found' }, 404);
}

async function listMessages(url, db) {
  const before = url.searchParams.get('before');
  let query = 'SELECT id, author, body, created_at FROM messages';
  let args = [];
  if (before) {
    const [time, id] = before.split(':');
    const millis = Number(time);
    if (!Number.isSafeInteger(millis) || millis < 1) throw new WorkspaceInputError('invalid_details');
    query += ' WHERE (created_at, id) < (?, ?)';
    args = [millis, validId(id)];
  }
  const { results } = await db.prepare(query + ' ORDER BY created_at DESC, id DESC LIMIT 41').bind(...args).all();
  const messages = results.slice(0, 40);
  const last = messages.at(-1);
  const next = results.length > 40 ? last.created_at + ':' + last.id : null;
  const grouped = new Map(messages.map(message => [message.id, []]));
  if (messages.length) {
    const ids = messages.map(message => message.id);
    const placeholders = ids.map(() => '?').join(', ');
    const { results: comments } = await db.prepare(`SELECT id, message_id, author, body, created_at
      FROM message_comments WHERE message_id IN (${placeholders}) ORDER BY created_at, id`).bind(...ids).all();
    for (const comment of comments) grouped.get(comment.message_id).push(comment);
  }
  const total = await db.prepare('SELECT COUNT(*) AS count FROM messages').first();
  return response({ messages: messages.map(message => ({ ...message, comments: grouped.get(message.id) })), next, total: total.count });
}

async function messageRoutes(request, url, db, owner) {
  const path = url.pathname;
  if (path === '/api/workspace/messages' && request.method === 'GET') return listMessages(url, db);
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  const reply = path.match(/^\/api\/workspace\/messages\/([^/]+)\/comments$/);
  if (!reply && path !== '/api/workspace/messages') return response({ error: 'not_found' }, 404);
  const author = workspaceAuthor(request);
  const payload = await workspaceJSON(request);
  const id = validId(payload?.id);
  const body = workspaceText(payload?.body, reply ? 1000 : 2000);
  const now = Date.now();
  if (reply) {
    const messageId = validId(reply[1]);
    if (!await db.prepare('SELECT 1 AS present FROM messages WHERE id = ?').bind(messageId).first()) {
      throw new WorkspaceInputError('not_found', 404);
    }
    await db.prepare('INSERT OR IGNORE INTO message_comments (id, message_id, author_id, author, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, messageId, owner, author, body, now).run();
    const comment = await db.prepare('SELECT id, author, body, created_at FROM message_comments WHERE id = ? AND author_id = ? AND message_id = ?')
      .bind(id, owner, messageId).first();
    if (!comment) return response({ error: 'invalid_id' }, 409);
    return response({ comment }, 201);
  }
  await db.prepare('INSERT OR IGNORE INTO messages (id, author_id, author, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, owner, author, body, now).run();
  const post = await db.prepare('SELECT id, author, body, created_at FROM messages WHERE id = ? AND author_id = ?')
    .bind(id, owner).first();
  if (!post) return response({ error: 'invalid_id' }, 409);
  return response({ message: { ...post, comments: [] } }, 201);
}

async function workspaceAPI(request, url, env) {
  const owner = request.headers.get('oai-authenticated-user-id');
  if (!owner) return response({ error: 'sign_in_required' }, 401);
  if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) {
    return response({ error: 'invalid_origin' }, 403);
  }
  if (!env.DB) return response({ error: 'storage_unavailable' }, 503);
  try {
    if (/^\/api\/workspace\/receipts(?:\/|$)/.test(url.pathname)) return await receiptRoutes(request, url, env, owner);
    if (/^\/api\/workspace\/messages(?:\/|$)/.test(url.pathname)) return await messageRoutes(request, url, env.DB, owner);
    return response({ error: 'not_found' }, 404);
  } catch (error) {
    if (error instanceof WorkspaceInputError) return response({ error: error.message }, error.status);
    console.error('Workspace storage operation failed', error?.name ?? 'Error');
    return response({ error: 'storage_failed' }, 500);
  }
}
