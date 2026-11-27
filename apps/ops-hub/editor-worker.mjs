function siteAdministrator(request, env) {
  const configured = env.SITE_LAYOUT_ADMIN_EMAIL?.trim().toLowerCase();
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  return Boolean(configured && email && email === configured);
}

async function siteDesignAPI(request, url, env) {
  const user = request.headers.get('oai-authenticated-user-id');
  if (!user) return response({ error: 'sign_in_required' }, 401);
  const administrator = siteAdministrator(request, env);
  if (!env.DB) return response({ error: 'storage_unavailable' }, 503);
  const isSettings = url.pathname === '/api/site/layouts';
  if (request.method === 'GET') {
    if (isSettings) {
      const { results } = await env.DB.prepare('SELECT page, settings, version FROM site_page_layouts').all();
      const pages = Object.fromEntries(results.filter(row => Object.hasOwn(editorPages, row.page)).map(row => [
        row.page, { settings: normalizedPageLayout(row.page, JSON.parse(row.settings)), version: row.version },
      ]));
      return response({ pages, administrator });
    }
    const query = `SELECT channel, day, period, values_json FROM (
      SELECT channel, day, period, values_json, ROW_NUMBER() OVER (PARTITION BY channel ORDER BY day DESC) AS position
      FROM site_channel_metrics
    ) WHERE position <= 365 ORDER BY day DESC`;
    const { results } = await env.DB.prepare(query).all();
    return response({ records: results.map(row => ({ channel: row.channel, day: row.day, period: row.period, source: 'manual', values: JSON.parse(row.values_json) })), administrator });
  }
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  if (request.headers.get('origin') !== url.origin || !administrator) return response({ error: 'admin_only' }, 403);

  try {
    const body = await workspaceJSON(request, 48 * 1024);
    if (isSettings) {
      const { page, version, settings } = body ?? {};
      if (!Object.hasOwn(editorPages, page) || !Number.isSafeInteger(version) || version < 0 ||
          !settings || typeof settings !== 'object' || Array.isArray(settings)) {
        return response({ error: 'invalid_details' }, 400);
      }
      const normalized = normalizedPageLayout(page, settings);
      const serialized = JSON.stringify(normalized);
      const write = version === 0
        ? await env.DB.prepare('INSERT OR IGNORE INTO site_page_layouts (page, settings, version, updated_at, updated_by) VALUES (?, ?, 1, ?, ?)')
          .bind(page, serialized, Date.now(), user).run()
        : await env.DB.prepare('UPDATE site_page_layouts SET settings = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE page = ? AND version = ?')
          .bind(serialized, Date.now(), user, page, version).run();
      if (!write.meta.changes) return response({ error: 'version_conflict' }, 409);
      return response({ page, settings: normalized, version: version + 1 });
    }

    const { channel, day, values } = body ?? {};
    const period = typeof body?.period === 'string' ? body.period.trim().slice(0, 100) : '';
    if (!Object.hasOwn(channelMetrics, channel) || !validPaidDate(day) ||
        !values || typeof values !== 'object' || Array.isArray(values)) {
      return response({ error: 'invalid_details' }, 400);
    }
    const clean = {};
    for (const key of Object.keys(channelMetrics[channel].metrics)) {
      const value = values[key];
      if (value === undefined || value === null) continue;
      const rate = key.endsWith('Rate');
      if (!Number.isFinite(value) || value < 0 || (rate ? value > 100 : !Number.isSafeInteger(value))) {
        return response({ error: 'invalid_details' }, 400);
      }
      clean[key] = value;
    }
    if (!Object.keys(clean).length) return response({ error: 'invalid_details' }, 400);
    await env.DB.prepare(`INSERT INTO site_channel_metrics (channel, day, values_json, period, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (channel, day) DO UPDATE SET
      values_json = excluded.values_json, period = excluded.period, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
      .bind(channel, day, JSON.stringify(clean), period, Date.now(), user).run();
    return response({ record: { channel, day, values: clean, period, source: 'manual' } });
  } catch (error) {
    if (error instanceof WorkspaceInputError) return response({ error: error.message }, error.status);
    throw error;
  }
}

const channelWorkbook = 'channels';

function channelCount(value) {
  if (typeof value === 'string' && /^\d[\d,]*$/.test(value.trim())) value = Number(value.trim().replaceAll(',', ''));
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function parseChannelRows(summary, newsletter) {
  const records = new Map();
  function add(channel, rawDay, rawPeriod, counts) {
    const day = readDate(rawDay);
    if (!day) return;
    const values = Object.fromEntries(Object.entries(counts)
      .map(([key, value]) => [key, channelCount(value)]).filter(([, value]) => value !== undefined));
    if (!Object.keys(values).length) return;
    const key = channel + ':' + day;
    const existing = records.get(key);
    const period = typeof rawPeriod === 'string' ? rawPeriod.trim().slice(0, 100) : '';
    records.set(key, {
      channel, day, source: 'sheet',
      period: period || existing?.period || '',
      values: { ...existing?.values, ...values },
    });
  }
  for (const [day, period, subscribers] of newsletter) add('stibee', day, period, { subscribers });
  for (const [label, , day, period, audience, posts, uploads, views] of summary) {
    const key = String(label ?? '').trim().toLowerCase();
    if (key === '유튜브' || key === 'youtube') add('youtube', day, period, { subscribers: audience, posts, uploads, views });
    else if (key === '인스타' || key === '인스타그램' || key === 'instagram') {
      add('instagram', day, period, { followers: audience, posts, uploads, views });
    } else if (key === '스티비' || key === 'stibee') {
      add('stibee', day, period, { subscribers: audience, posts, sends: uploads });
    }
  }
  return [...records.values()].sort((a, b) => b.day.localeCompare(a.day));
}

async function channelSourceAPI(request, url, ctx) {
  if (request.method !== 'POST') return response({ error: 'method_not_allowed' }, 405);
  if (request.headers.get('origin') !== url.origin) return response({ error: 'invalid_origin' }, 403);
  if (!request.headers.get('oai-authenticated-user-id')) return response({ error: 'sign_in_required' }, 401);
  const connectors = ctx?.props?.CONNECTORS;
  const meta = await collect(() => sourceRequest(connectors, 'get_spreadsheet_metadata', { spreadsheet_id: channelWorkbook }));
  if (meta.status !== 'ok') return response({ sources: [meta], records: [] });
  async function readTab(sheet, startRow, lastColumn, cap) {
    const tab = meta.events?.sheets?.find(item => item.properties?.title === sheet);
    const gridSize = tab?.properties.gridProperties?.rowCount;
    if (!Number.isInteger(gridSize)) throw new SourceError('invalid_source_data');
    const end = Math.min(gridSize, cap);
    if (end < startRow) return [];
    const result = await sourceRequest(connectors, 'get_spreadsheet_range', {
      spreadsheet_id: channelWorkbook, sheet_name: sheet, range: 'A' + startRow + ':' + lastColumn + end,
      value_render_option: 'UNFORMATTED_VALUE',
    });
    if (!result || (result.values !== undefined && !Array.isArray(result.values))) throw new SourceError('invalid_source_data');
    return result.values ?? [];
  }
  const [summary, newsletter] = await Promise.all([
    collect(() => readTab('전체', 2, 'H', 1500)),
    collect(() => readTab('스티비', 3, 'C', 2000)),
  ]);
  const records = parseChannelRows(summary.events ?? [], newsletter.events ?? []);
  const sources = [summary, newsletter].map(({ events, ...status }) => status);
  return response({ sources, records });
}
