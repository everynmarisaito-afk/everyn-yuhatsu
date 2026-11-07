import { UNDECIDED, WORK_TYPES } from './constants.js';
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
export function progress(booking, seibi, today, flags = null) {
  const kensaAt = flags?.kensa_at || booking?.kensa_at || null;
  const undecided = (flags?.hold_reason || booking?.hold_reason) === UNDECIDED;
  const doneAt = flags?.work_done_at || booking?.work_done_at || null;
  const returned = Boolean(flags?.returned_at || booking?.returned_at);
  const RET = { key: 'delivered', label: '返却済み' };
  // 作業済み・検査ライン済みは、両方押されていたら後から押した方を表示する
  const FIN = { key: 'finished', label: '作業済み' };
  const INS = { key: 'inspected', label: '検査ライン済み' };
  const step = doneAt && kensaAt ? (doneAt >= kensaAt ? FIN : INS) : doneAt ? FIN : kensaAt ? INS : null;
  if (booking?.state === 'cancelled') return { key: 'cancelled', label: 'キャンセル' };
  if (booking?.state === 'no_show') return { key: 'no_show', label: '来店なし' };
  if (seibi) {
    if (returned) return RET;
    if (seibi.nsh_day) return { key: 'delivered', label: '納車済み' };
    // ジョーカーでは作業が終わると「売上決定」にして、納車日は入れないことが多い → 完了扱い
    if (seibi.gm_status === '1') return { key: 'delivered', label: '売上確定' };
    // 見積だけ送って、まだ入庫していない（ジョーカーの受付日が入っていても入庫扱いにしない）
    if (undecided) return { key: 'undecided', label: '入庫未定（見積のみ）' };
    if (step) return step;
    if (seibi.sgy_ed_day) return FIN;
    if (seibi.sgy_st_day) return { key: 'working', label: '作業中' };
    if (seibi.nko_day || seibi.uke_day) return { key: 'arrived', label: '作業待ち' };
    return { key: 'slip', label: '伝票作成済み' };
  }
  if (!booking) return { key: 'slip', label: '伝票作成済み' };
  if (returned) return RET;
  if (step) return step;
  if (booking.arrived_at) return { key: 'arrived', label: '作業待ち' };
  if (booking.planned_date > today) return { key: 'planned', label: '予約' };
  if (booking.planned_date === today) return { key: 'today', label: '本日入庫予定' };
  return { key: 'missing', label: '伝票未確認' };
}

/** 入庫しているがまだ納車していない */
export const isInShop = (p) => ['slip', 'arrived', 'working', 'finished', 'inspected'].includes(p.key);

/** 納車予定日を過ぎてまだ納車していない */
export function isDeliveryOverdue(booking, seibi, today) {
  if (seibi?.nsh_day || seibi?.gm_status === '1') return false;
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

/** 部品待ち・保留を選べるか：見積（ジョーカー伝票）ができていて、まだ終わっていない */
export const canHold = (seibi, p) => Boolean(seibi) && !['delivered', 'cancelled', 'no_show'].includes(p.key);

/** 検査ライン済みボタンを出すか：車検で、入庫していて、まだ終わっていない */
export function canKensa(workType, p) {
  return workType === '車検' && ['slip', 'arrived', 'working', 'finished', 'inspected'].includes(p.key);
}

/** 作業済みボタンを出すか：入庫していて、まだ作業済み・完了になっていない */
export const canDone = (p) => ['slip', 'arrived', 'working', 'inspected'].includes(p.key);

/** 返却済みボタンを出すか：入庫中（作業前でも押せる。作業せず返すこともあるため） */
export const canReturn = (p) => isInShop(p);
