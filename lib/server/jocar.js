import 'server-only';
import { addDays, nowJstHm, toYmd } from '../shared/dates.js';
import { SYNC_FUTURE_DAYS, SYNC_PAST_DAYS } from '../shared/constants.js';
import { keyNumber, mapJocarSet, parseJocarBody } from './jocar-map.js';

// JOCAR（ジョーカー）車輌取得API。仕様書「4.4.42.03.01 JOCAR API連携仕様書 v3.18」準拠。
//  * POST のみ。認証情報は URL のクエリ文字列で渡す（だからサーバーからしか呼ばない）
//  * 1回で最大100件。続きは MaxKey の番号 + 1 を CarNoRngS に入れて繰り返す
//  * 毎日 3:00〜3:30 はメンテナンスで止まる

const ENDPOINT = 'https://api.jocar.jp/JocarApi/Search/SharyoList';
const PAGE_SIZE = 100;
const MAX_PAGES = 60; // 6,000台まで。無限ループ防止

export class JocarError extends Error {}

export const jocarConfigured = () =>
  Boolean(process.env.JOCAR_API_KEY && process.env.JOCAR_HAN_CD && process.env.JOCAR_SEC_KEY);

export function inMaintenance(now = new Date()) {
  const hm = nowJstHm(now);
  return hm >= '02:55' && hm < '03:35';
}

function url() {
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
    getkokyinfo: 'y', // 保有者の顧客情報を一緒に取る
    getseikyuinfo: 'n',
  });
  return `${ENDPOINT}?${p}`;
}

async function fetchPage(condition) {
  let res;
  try {
    res = await fetch(url(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CarCondition: condition }),
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
  if (!jocarConfigured()) throw new JocarError('JOCAR の API キーが設定されていません');
  if (inMaintenance()) throw new JocarError('ジョーカーのメンテナンス時間（3:00〜3:30）のため同期を見送りました');

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
