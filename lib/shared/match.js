// 会員システムとジョーカーの車両を突き合わせるためのキー（全角・空白・記号の違いをならす）

const nfkc = (v) => String(v ?? '').normalize('NFKC');

/** 車台番号：半角・大文字、空白とハイフンを除く */
export const vinKey = (v) => nfkc(v).toUpperCase().replace(/[\s\-‐ー－]/g, '');

/** ナンバー："品川 300 さ 12-08" / "品川300さ1208" / "品川 300 さ ・・99" → "品川300さ1208" / "品川300さ99" */
export const plateKey = (v) => nfkc(v).replace(/[\s\-‐ー－・·.]/g, '');

/** 電話番号：数字だけ */
export const phoneKey = (v) => nfkc(v).replace(/\D/g, '');

/**
 * 会員システムの有効な会員（memberships + vehicles + customers）から突き合わせ用の索引を作る。
 * @param {Array<{member_number:string, member_rank:string, expiry_date:string|null, payment_status:string,
 *   vehicle?:{vin?:string, license_plate?:string}|null, customer?:{phone?:string}|null}>} rows
 */
export function buildMemberIndex(rows) {
  const byVin = new Map();
  const byPlate = new Map();
  const byPhone = new Map();
  for (const r of rows || []) {
    const m = {
      number: r.member_number || '', rank: r.member_rank || '', expiry: r.expiry_date || null,
      unpaid: r.payment_status === 'unpaid',
    };
    const v = vinKey(r.vehicle?.vin);
    const p = plateKey(r.vehicle?.license_plate);
    const t = phoneKey(r.customer?.phone);
    if (v.length >= 5) byVin.set(v, m);
    if (p.length >= 4) byPlate.set(p, m);
    if (t.length >= 9) byPhone.set(t, m);
  }
  return { byVin, byPlate, byPhone };
}

/**
 * 車両がメンバーサービスに加入しているか。
 * state: 'member'（この車が加入）/ 'other_car'（同じお客様の別の車が加入）/ 'none'（未加入）
 */
export function memberStatus(ix, { vin, plate, phone }, today) {
  const v = vinKey(vin);
  const p = plateKey(plate);
  const hit = (v.length >= 5 && ix.byVin.get(v)) || (p.length >= 4 && ix.byPlate.get(p)) || null;
  if (hit) {
    return { state: 'member', ...hit, expired: Boolean(hit.expiry && hit.expiry < today), by: v && ix.byVin.get(v) ? 'vin' : 'plate' };
  }
  const t = phoneKey(phone);
  if (t.length >= 9 && ix.byPhone.has(t)) return { state: 'other_car' };
  return { state: 'none' };
}

/** 一覧のタブ分け：'member'（加入済み）/ 'unpaid'（加入しているが未払い）/ 'none'（未加入・別の車で加入） */
export function memberCategory(m) {
  if (m?.state !== 'member') return 'none';
  return m.unpaid ? 'unpaid' : 'member';
}
