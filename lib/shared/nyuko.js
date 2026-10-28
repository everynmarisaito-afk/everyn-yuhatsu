import { WORK_TYPES } from './constants.js';
import { addDays } from './dates.js';

// 入庫予約とジョーカー整備伝票の「進み具合」の判定（画面・サーバー・テストで共通）

/** ジョーカーの作業区分名をアプリの区分にそろえる */
export function normalizeWorkType(name) {
  const s = String(name || '').trim();
  if (WORK_TYPES.includes(s)) return s;
  if (s.includes('車検')) return '車検';
  if (s.includes('点検')) return '点検';
  if (s.includes('整備') || s.includes('修理')) return '一般整備';
  return 'その他';
}

/**
 * 進み具合。
 * key: planned 予約 / today 本日入庫予定 / missing 予定日を過ぎて伝票なし / slip 伝票作成済み /
 *      arrived 作業待ち（入庫済み・作業前。アプリの「入庫済み」ボタンかジョーカーの入庫日）/ working 作業中 / finished 作業完了 / delivered 納車済み / cancelled / no_show
 * @param {{state?:string, planned_date?:string}|null} booking
 * @param {object|null} seibi
 */
export function progress(booking, seibi, today) {
  if (booking?.state === 'cancelled') return { key: 'cancelled', label: 'キャンセル' };
  if (booking?.state === 'no_show') return { key: 'no_show', label: '来店なし' };
  if (seibi) {
    if (seibi.nsh_day) return { key: 'delivered', label: '納車済み' };
    if (seibi.sgy_ed_day) return { key: 'finished', label: '作業完了' };
    if (seibi.sgy_st_day) return { key: 'working', label: '作業中' };
    if (seibi.nko_day || seibi.uke_day) return { key: 'arrived', label: '作業待ち' };
    return { key: 'slip', label: '伝票作成済み' };
  }
  if (!booking) return { key: 'slip', label: '伝票作成済み' };
  if (booking.arrived_at) return { key: 'arrived', label: '作業待ち' };
  if (booking.planned_date > today) return { key: 'planned', label: '予約' };
  if (booking.planned_date === today) return { key: 'today', label: '本日入庫予定' };
  return { key: 'missing', label: '伝票未確認' };
}

/** 入庫しているがまだ納車していない */
export const isInShop = (p) => ['slip', 'arrived', 'working', 'finished'].includes(p.key);

/** 納車予定日を過ぎてまだ納車していない */
export function isDeliveryOverdue(booking, seibi, today) {
  if (seibi?.nsh_day) return false;
  const due = seibi?.nsh_y_day || booking?.return_planned_date;
  if (!due) return false;
  return due < today && (Boolean(seibi) || (booking && booking.planned_date <= today));
}

/** 伝票の「入庫した日」（入庫日がなければ受付日、なければ作成日） */
export const seibiArrival = (s) => s.nko_day || s.uke_day || (s.jocar_created_at ? s.jocar_created_at.slice(0, 10) : null) || s.nko_y_day;

/**
 * 予約に結び付けるジョーカー伝票を選ぶ。同じ車両で、入庫日が予定日の7日前〜14日後のうち、予定日に一番近いもの。
 * @param {object} booking  car_no, planned_date, unlinked_seibi
 * @param {object[]} candidates 未リンクの伝票
 */
export function pickSeibiFor(booking, candidates) {
  if (!booking.car_no) return null;
  const from = addDays(booking.planned_date, -7);
  const to = addDays(booking.planned_date, 14);
  const skip = new Set(booking.unlinked_seibi || []);
  let best = null;
  let bestGap = Infinity;
  for (const s of candidates) {
    if (s.car_no !== booking.car_no || skip.has(s.seibi_no)) continue;
    const day = seibiArrival(s);
    if (!day || day < from || day > to) continue;
    const gap = Math.abs(Date.parse(day) - Date.parse(booking.planned_date));
    if (gap < bestGap) { best = s; bestGap = gap; }
  }
  return best;
}
