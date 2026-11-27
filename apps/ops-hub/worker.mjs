const workbook = 'calendar';
const sheetsEpoch = Date.UTC(1899, 11, 30);
const dayMs = 86_400_000;
const dailyTab = '📅전체일정';
const majorTab = '📅주요일정';
const jsonHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

class SourceError extends Error {
  constructor(code, retryAfter) {
    super(code);
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function response(data, status = 200) {
  return Response.json(data, { status, headers: jsonHeaders });
}

async function sourceRequest(connectors, action, args) {
  if (!connectors || typeof connectors.invoke !== 'function') throw new SourceError('connector_unavailable');

  let invocation;
  try {
    invocation = await connectors.invoke(action, { spreadsheet_id: workbook, ...args });
  } catch (error) {
    throw new SourceError(error?.code ?? 'source_failed');
  }
  if (invocation?.status !== 'success') {
    const code = invocation?.status === 'reauthentication_required'
      ? invocation.status
      : invocation?.error?.code ?? invocation?.code ?? 'source_failed';
    const retry = invocation?.retryAfterSeconds ?? invocation?.retry_after_seconds ?? invocation?.error?.retry_after_seconds;
    throw new SourceError(code, Number.isFinite(retry) ? retry : undefined);
  }
  return invocation.result?.structuredContent;
}

async function values(connectors, tab, range, format = 'UNFORMATTED_VALUE') {
  const result = await sourceRequest(connectors, 'get_spreadsheet_range', {
    sheet_name: tab,
    range,
    value_render_option: format,
  });
  if (!result || (result.values !== undefined && !Array.isArray(result.values))) {
    throw new SourceError('invalid_source_data');
  }
  return result.values ?? [];
}

function dateKey(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}

function readDate(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 100_000) {
    return new Date(sheetsEpoch + Math.floor(value) * dayMs).toISOString().slice(0, 10);
  }
  const parts = String(value ?? '').trim().match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})(?:\s*[.일])?(?=$|[\sT])/u);
  return parts ? dateKey(Number(parts[1]), Number(parts[2]), Number(parts[3])) : null;
}

function rowsForMonth(dateRows, month) {
  const groups = [];
  dateRows.forEach(([rawDate], index) => {
    const day = readDate(rawDate);
    if (!day?.startsWith(month + '-')) return;
    const row = index + 3;
    const group = groups.at(-1);
    if (group && row <= group.first + 60) {
      group.rows.set(row, day);
      group.last = row;
    } else {
      groups.push({ first: row, last: row, rows: new Map([[row, day]]) });
    }
  });
  return groups;
}

function getRowCount(metadata, sheetId, title) {
  const tab = metadata?.sheets?.find(sheet => sheet.properties?.sheetId === sheetId)?.properties;
  if (tab?.title !== title || !Number.isInteger(tab.gridProperties?.rowCount)) {
    throw new SourceError('invalid_source_data');
  }
  return tab.gridProperties.rowCount;
}

async function dailyEvents(connectors, month, rowCount) {
  const lastRow = Math.min(rowCount, 10_000);
  if (lastRow < 3) return [];
  const dateRows = await values(connectors, dailyTab, 'A3:A' + lastRow);
  const batches = rowsForMonth(dateRows, month);
  if (!batches.length) return [];
  if (batches.length > 8) throw new SourceError('invalid_source_data');
  const [header, ...rows] = await Promise.all([
    values(connectors, dailyTab, 'C2:R2', 'FORMATTED_VALUE'),
    ...batches.map(batch => values(connectors, dailyTab, 'C' + batch.first + ':R' + batch.last, 'FORMATTED_VALUE')),
  ]);
  const list = [];
  batches.forEach((batch, position) => {
    for (const [index, date] of batch.rows) {
      const cells = rows[position][index - batch.first] ?? [];
      cells.forEach((cell, column) => {
        const title = String(cell ?? '').trim();
        if (!title) return;
        const label = String(header[0]?.[column] ?? '')
          .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]/gu, '').trim();
        list.push({ date, label: column === 0 ? '팀 공통' : label || '팀 일정', title });
      });
    }
  });
  return list;
}

async function majorEvents(connectors, month, rowCount) {
  if (rowCount < 2) return [];
  const rows = await values(connectors, majorTab, 'B2:F' + Math.min(rowCount, 2000));
  const startMonth = month + '-01';
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  const list = [];
  for (const [startRaw, endRaw, type, , name] of rows) {
    const start = readDate(startRaw);
    const title = String(name ?? '').trim();
    if (!start || !title || start >= nextMonth) continue;
    const endDate = readDate(endRaw) ?? start;
    const end = endDate < start ? start : endDate;
    if (end < startMonth) continue;
    list.push({ start, end, title, label: String(type ?? '').trim() });
  }
  return list.sort((a, b) => a.start.localeCompare(b.start));
}

async function collect(read) {
  try {
    return { status: 'ok', events: await read() };
  } catch (error) {
    const code = error instanceof SourceError ? error.code : 'source_failed';
    return {
      status: 'error',
      code: ['reauthentication_required', 'connector_unavailable', 'invalid_source_data'].includes(code) ? code : 'source_failed',
      retryAfter: error instanceof SourceError ? error.retryAfter : undefined,
    };
  }
}

async function calendar(request, url, ctx) {
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  if (request.headers.get('origin') !== url.origin) return response({ error: 'invalid_origin' }, 403);
  if (!request.headers.get('oai-authenticated-user-id')) return response({ error: 'sign_in_required' }, 401);

  const length = Number(request.headers.get('content-length'));
  if (length > 200) return response({ error: 'invalid_month' }, 400);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'invalid_month' }, 400);
  let month;
  try {
    const body = await request.text();
    if (body.length > 200) return response({ error: 'invalid_month' }, 400);
    month = JSON.parse(body)?.month;
  } catch {
    return response({ error: 'invalid_month' }, 400);
  }
  if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    return response({ error: 'invalid_month' }, 400);
  }

  const connectors = ctx?.props?.CONNECTORS;
  const metadata = await collect(() => sourceRequest(connectors, 'get_spreadsheet_metadata', {}));
  if (metadata.status !== 'ok') return response({ month, daily: metadata, major: metadata });
  const [daily, major] = await Promise.all([
    collect(() => dailyEvents(connectors, month, getRowCount(metadata.events, 0, dailyTab))),
    collect(() => majorEvents(connectors, month, getRowCount(metadata.events, 1157576623, majorTab))),
  ]);
  return response({ month, daily, major });
}

export default {
  async fetch(request, _env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/calendar/time' && request.method === 'GET') {
      return response({ now: Date.now() });
    }
    if (url.pathname === '/api/calendar') return calendar(request, url, ctx);
    if (url.pathname === '/api/site/channel-source') return channelSourceAPI(request, url, ctx);
    if (url.pathname === '/api/site/layouts' || url.pathname === '/api/site/channels') {
      try {
        return await siteDesignAPI(request, url, _env);
      } catch (error) {
        console.error('Site data operation failed', error?.name ?? 'Error');
        return response({ error: 'storage_failed' }, 500);
      }
    }
    if (url.pathname.startsWith('/api/workspace/')) return workspaceAPI(request, url, _env);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
    const asset = Object.hasOwn(assets, url.pathname) ? assets[url.pathname] : null;
    if (!asset) return new Response('Not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : asset.body, {
      headers: {
        'Content-Type': asset.type,
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
        ...(url.pathname === '/' ? { 'Permissions-Policy': 'camera=(self)' } : {}),
      },
    });
  },
};
