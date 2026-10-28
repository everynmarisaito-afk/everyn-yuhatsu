// 画面とサーバーで共通の定数

export const SIMULATOR_URL = 'https://shaken.everyn-club.com';

/** 誘発ステータス。done/book/skip は「対応済み」扱いで再連絡予定を持たない */
export const STATUSES = [
  { id: 'none', label: '未連絡' },
  { id: 'sent', label: '案内済み' },
  { id: 'wait', label: '再連絡待ち' },
  { id: 'book', label: '予約済み' },
  { id: 'done', label: '入庫済み' },
  { id: 'skip', label: '見送り' },
];
export const STATUS_IDS = STATUSES.map((s) => s.id);
export const CLOSED_STATUSES = ['book', 'done', 'skip'];

export const METHODS = ['電話', 'SMS', 'メール', 'LINE', 'DM', '来店', 'その他'];

/** 一覧に出す範囲：満了日が「今日-60日」〜「今日+90日」 */
export const BOARD_PAST_DAYS = 60;
export const BOARD_FUTURE_DAYS = 90;
/** JOCAR から取り込む範囲は少し広めに（同期と同期のあいだに範囲に入ってくる車両のため） */
export const SYNC_PAST_DAYS = 60;
export const SYNC_FUTURE_DAYS = 120;

/** 車検は満了日の2ヶ月前から受けられる（2025年4月から） */
export const INSPECTION_WINDOW_MONTHS = 2;

/** 案内送付区分（JOCAR コード値） */
export const DM_KBN = { need: '1', noNeed: '2', refuse: '3' };

// ---- 入庫管理 ----
export const STORES = ['大阪店', '堺店', '世田谷店', 'その他'];
/** ジョーカーの整備作業大区分（部品は入庫管理では「その他」扱い） */
export const WORK_TYPES = ['車検', '点検', '一般整備', 'その他'];
export const HOLD_REASONS = ['部品待ち', 'お客様確認待ち', '見積待ち', '外注待ち', 'その他'];
export const BOOKING_STATES = [
  { id: 'booked', label: '予約中' },
  { id: 'cancelled', label: 'キャンセル' },
  { id: 'no_show', label: '来店なし' },
];
/** 入庫管理で JOCAR から取り込む整備伝票の範囲（データ作成日が何日前まで） */
export const SEIBI_SYNC_DAYS = 120;
