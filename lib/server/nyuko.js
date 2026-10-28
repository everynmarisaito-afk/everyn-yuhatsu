import 'server-only';
import { db, isUuid, q } from './supabase.js';
import { HttpError } from './http.js';
import { setFollowupBySystem } from './board.js';
import { addDays, isIsoDate } from '../shared/dates.js';
import { HOLD_REASONS, STORES, WORK_TYPES } from '../shared/constants.js';
import { pickSeibiFor, seibiArrival } from '../shared/nyuko.js';

// 入庫管理：予約（nyuko_bookings）とジョーカー整備伝票の写し（nyuko_seibi）

const BOOKING_COLS = [
  'id', 'source', 'car_no', 'shkn_day', 'member_reservation_id', 'customer_name', 'customer_kana', 'phone', 'plate',
  'maker', 'car_name', 'work_type', 'work_detail', 'store', 'planned_date', 'planned_time', 'return_planned_date',
  'loaner', 'sales_staff', 'work_staff', 'memo', 'state', 'hold_reason', 'seibi_no', 'link_mode', 'unlinked_seibi',
  'is_sample', 'version', 'created_by_name', 'updated_by_name', 'created_at', 'updated_at',
].join(',');

const SEIBI_COLS = [
  'seibi_no', 'car_no', 'work_type', 'work_sub', 'gm_status', 'uke_day', 'nko_y_day', 'nko_y_time', 'nko_day',
  'sgy_st_day', 'sgy_ed_day', 'nsh_y_day', 'nsh_y_time', 'nsh_day', 'loaner_out_day', 'loaner_back_day',
  'sales_staff', 'work_staff', 'reception_staff', 'memo', 'customer_name', 'phone', 'plate', 'maker', 'car_name',
  'jocar_created_at', 'is_sample',
].join(',');

const inList = (values) => q(`(${values.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})`);

// ------------------------------------------------------------------
// 予約とジョーカー伝票の自動結び付け（同期のあとに呼ぶ）
// ------------------------------------------------------------------
export async function linkBookings(today) {
  const bookings = await db(
    `nyuko_bookings?select=id,car_no,planned_date,unlinked_seibi,source,shkn_day&state=eq.booked&seibi_no=is.null&car_no=not.is.null&planned_date=gte.${addDays(today, -60)}`,
  );
  let linked = 0;
  if (bookings.length) {
    const cars = [...new Set(bookings.map((b) => b.car_no))];
    const [seibi, taken] = await Promise.all([
      db(`nyuko_seibi?select=seibi_no,car_no,uke_day,nko_day,nko_y_day,jocar_created_at&car_no=in.${inList(cars)}`),
      db('nyuko_bookings?select=seibi_no&seibi_no=not.is.null'),
    ]);
    const used = new Set(taken.map((t) => t.seibi_no));
    for (const b of bookings.sort((x, y) => x.planned_date.localeCompare(y.planned_date))) {
      const hit = pickSeibiFor(b, seibi.filter((s) => !used.has(s.seibi_no)));
      if (!hit) continue;
      const rows = await db(`nyuko_bookings?id=eq.${b.id}&seibi_no=is.null&select=id`, {
        method: 'PATCH', prefer: 'return=representation', body: { seibi_no: hit.seibi_no, link_mode: 'auto', updated_at: new Date().toISOString() },
      }).catch((e) => { if (e?.code === '23505') return []; throw e; });
      if (rows?.length) { used.add(hit.seibi_no); linked += 1; }
    }
  }
  await syncYuhatsuFromNyuko();
  return linked;
}

/** 誘発から作った予約が入庫したら、誘発のステータスを「入庫済み」にする */
async function syncYuhatsuFromNyuko() {
  const rows = await db('nyuko_bookings?select=car_no,shkn_day,seibi_no&source=eq.yuhatsu&state=eq.booked&seibi_no=not.is.null&shkn_day=not.is.null');
  if (!rows.length) return;
  const seibi = await db(`nyuko_seibi?select=seibi_no,nko_day,uke_day,jocar_created_at&seibi_no=in.${inList(rows.map((r) => r.seibi_no))}`);
  const arrivedNos = new Set(seibi.filter((s) => s.nko_day || s.uke_day || s.jocar_created_at).map((s) => s.seibi_no));
  for (const r of rows) {
    if (arrivedNos.has(r.seibi_no)) {
      await setFollowupBySystem(r.car_no, r.shkn_day, 'done', '入庫管理（自動）', { onlyFrom: ['none', 'sent', 'wait', 'book'] });
    }
  }
}

