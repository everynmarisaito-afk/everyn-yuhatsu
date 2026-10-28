import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { db, q } from './supabase.js';
import { HttpError } from './http.js';

// ログインは会員システムのスタッフアカウント（Supabase Auth のメール＋パスワード）を使う。
//  1. サーバーが Supabase Auth でメール・パスワードを確認する
//  2. public.staff_users に有効なスタッフとして登録されているか確認する
//  3. このアプリ専用のランダムなトークンを httpOnly クッキーに入れる（DB にはハッシュだけ保存）
// Supabase のアクセストークンはブラウザに渡さず、確認後すぐ破棄する。

export const COOKIE = 'yuhatsu_session';
const SESSION_DAYS = 14;

export const sha256 = (v) => createHash('sha256').update(v).digest('hex');

function cookieToken(req) {
  const raw = req.headers.get('cookie') || '';
  const part = raw.split(';').map((v) => v.trim()).find((v) => v.startsWith(`${COOKIE}=`));
  return part ? decodeURIComponent(part.slice(COOKIE.length + 1)) : '';
}

/** 書き込み系リクエストが自分のサイトから来たか（CSRF 対策） */
export function isSameOrigin(req) {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  let o;
  try {
    o = new URL(origin);
  } catch {
    return false;
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(o.hostname);
  if (process.env.NODE_ENV === 'production' && o.protocol !== 'https:' && !local) return false;

  const allowed = new Set();
  for (const h of [req.headers.get('x-forwarded-host'), req.headers.get('host')]) {
    if (h) allowed.add(h.split(',')[0].trim().toLowerCase());
  }
  if (process.env.APP_ORIGIN) {
    try { allowed.add(new URL(process.env.APP_ORIGIN).host.toLowerCase()); } catch { /* 書式違いは無視 */ }
  }
  return allowed.has(o.host.toLowerCase());
}

/** 有効なセッションとスタッフ情報を返す。なければ null */
export async function getSession(req) {
  const token = cookieToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await db(
    `yuhatsu_sessions?select=id,expires_at,revoked_at,last_seen_at,staff_id,staff:staff_users(name,email,role,is_active)&token_hash=eq.${sha256(token)}&limit=1`,
  );
  const s = rows?.[0];
  if (!s || s.revoked_at || Date.parse(s.expires_at) <= Date.now()) return null;
  if (!s.staff || s.staff.is_active !== true) return null;

  if (!s.last_seen_at || Date.now() - Date.parse(s.last_seen_at) > 3600_000) {
    db(`yuhatsu_sessions?id=eq.${s.id}`, { method: 'PATCH', body: { last_seen_at: new Date().toISOString() } }).catch(() => {});
  }
  return {
    sessionId: s.id,
    staffId: s.staff_id,
    name: s.staff.name || s.staff.email || 'スタッフ',
    role: s.staff.role === 'admin' ? 'admin' : 'staff',
  };
}

/**
 * API の入口で呼ぶ。ログインしていなければ 401、書き込みで別サイトからなら 403。
 * @returns {Promise<{sessionId:string, staffId:string, name:string, role:'staff'|'admin'}>}
 */
export async function requireStaff(req, { write = false } = {}) {
  if (write && !isSameOrigin(req)) throw new HttpError(403, 'リクエスト元を確認できません。ページを開き直してください。');
  const s = await getSession(req);
  if (!s) throw new HttpError(401, 'ログインしてください。');
  return s;
}

/** メール・パスワードを確認し、有効なスタッフなら staff_users の行を返す。違えば null */
export async function verifyStaffPassword(email, password) {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'サーバーの設定が不足しています（Supabase）。');

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (res.status === 429) throw new HttpError(429, 'ログインの試行が多すぎます。しばらく待ってからもう一度試してください。');
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const userId = data?.user?.id;

  // 確認に使った Supabase のセッションはすぐ破棄する
  if (data?.access_token) {
    fetch(`${url}/auth/v1/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${data.access_token}` },
    }).catch(() => {});
  }
  if (!userId) return null;

  const rows = await db(`staff_users?select=id,name,email,role,is_active&id=eq.${q(userId)}&limit=1`);
  const staff = rows?.[0];
  if (!staff || staff.is_active !== true) return null;
  return staff;
}

export async function createSession(staffId) {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  await db('yuhatsu_sessions', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { token_hash: sha256(token), staff_id: staffId, expires_at: expires },
  });
  return token;
}

export async function revokeSession(req) {
  const token = cookieToken(req);
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  await db(`yuhatsu_sessions?token_hash=eq.${sha256(token)}`, {
    method: 'PATCH', prefer: 'return=minimal', body: { revoked_at: new Date().toISOString() },
  });
}

export function setSessionCookie(res, token) {
  res.cookies.set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_DAYS * 86400,
  });
  return res;
}

export function clearSessionCookie(res) {
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
  return res;
}
