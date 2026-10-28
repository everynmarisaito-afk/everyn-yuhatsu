'use client';

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/** 自分の API を呼ぶ。失敗時はサーバーの日本語メッセージ付きで ApiError を投げる */
export async function api(path, { method = 'GET', body, form } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      cache: 'no-store',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, '通信できませんでした。電波やWi-Fiを確認してください。');
  }
  let data = null;
  try { data = await res.json(); } catch { /* 空の応答 */ }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error || `エラーが発生しました（${res.status}）`, data);
  }
  return data;
}
