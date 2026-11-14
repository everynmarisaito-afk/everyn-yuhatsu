import 'server-only';
import { db, isUuid, q } from './supabase.js';
import { HttpError } from './http.js';

// スタッフのログインパスワード（会員システムと共通の Supabase Auth アカウント）を変える。
// 変えると会員システム・車検シミュレーター管理画面のパスワードも同じく変わる。

export const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // Supabase（bcrypt）の上限

/** 新しいパスワードの形を確認する。問題があれば HttpError */
export function checkNewPassword(next, confirm) {
  if (typeof next !== 'string' || typeof confirm !== 'string') throw new HttpError(400, '新しいパスワードを入力してください。');
  if (next !== confirm) throw new HttpError(400, '新しいパスワードが確認用と一致しません。');
  if (next.length < PASSWORD_MIN) throw new HttpError(400, `新しいパスワードは${PASSWORD_MIN}文字以上にしてください。`);
  if (new TextEncoder().encode(next).length > PASSWORD_MAX) throw new HttpError(400, '新しいパスワードが長すぎます。');
  if (!next.trim()) throw new HttpError(400, '空白だけのパスワードは使えません。');
  return next;
}

/** Supabase Auth のパスワードを書き換える（service_role の管理用 API） */
export async function setAuthPassword(userId, password) {
  if (!isUuid(userId)) throw new HttpError(400, 'スタッフが正しくありません。');
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'サーバーの設定が不足しています（Supabase）。');

  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    cache: 'no-store',
  });
  if (res.ok) return;
  const data = await res.json().catch(() => null);
  const code = data?.error_code || data?.code || '';
  if (res.status === 422 || code === 'weak_password' || code === 'same_password') {
    if (code === 'same_password') throw new HttpError(400, '今と同じパスワードです。別のパスワードにしてください。');
    throw new HttpError(400, 'このパスワードは使えません。もっと長く、推測されにくいものにしてください。');
  }
  if (res.status === 404) throw new HttpError(404, 'このスタッフのログインアカウントが見つかりません。');
  console.error('password update failed', res.status, code);
  throw new HttpError(502, 'パスワードを変更できませんでした。時間をおいてもう一度試してください。');
}

/** このアプリのログインを取り消す（パスワード変更後、ほかの端末からはログインし直してもらう） */
export async function revokeStaffSessions(staffId, exceptSessionId) {
  let path = `yuhatsu_sessions?staff_id=eq.${q(staffId)}&revoked_at=is.null`;
  if (exceptSessionId) path += `&id=neq.${q(exceptSessionId)}`;
  await db(path, { method: 'PATCH', prefer: 'return=minimal', body: { revoked_at: new Date().toISOString() } });
}
