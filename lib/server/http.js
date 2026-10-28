import 'server-only';
import { NextResponse } from 'next/server';
import { DbError } from './supabase.js';

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const json = (data, status = 200) =>
  NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

/** ルートハンドラを包んで、エラーを日本語の JSON にそろえる */
export function handle(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, ...(e.extra || {}) }, e.status);
      if (e instanceof DbError) {
        console.error(e);
        return json({ error: 'データベースの処理に失敗しました。時間をおいてもう一度試してください。' }, 500);
      }
      console.error(e);
      return json({ error: 'サーバーでエラーが発生しました。' }, 500);
    }
  };
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, '送信内容を読み取れません');
  }
}