// ------------------------------------------------------------------
// 画面用の読み込み
// ------------------------------------------------------------------
function workTypeOfReservation(t) {
  if (t === '車検') return '車検';
  if (String(t).includes('点検')) return '点検';
  if (t === '一般整備') return '一般整備';
  return 'その他';
}

export async function loadNyuko(today) {
  const since = addDays(today, -60);
  const [bookings, seibi, reservations, staff] = await Promise.all([
    db(`nyuko_bookings?select=${BOOKING_COLS}&or=(planned_date.gte.${since},and(state.eq.booked,seibi_no.not.is.null))&order=planned_date.asc,planned_time.asc&limit=3000`),
    db(`nyuko_seibi?select=${SEIBI_COLS}&or=(nsh_day.is.null,nsh_day.gte.${addDays(today, -14)})&limit=5000`),
    db(
      'reservations?select=id,reservation_type,preferred_date,preferred_time,confirmed_date,confirmed_time,status,staff_name,loaner_car_required,customer_note,' +
      'customer:customers(name,furigana,phone),vehicle:vehicles(maker,model,grade,license_plate)' +
      `&status=in.(pending,confirmed,change_requested)&or=(confirmed_date.gte.${addDays(today, -7)},and(confirmed_date.is.null,preferred_date.gte.${addDays(today, -7)}))&order=preferred_date.asc&limit=500`,
    ).catch((e) => { console.error(e); return []; }),
    db('staff_members?select=name,department&active=eq.true&order=display_order.asc,name.asc').catch(() => []),
  ]);

  const seibiByNo = new Map(seibi.map((s) => [s.seibi_no, s]));
  // 予約に結び付いた伝票が範囲外（古い納車済み）でも予約側に出せるよう、足りない分を取り直す
  const missing = bookings.filter((b) => b.seibi_no && !seibiByNo.has(b.seibi_no)).map((b) => b.seibi_no);
  if (missing.length) {
    for (const s of await db(`nyuko_seibi?select=${SEIBI_COLS}&seibi_no=in.${inList(missing)}`)) seibiByNo.set(s.seibi_no, s);
  }
  const linkedNos = new Set(bookings.map((b) => b.seibi_no).filter(Boolean));
  const imported = new Set(bookings.map((b) => b.member_reservation_id).filter(Boolean));

  const items = bookings.map((b) => ({ ...b, seibi: b.seibi_no ? seibiByNo.get(b.seibi_no) || null : null }));
  // 予約なしで入庫したジョーカー伝票（部品だけの伝票と、14日より前に納車済みのものは除く）
  const walkIns = seibi
    .filter((s) => !linkedNos.has(s.seibi_no) && s.work_type !== '部品')
    .filter((s) => (seibiArrival(s) || '') >= addDays(today, -60));

  const memberApp = reservations
    .filter((r) => !imported.has(r.id))
    .map((r) => ({
      id: r.id,
      work_type: workTypeOfReservation(r.reservation_type),
      reservation_type: r.reservation_type,
      date: r.confirmed_date || r.preferred_date,
      time: (r.confirmed_time || r.preferred_time || '').slice(0, 5),
      confirmed: Boolean(r.confirmed_date),
      status: r.status,
      staff_name: r.staff_name || '',
      loaner: Boolean(r.loaner_car_required),
      note: r.customer_note || '',
      customer_name: r.customer?.name || '',
      customer_kana: r.customer?.furigana || '',
      phone: r.customer?.phone || '',
      maker: r.vehicle?.maker || '',
      car_name: [r.vehicle?.model, r.vehicle?.grade].filter(Boolean).join(' '),
      plate: r.vehicle?.license_plate || '',
    }));

  const isMechanic = (d) => String(d || '').includes('メカニック');
  const staffNames = {
    work: [...new Set([...staff.filter((s) => isMechanic(s.department)).map((s) => s.name), ...seibi.map((s) => s.work_staff)].filter(Boolean))],
    sales: [...new Set([...staff.filter((s) => !isMechanic(s.department)).map((s) => s.name), ...seibi.map((s) => s.sales_staff)].filter(Boolean))],
  };
  return { items, walkIns, memberApp, staffNames };
}

