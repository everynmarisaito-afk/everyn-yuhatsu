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

const plateOf = (c) => [str(c?.TrknoRk), str(c?.TrknoBn), str(c?.TrknoKn), str(c?.TrknoNo)].filter(Boolean).join(' ');
const nameOf = (k) => (k ? [str(k.KokyNm1), str(k.KokyNm2)].filter(Boolean).join(' ') : '');
const phoneOf = (k) => (k ? str(k.PTel) || str(k.Tel) : '');

/** JOCAR の日時 "2026/10/28 10:20:30.123" → ISO（不正なら null） */
function jocarDateTime(v) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(str(v));
  if (!m || m[1] === '1900') return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+09:00`;
}

/**
 * 整備取得API の1セット（{ SeibiInfo, CarInfo, KokyInfo }）を nyuko_seibi の1行に変換。
 * 業務№が読めない伝票は null。
 */
export function mapJocarSeibi(set) {
  const s = set?.SeibiInfo;
  if (!s) return null;
  const no = str(s.GmNo).toUpperCase();
  if (!/^[A-Z]{2}\d{8}$/.test(no)) return null;
  const skj = Array.isArray(s.SkjInfo) ? s.SkjInfo[0] || {} : s.SkjInfo || {};
  const c = set.CarInfo || null;
  const k = set.KokyInfo || null;
  const carNo = str(c?.CarNo).toUpperCase();
  const sold = str(s.GmStsCd) === '1';
  return {
    seibi_no: no,
    car_no: /^[A-Z]{2}\d{8}$/.test(carNo) ? carNo : null,
    work_type: str(s.SgyKbnNm),
    work_sub: str(s.SgyKbnNmSml),
    gm_status: str(s.GmStsCd),
    uke_day: fromYmd(s.UkeDay),
    nko_y_day: fromYmd(skj.NkoYDay),
    nko_y_time: hhmm(skj.NkoYTime),
    nko_day: fromYmd(skj.NkoDay),
    sgy_st_day: fromYmd(skj.SgyStDay),
    sgy_ed_day: fromYmd(skj.SgyEdDay),
    nsh_y_day: fromYmd(skj.NshYDay),
    nsh_y_time: hhmm(skj.NshYTime),
    nsh_day: fromYmd(skj.NshDay),
    loaner_out_day: fromYmd(skj.DkasiDay),
    loaner_back_day: fromYmd(skj.DmodoDay),
    sales_staff: (sold && str(s.EigtntNmU)) || str(s.EigtntNmM),
    work_staff: (sold && str(s.SgytntNmU)) || str(s.SgytntNmM),
    reception_staff: str(s.UketntNm),
    memo: str(s.Memo).slice(0, 1000),
    customer_name: nameOf(k),
    phone: phoneOf(k),
    plate: plateOf(c),
    maker: str(c?.MkNm),
    car_name: str(c?.CarNm),
    jocar_created_at: jocarDateTime(s.CreDate),
    is_sample: false,
  };
}

/** 車両検索の結果1件（車検日や抹消の条件で落とさない） */
export function mapVehicleHit(set) {
  const c = set?.CarInfo;
  if (!c) return null;
  const carNo = str(c.CarNo).toUpperCase();
  if (!/^[A-Z]{2}\d{8}$/.test(carNo)) return null;
  const k = set.KokyInfo || null;
  return {
    car_no: carNo,
    shkn_day: fromYmd(c.ShknDay),
    plate: plateOf(c),
    maker: str(c.MkNm),
    car_name: str(c.CarNm),
    grade: str(c.Grade),
    customer_name: nameOf(k),
    customer_kana: k ? str(k.KokyKn) : '',
    phone: phoneOf(k),
    sales_staff: k ? str(k.TntNm) : '',
    work_staff: k ? str(k.SgytntNm) : '',
    erased: Boolean(fromYmd(c.EraseDay)),
  };
}
