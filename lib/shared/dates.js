// 日付はすべて "YYYY-MM-DD" の文字列（日本時間）で扱う。時刻のずれで1日ずれないよう UTC で計算する。

export const isIsoDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/** 日本時間の今日 */
export function todayJst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 日本時間の今の時刻 "HH:MM" */
export function nowJstHm(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(11, 16);
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}

/** b - a の日数 */
export function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400_000);
}

/** "2026-10-28" → "20261028"（JOCAR の日付形式） */
export const toYmd = (iso) => iso.replaceAll('-', '');

/**
 * JOCAR の日付 "yyyymmdd" → "YYYY-MM-DD"。未設定（"00000000" や空）は null。
 * 日が "00" のときは月末日とみなす（車検満了日は年月だけ入っていることがある）。
 */
export function fromYmd(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{8}$/.test(s) || s === '00000000') return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  let d = Number(s.slice(6, 8));
  if (y === 0 || m < 1 || m > 12) return null;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d === 0) d = last;
  if (d > last) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "2026-10-28" → "2026年10月28日" */
export function jpDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** "2026-10-28" → "10/28" */
export function shortDate(iso) {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${m}/${d}`;
}
