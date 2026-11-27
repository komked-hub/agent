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

function googleWorkspace(config) {
  const auth = new JWT({
    email: config.sheets.client_email,
    key: config.sheets.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
  });
  const headers = ['요청 ID', '등록 시각', '결제일', '결제자', '관', '항', '목', '세목', '사용 목적', '파일명', 'Drive 파일 ID'];
  const extension = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
    'image/avif': '.avif', 'image/heic': '.heic',
  };

  async function receiptFile(receipt) {
    const query = "'" + config.receiptFolder + "' in parents and trashed = false and appProperties has { key='receiptId' and value='" + receipt.id + "' }";
    const found = await auth.request({
      url: 'https://www.googleapis.com/drive/v3/files',
      params: { q: query, fields: 'files(id,name)', pageSize: 1, spaces: 'drive' }, timeout: 8000,
    });
    if (found.data.files?.[0]) return found.data.files[0];

    const boundary = 'komked-' + receipt.id;
    const metadata = JSON.stringify({
      name: receipt.title + (extension[receipt.mediaType] || ''),
      parents: [config.receiptFolder], appProperties: { receiptId: receipt.id },
    });
    const body = Buffer.concat([
      Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + metadata + '\r\n--' + boundary + '\r\nContent-Type: ' + receipt.mediaType + '\r\n\r\n'),
      Buffer.from(await receipt.file.arrayBuffer()),
      Buffer.from('\r\n--' + boundary + '--'),
    ]);
    const uploaded = await auth.request({
      url: 'https://www.googleapis.com/upload/drive/v3/files', method: 'POST',
      params: { uploadType: 'multipart', fields: 'id,name' },
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, data: body, timeout: 15000,
    });
    return uploaded.data;
  }

  async function saveReceipt(receipt) {
    const file = await receiptFile(receipt);
    const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + config.spreadsheets.receipts + '/values/';
    const current = await auth.request({ url: base + encodeURIComponent("'시트1'!A1:K10000"), timeout: 8000 });
    const rows = current.data.values || [];
    if (!rows.length) {
      await auth.request({
        url: base + encodeURIComponent("'시트1'!A1:K1"), method: 'PUT', params: { valueInputOption: 'RAW' },
        data: { values: [headers] }, timeout: 8000,
      });
    }
    if (rows.some(row => row[0] === receipt.id)) return;
    const values = [[
      receipt.id, new Date(receipt.submittedAt).toISOString(), receipt.info.paidDate, receipt.info.payer,
      receipt.info.accountGroup, receipt.info.accountSection, receipt.info.accountItem, receipt.info.accountSubitem,
      receipt.info.description, receipt.title, file.id,
    ]];
    await auth.request({
      url: base + encodeURIComponent("'시트1'!A:K") + ':append', method: 'POST',
      params: { valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' }, data: { values }, timeout: 8000,
    });
  }
  return { saveReceipt };
}

export function createBindings(config) {
  return {
    env: { DB: database(config), BUCKET: privateBucket(config), GOOGLE_WORKSPACE: googleWorkspace(config), SITE_LAYOUT_ADMIN_EMAIL: config.admin },
    context: { props: { CONNECTORS: sheets(config) } },
  };
}
