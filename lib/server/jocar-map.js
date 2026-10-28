import { fromYmd } from '../shared/dates.js';

// JOCAR 車輌取得API の 1セット（{ CarInfo, KokyInfo }）を yuhatsu_vehicles の1行に変換する。
// テストから読むため server-only は付けない（ネットワークや秘密情報は扱わない純粋な変換）。

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());
const flag = (v) => str(v) === '1';
const hhmm = (v) => {
  const s = str(v).replace(':', '');
  return /^\d{4}$/.test(s) && s !== '0000' ? s : '';
};

/**
 * @param {{CarInfo?: object, KokyInfo?: object}} set
 * @param {string} today "YYYY-MM-DD"
 * @returns {object|null} 取り込まない車両（抹消・管理停止・満了日なし・車輌№不正）は null
 */
export function mapJocarSet(set, today) {
  const c = set?.CarInfo;
  if (!c) return null;
  const carNo = str(c.CarNo).toUpperCase();
  if (!/^[A-Z]{2}\d{8}$/.test(carNo)) return null;

  const shkn = fromYmd(c.ShknDay);
  if (!shkn) return null;
  if (fromYmd(c.EraseDay)) return null; // 抹消済み
  const stop = fromYmd(c.MngStopDay);
  if (stop && stop <= today) return null; // 管理停止

  const k = set.KokyInfo || null;
  const days = [
    ['ContactMonFlgCd', '月'], ['ContactTueFlgCd', '火'], ['ContactWedFlgCd', '水'], ['ContactThuFlgCd', '木'],
    ['ContactFriFlgCd', '金'], ['ContactSatFlgCd', '土'], ['ContactSunFlgCd', '日'],
  ];
  const kilometres = Number(str(c.Kyori));

  return {
    car_no: carNo,
    shkn_day: shkn,
    plate_area: str(c.TrknoRk),
    plate_class: str(c.TrknoBn),
    plate_kana: str(c.TrknoKn),
    plate_number: str(c.TrknoNo),
    maker: str(c.MkNm),
    car_name: str(c.CarNm),
    grade: str(c.Grade),
    model_year: str(c.NenskDay).slice(0, 6).replace(/^0+$/, ''),
    mileage_km: Number.isFinite(kilometres) && kilometres > 0 ? Math.round(kilometres) : null,
    koky_no: k ? str(k.KokyNo) || null : null,
    customer_name: k ? [str(k.KokyNm1), str(k.KokyNm2)].filter(Boolean).join(' ') : '',
    customer_kana: k ? str(k.KokyKn) : '',
    tel: k ? str(k.Tel) : '',
    mobile: k ? str(k.PTel) : '',
    email: k ? str(k.Mail) : '',
    email2: k ? str(k.Mail2) : '',
    mobile_email: k ? str(k.PMail) : '',
    dm_kbn: k ? str(k.DmKbnCd) : '',
    prefer_tel: k ? flag(k.ContactTelFlgCd) : false,
    prefer_mail: k ? flag(k.ContactMailFlgCd) : false,
    prefer_days: k ? days.filter(([f]) => flag(k[f])).map(([, d]) => d).join('') : '',
    prefer_from: k ? hhmm(k.ContactStTime) : '',
    prefer_to: k ? hhmm(k.ContactEdTime) : '',
    sales_staff: k ? str(k.TntNm) : '',
    service_staff: k ? str(k.SgytntNm) : '',
    is_sample: false,
  };
}

/** "CK00000123" → 123（次のページの開始番号に使う） */
export function keyNumber(maxKey) {
  const m = /^[A-Z]{2}(\d{8})$/.exec(str(maxKey));
  return m ? Number(m[1]) : null;
}

/**
 * JOCAR の応答本文を読む。古い呼び方だと JSON 全体が文字列で返ることがあるので、その場合はもう一度読む。
 */
export function parseJocarBody(raw) {
  let data = raw;
  for (let i = 0; i < 2 && typeof data === 'string'; i += 1) {
    try { data = JSON.parse(data); } catch { break; }
  }
  return data && typeof data === 'object' ? data : null;
}
