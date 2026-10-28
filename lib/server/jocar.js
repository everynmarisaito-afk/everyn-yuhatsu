import 'server-only';
import { addDays, nowJstHm, toYmd } from '../shared/dates.js';
import { SEIBI_SYNC_DAYS, SYNC_FUTURE_DAYS, SYNC_PAST_DAYS } from '../shared/constants.js';
import { keyNumber, mapJocarSeibi, mapJocarSet, mapVehicleHit, parseJocarBody } from './jocar-map.js';

// JOCAR（ジョーカー）車輌取得API。仕様書「4.4.42.03.01 JOCAR API連携仕様書 v3.18」準拠。
//  * POST のみ。認証情報は URL のクエリ文字列で渡す（だからサーバーからしか呼ばない）
//  * 1回で最大100件。続きは MaxKey の番号 + 1 を CarNoRngS に入れて繰り返す
//  * 毎日 3:00〜3:30 はメンテナンスで止まる

const BASE = 'https://api.jocar.jp/JocarApi/Search';
const PAGE_SIZE = 100;
const MAX_PAGES = 60; // 6,000台まで。無限ループ防止

export class JocarError extends Error {}

export const jocarConfigured = () =>
  Boolean(process.env.JOCAR_API_KEY && process.env.JOCAR_HAN_CD && process.env.JOCAR_SEC_KEY);

export function inMaintenance(now = new Date()) {
  const hm = nowJstHm(now);
  return hm >= '02:55' && hm < '03:35';
}

function url(api, extra = {}) {
  const p = new URLSearchParams({
    apikey: process.env.JOCAR_API_KEY,
    hanCd: process.env.JOCAR_HAN_CD,
    secKey: process.env.JOCAR_SEC_KEY,
    F: '1',
    J: '1',
    ver: 'v9999',
    reccnt: String(PAGE_SIZE),
    imgcnt: '0', // 車輌画像は取らない
    filecnt: '0', // 免許証ファイルは取らない
    getkokyinfo: 'y', // 保有者（整備では整備顧客）の顧客情報を一緒に取る
    getseikyuinfo: 'n',
    ...extra,
  });
  return `${BASE}/${api}?${p}`;
}

async function fetchPage(condition, { api = 'SharyoList', key = 'CarCondition', extra } = {}) {
  let res;
  try {
    res = await fetch(url(api, extra), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: condition }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    throw new JocarError(`ジョーカーに接続できませんでした（${e?.name === 'TimeoutError' ? '時間切れ' : '通信エラー'}）`);
  }
  const data = parseJocarBody(await res.text());
  if (!res.ok) {
    const id = data?.messageID ? `${data.messageID} ` : '';
    const detail = data?.detail ? ` ${JSON.stringify(data.detail).slice(0, 300)}` : '';
    throw new JocarError(`ジョーカーがエラーを返しました（${res.status}）：${id}${data?.message || ''}${detail}`);
  }
  if (!data) throw new JocarError('ジョーカーの応答を読み取れませんでした');
  return data;
}

/**
 * 車検満了日が「今日-60日」〜「今日+120日」の車両を保有者付きで全件取得し、yuhatsu_vehicles の行に変換して返す。
 * @param {string} today "YYYY-MM-DD"（日本時間）
 */
export async function fetchInspectionVehicles(today) {
  checkReady();

  const base = {
    ShknDayRngS: toYmd(addDays(today, -SYNC_PAST_DAYS)),
    ShknDayRngE: toYmd(addDays(today, SYNC_FUTURE_DAYS)),
  };
  const rows = new Map();
  let next = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await fetchPage(next ? { ...base, CarNoRngS: next } : base);
    if (data.messageID === 'I01002') break; // 該当データなし（最後まで取り終えた）
    if (data.messageID !== 'I01001') throw new JocarError(`想定外の応答です：${data.messageID || ''} ${data.message || ''}`);

    const result = Array.isArray(data.detail?.Result) ? data.detail.Result : [];
    for (const set of result) {
      const row = mapJocarSet(set, today);
      if (row) rows.set(row.car_no, row);
    }
    const max = keyNumber(data.detail?.MaxKey);
    if (!max || result.length < PAGE_SIZE) break;
    next = max + 1;
    if (page === MAX_PAGES - 1) throw new JocarError(`車両が多すぎるため途中で止めました（${rows.size}台まで取得）`);
  }
  return [...rows.values()];
}

function checkReady() {
  if (!jocarConfigured()) throw new JocarError('JOCAR の API キーが設定されていません');
  if (inMaintenance()) throw new JocarError('ジョーカーのメンテナンス時間（3:00〜3:30）のため見送りました');
}

/**
 * 整備伝票（データ作成日が120日前以降）を車両・整備顧客付きで全件取得し、nyuko_seibi の行にして返す。
 */
export async function fetchRecentSeibi(today) {
  checkReady();
  const from = addDays(today, -SEIBI_SYNC_DAYS).replaceAll('-', '/');
  const base = { CreDateRngS: `${from} 00:00:00` };
  const opts = { api: 'SeibiList', key: 'SeibiCondition', extra: { getcarinfo: 'y' } };
  const rows = new Map();
  let next = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await fetchPage(next ? { ...base, GmNoRngS: next } : base, opts);
    if (data.messageID === 'I01002') break;
    if (data.messageID !== 'I01001') throw new JocarError(`想定外の応答です：${data.messageID || ''} ${data.message || ''}`);
    const result = Array.isArray(data.detail?.Result) ? data.detail.Result : [];
    for (const set of result) {
      const row = mapJocarSeibi(set);
      if (row) rows.set(row.seibi_no, row);
    }
    const max = keyNumber(data.detail?.MaxKey);
    if (!max || result.length < PAGE_SIZE) break;
    next = max + 1;
    if (page === MAX_PAGES - 1) throw new JocarError(`整備伝票が多すぎるため途中で止めました（${rows.size}件まで取得）`);
  }
  return [...rows.values()];
}

/**
 * 車両をナンバー・電話・お客様名で検索（最大20件）。
 * 数字4桁 → ナンバーの番号、数字だけで5桁以上 → 電話番号、それ以外 → お客様名
 */
export async function searchVehicles(query) {
  checkReady();
  const q = String(query || '').trim();
  const digits = q.replace(/[-‐ー\s]/g, '');
  let condition;
  // 電話番号はジョーカーに入っている書き方（ハイフンの有無）で探すため、入力のまま渡す
  if (/^\d{1,4}$/.test(digits)) condition = { TrknoNoLikeNm: digits, TrknoNoLikeKbn: '2' };
  else if (/^\d{5,}$/.test(digits)) condition = { TelLikeNm: q.replace(/\s/g, ''), TelLikeKbn: '2' };
  else condition = { KokyNmLikeNm: q, KokyNmLikeKbn: '2' };
  const data = await fetchPage(condition, { extra: { reccnt: '20' } });
  if (data.messageID === 'I01002') return [];
  const result = Array.isArray(data.detail?.Result) ? data.detail.Result : [];
  return result.map(mapVehicleHit).filter((v) => v && !v.erased);
}
