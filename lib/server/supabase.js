import 'server-only';

// Supabase の REST API（PostgREST）をサーバーから service_role で呼ぶ薄いラッパー。
// service_role キーは RLS を無視できる強いキーなので、絶対にブラウザへ渡さない。

export class DbError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new DbError(500, 'サーバーに SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません');
  return { url, key };
}

/**
 * @param {string} path  例: "deliveries?select=*&id=eq.xxx"
 * @param {{method?: string, body?: unknown, prefer?: string}} [opts]
 */
export async function db(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = config();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await res.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!res.ok) {
    const msg = typeof data === 'object' && data ? data.message || JSON.stringify(data) : String(data);
    throw new DbError(res.status, `データベースエラー（${res.status}）：${msg}`, data?.code);
  }
  return data;
}

/** 値を PostgREST のフィルタ値として安全に埋め込む */
export const q = (v) => encodeURIComponent(String(v));

export const isUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