// ------------------------------------------------------------------
// 予約の登録・更新
// ------------------------------------------------------------------
const text = (v, max, label) => {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new HttpError(400, `${label}の形式が正しくありません`);
  const s = v.replace(/\r\n/g, '\n').trim();
  if (s.length > max) throw new HttpError(400, `${label}は${max}文字以内で入力してください`);
  return s;
};
const line = (v, max, label) => text(v, max, label).replace(/\s+/g, ' ');
const dateOrNull = (v, label) => {
  if (v === '' || v === null || v === undefined) return null;
  if (!isIsoDate(v)) throw new HttpError(400, `${label}の日付が正しくありません`);
  return v;
};

const FIELDS = {
  customer_name: (v) => line(v, 100, 'お客様名'),
  customer_kana: (v) => line(v, 100, 'カナ'),
  phone: (v) => line(v, 30, '電話番号').replace(/[^\d+\-() ]/g, ''),
  plate: (v) => line(v, 40, 'ナンバー'),
  maker: (v) => line(v, 50, 'メーカー'),
  car_name: (v) => line(v, 100, '車名'),
  work_type: (v) => { if (!WORK_TYPES.includes(v)) throw new HttpError(400, '作業区分が正しくありません'); return v; },
  work_detail: (v) => text(v, 1000, '作業内容'),
  store: (v) => { if (!STORES.includes(v)) throw new HttpError(400, '店舗が正しくありません'); return v; },
  planned_date: (v) => { if (!isIsoDate(v)) throw new HttpError(400, '入庫予定日を入れてください'); return v; },
  planned_time: (v) => { const s = line(v, 5, '時間'); if (s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new HttpError(400, '時間は 10:30 のように入力してください'); return s; },
  return_planned_date: (v) => dateOrNull(v, '納車予定日'),
  loaner: (v) => v === true,
  sales_staff: (v) => line(v, 50, '営業担当'),
  work_staff: (v) => line(v, 50, '作業担当'),
  memo: (v) => text(v, 2000, 'メモ'),
  state: (v) => { if (!['booked', 'cancelled', 'no_show'].includes(v)) throw new HttpError(400, '状態が正しくありません'); return v; },
  hold_reason: (v) => { if (v !== '' && !HOLD_REASONS.includes(v)) throw new HttpError(400, '保留の理由が正しくありません'); return v; },
};

function clean(input, keys) {
  const out = {};
  for (const k of keys) if (k in input) out[k] = FIELDS[k](input[k]);
  return out;
}

async function getBooking(id) {
  if (!isUuid(id)) throw new HttpError(400, '予約が見つかりません');
  const rows = await db(`nyuko_bookings?select=${BOOKING_COLS}&id=eq.${id}&limit=1`);
  if (!rows?.length) throw new HttpError(404, '予約が見つかりません。画面を更新してください。');
  return rows[0];
}

/**
 * @param {object} input 画面の入力。car_no（ジョーカー車両）、source、shkn_day、member_reservation_id を含められる
 */
export async function createBooking(input, staff) {
  const body = clean(input || {}, Object.keys(FIELDS).filter((k) => !['state', 'hold_reason'].includes(k)));
  if (!body.planned_date) throw new HttpError(400, '入庫予定日を入れてください');
  if (!body.customer_name && !body.plate) throw new HttpError(400, 'お客様名かナンバーを入れてください');
  if (body.return_planned_date && body.return_planned_date < body.planned_date) throw new HttpError(400, '納車予定日が入庫予定日より前になっています');

  const source = ['manual', 'yuhatsu', 'member_app'].includes(input.source) ? input.source : 'manual';
  const carNo = typeof input.car_no === 'string' && /^[A-Z]{2}\d{8}$/.test(input.car_no) ? input.car_no : null;
  const shknDay = source === 'yuhatsu' && isIsoDate(input.shkn_day) ? input.shkn_day : null;
  const reservationId = source === 'member_app' && isUuid(input.member_reservation_id) ? input.member_reservation_id : null;
  if (source === 'yuhatsu' && (!carNo || !shknDay)) throw new HttpError(400, '誘発の車両が特定できません。画面を更新してください。');
  if (source === 'member_app' && !reservationId) throw new HttpError(400, '会員アプリの予約が特定できません');

  let row;
  try {
    [row] = await db(`nyuko_bookings?select=${BOOKING_COLS}`, {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        ...body, source, car_no: carNo, shkn_day: shknDay, member_reservation_id: reservationId,
        is_sample: Boolean(carNo?.startsWith('SM')), created_by_name: staff.name, updated_by_name: staff.name,
      },
    });
  } catch (e) {
    if (e?.code === '23505') throw new HttpError(409, 'この会員アプリの予約はすでに取り込まれています。画面を更新してください。');
    throw e;
  }
  if (source === 'yuhatsu') await setFollowupBySystem(carNo, shknDay, 'book', staff.name, { onlyFrom: ['none', 'sent', 'wait'] });
  return row;
}

