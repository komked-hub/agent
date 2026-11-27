import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { JWT } from 'google-auth-library';

const spreadsheetTabs = new Map([
  ['calendar', new Set(['📅전체일정', '📅주요일정'])],
  ['channels', new Set(['전체', '스티비'])],
]);

function database(config) {
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + config.cloudflareAccount + '/d1/database/' + config.d1Id + '/query';
  async function execute(sql, params) {
    const reply = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.d1Token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, params }),
      signal: AbortSignal.timeout(8000),
    });
    if (!reply.ok) throw new Error('D1 request failed');
    const data = await reply.json();
    const result = data.result?.[0];
    if (!data.success || !result?.success) throw new Error('D1 query failed');
    return result;
  }
  return {
    prepare(sql) {
      function statement(params) {
        return {
          all: () => execute(sql, params),
          run: () => execute(sql, params),
          async first() { return (await execute(sql, params)).results?.[0] ?? null; },
        };
      }
      return { ...statement([]), bind: (...params) => statement(params) };
    },
  };
}

function privateBucket(config) {
  const client = new S3Client({
    endpoint: 'https://' + config.cloudflareAccount + '.r2.cloudflarestorage.com',
    region: 'auto',
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: config.r2Access, secretAccessKey: config.r2Secret },
  });
  return {
    async put(key, file, options) {
      try {
        return await client.send(new PutObjectCommand({
          Bucket: config.r2Bucket,
          Key: key,
          Body: Buffer.from(await file.arrayBuffer()),
          ContentType: options.httpMetadata.contentType,
          IfNoneMatch: options.onlyIf?.etagDoesNotMatch,
        }), { abortSignal: AbortSignal.timeout(15000) });
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 412) return null;
        throw error;
      }
    },
    async get(key) {
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.r2Bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(15000),
        });
        return { body: result.Body.transformToWebStream(), httpMetadata: { contentType: result.ContentType } };
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
        throw error;
      }
    },
  };
}

function sheets(config) {
  const auth = new JWT({
    email: config.sheets.client_email,
    key: config.sheets.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return {
    async invoke(action, args) {
      const { spreadsheet_id: source, sheet_name: tab, range, value_render_option: format } = args;
      const tabs = spreadsheetTabs.get(source);
      if (!tabs) throw new Error('Unexpected workbook');
      const id = config.spreadsheets[source];
      const url = new URL('https://sheets.googleapis.com/v4/spreadsheets/' + id);
      if (action === 'get_spreadsheet_metadata') {
        url.searchParams.set('fields', 'sheets(properties(sheetId,title,gridProperties(rowCount)))');
      } else if (action === 'get_spreadsheet_range' && tabs.has(tab) && /^[A-R]\d{1,5}:[A-R]\d{1,5}$/.test(range)
          && ['FORMATTED_VALUE', 'UNFORMATTED_VALUE'].includes(format)) {
        url.pathname += '/values/' + encodeURIComponent("'" + tab.replaceAll("'", "''") + "'!" + range);
        url.searchParams.set('valueRenderOption', format);
      } else {
        throw new Error('Unexpected spreadsheet query');
      }
      try {
        const reply = await auth.request({ url, timeout: 8000 });
        return { status: 'success', result: { structuredContent: reply.data } };
      } catch (error) {
        const status = Number(error.response?.status);
        const retry = Number(error.response?.headers?.get?.('retry-after'));
        return {
          status: 'error',
          error: { code: status === 401 || status === 403 || status === 404 ? 'connector_unavailable' : 'source_failed' },
          ...(retry > 0 ? { retryAfterSeconds: retry } : {}),
        };
      }
    },
  };
}

export function createBindings(config) {
  return {
    env: { DB: database(config), BUCKET: privateBucket(config), SITE_LAYOUT_ADMIN_EMAIL: config.admin },
    context: { props: { CONNECTORS: sheets(config) } },
  };
}
