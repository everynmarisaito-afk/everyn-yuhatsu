import { CLOSED_STATUSES, SIMULATOR_URL } from './constants.js';
import { daysBetween, jpDate } from './dates.js';

// 一覧・詳細の表示ルール（画面とテストで共通）

/** 満了日までの日数（過ぎていればマイナス） */
export const daysLeft = (item, today) => daysBetween(today, item.shkn_day);

/** 'over' 期限切れ / 'd30' 30日以内 / 'd60' 31〜60日 / 'd90' 61日以上 */
export function bucket(days) {
  if (days < 0) return 'over';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  return 'd90';
}

/** 色の強さ：late（14日以内・超過）/ warn（45日以内）/ ''（それ以外） */
export function severity(days) {
  if (days <= 14) return 'late';
  if (days <= 45) return 'warn';
  return '';
}

export const isClosed = (item) => CLOSED_STATUSES.includes(item.status);

/** 再連絡予定日を過ぎている（今日を含む） */
export const isDue = (item, today) => Boolean(item.next_contact_on && item.next_contact_on <= today && !isClosed(item));

/** 要対応：未連絡、または再連絡予定日が来ている */
export const needsAction = (item, today) => item.status === 'none' || isDue(item, today);

export const plateText = (item) =>
  [item.plate_area, item.plate_class, item.plate_kana, item.plate_number].filter(Boolean).join(' ');

/** "1208" → "12-08"。4桁未満はそのまま */
export const plateNumber = (n) => (/^\d{4}$/.test(n || '') ? `${n.slice(0, 2)}-${n.slice(2)}` : n || '');

/** 年式 "202104" → "2021年4月"、"2021" → "2021年" */
export function modelYear(v) {
  const s = String(v || '');
  if (!/^\d{4}/.test(s)) return '';
  const m = Number(s.slice(4, 6));
  return m >= 1 && m <= 12 ? `${s.slice(0, 4)}年${m}月` : `${s.slice(0, 4)}年`;
}

export function hm(v) {
  return /^\d{4}$/.test(v || '') ? `${v.slice(0, 2)}:${v.slice(2)}` : '';
}

/** お客様に送る案内文（SMS・LINE・メールに貼り付ける） */
export function guidanceMessage(item) {
  const plate = plateText(item);
  const car = [item.maker, item.car_name].filter(Boolean).join(' ');
  const name = item.customer_name ? `${item.customer_name} 様` : 'お客様';
  return [
    name,
    '',
    'いつもGARAGE EVE.RYNをご利用いただきありがとうございます。',
    `ご愛車の${car}${plate ? `（${plate}）` : ''}の車検満了日が${jpDate(item.shkn_day)}となっております。`,
    '',
    '車検は満了日の2ヶ月前から受けられます。お見積もりは下記からすぐにご確認いただけます。',
    SIMULATOR_URL,
    '',
    'ご予約・ご相談はお気軽にご連絡ください。',
  ].join('\n');
}