export async function updateBooking(id, input, staff) {
  const current = await getBooking(id);
  const version = Number.isInteger(input?.version) ? input.version : -1;
  const body = clean(input || {}, Object.keys(FIELDS));
  if (!Object.keys(body).length) throw new HttpError(400, '変更内容がありません');
  const planned = body.planned_date || current.planned_date;
  const ret = 'return_planned_date' in body ? body.return_planned_date : current.return_planned_date;
  if (ret && ret < planned) throw new HttpError(400, '納車予定日が入庫予定日より前になっています');

  const [saved] = await db(`nyuko_bookings?id=eq.${id}&version=eq.${version}&select=${BOOKING_COLS}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { ...body, version: version + 1, updated_by_name: staff.name, updated_at: new Date().toISOString() },
  });
  if (!saved) {
    const latest = await getBooking(id);
    throw new HttpError(409, `${latest.updated_by_name || '他のスタッフ'}さんが先に更新しました。最新の内容を表示します。`, { current: latest });
  }
  // 誘発から作った予約をキャンセルしたら、誘発側を「再連絡待ち」に戻す
  if (saved.source === 'yuhatsu' && body.state && body.state !== 'booked' && current.state === 'booked') {
    await setFollowupBySystem(saved.car_no, saved.shkn_day, 'wait', staff.name, { onlyFrom: ['book'] });
  }
  return saved;
}

/** ジョーカー伝票との結び付きを外す（自動で結び直さないよう記録） */
export async function unlinkSeibi(id, version, staff) {
  const current = await getBooking(id);
  if (!current.seibi_no) throw new HttpError(400, 'ジョーカーの伝票と結び付いていません');
  const [saved] = await db(`nyuko_bookings?id=eq.${id}&version=eq.${version}&select=${BOOKING_COLS}`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      seibi_no: null, link_mode: null, unlinked_seibi: [...new Set([...(current.unlinked_seibi || []), current.seibi_no])],
      version: version + 1, updated_by_name: staff.name, updated_at: new Date().toISOString(),
    },
  });
  if (!saved) throw new HttpError(409, '他のスタッフが先に更新しました。画面を更新してください。', { current: await getBooking(id) });
  return saved;
}

/** 予約なしで入庫したジョーカー伝票を、既存の予約に手で結び付ける */
export async function linkSeibiManually(id, seibiNo, version, staff) {
  if (!/^[A-Z]{2}\d{8}$/.test(seibiNo || '')) throw new HttpError(400, '伝票番号が正しくありません');
  const exists = await db(`nyuko_seibi?select=seibi_no,car_no&seibi_no=eq.${q(seibiNo)}&limit=1`);
  if (!exists.length) throw new HttpError(404, 'ジョーカーの伝票が見つかりません。「今すぐ更新」してから試してください。');
  let saved;
  try {
    [saved] = await db(`nyuko_bookings?id=eq.${id}&version=eq.${version}&select=${BOOKING_COLS}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: { seibi_no: seibiNo, link_mode: 'manual', car_no: exists[0].car_no, version: version + 1, updated_by_name: staff.name, updated_at: new Date().toISOString() },
    });
  } catch (e) {
    if (e?.code === '23505') throw new HttpError(409, 'この伝票は別の予約に結び付いています。');
    throw e;
  }
  if (!saved) throw new HttpError(409, '他のスタッフが先に更新しました。画面を更新してください。', { current: await getBooking(id) });
  await syncYuhatsuFromNyuko();
  return saved;
}

