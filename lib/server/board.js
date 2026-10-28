import 'server-only';
import { db, q } from './supabase.js';
import { HttpError } from './http.js';
import { addDays, isIsoDate } from '../shared/dates.js';
import { BOARD_FUTURE_DAYS, BOARD_PAST_DAYS, CLOSED_STATUSES, DM_KBN, METHODS, STATUS_IDS } from '../shared/constants.js';

const VEHICLE_COLS = [
  'car_no', 'shkn_day', 'plate_area', 'plate_class', 'plate_kana', 'plate_number', 'maker', 'car_name', 'grade',
  'model_year', 'mileage_km', 'koky_no', 'customer_name', 'customer_kana', 'tel', 'mobile', 'email', 'email2',
  'mobile_email', 'dm_kbn', 'prefer_tel', 'prefer_mail', 'prefer_days', 'prefer_from', 'prefer_to', 'sales_staff',
  'service_staff', 'is_sample',
].join(',');

const inList = (values) => `(${values.map((v) => `"${String(v).replace(/"/g, '')}"`).join(',')})`;

/** 一覧：満了日が範囲内の車両＋誘発状況＋最後の連絡 */
export async function loadBoard(today) {
  const from = addDays(today, -BOARD_PAST_DAYS);
  const to = addDays(today, BOARD_FUTURE_DAYS);
  const vehicles = await db(
    `yuhatsu_vehicles?select=${VEHICLE_COLS}&shkn_day=gte.${from}&shkn_day=lte.${to}&order=shkn_day.asc&limit=5000`,
  );
  const visible = vehicles.filter((v) => v.dm_kbn !== DM_KBN.refuse);
  const refused = vehicles.length - visible.length;

  const followups = new Map();
  const lastLogs = new Map();
  const carNos = [...new Set(visible.map((v) => v.car_no))];
  for (let i = 0; i < carNos.length; i += 150) {
    const part = q(inList(carNos.slice(i, i + 150)));
    const [fs, ls] = await Promise.all([
      db(`yuhatsu_followups?select=car_no,shkn_day,status,next_contact_on,version,updated_at,updated_by_name&car_no=in.${part}`),
      db(`yuhatsu_logs?select=car_no,shkn_day,method,staff_name,created_at&car_no=in.${part}&order=created_at.desc&limit=3000`),
    ]);
    for (const f of fs) followups.set(`${f.car_no}|${f.shkn_day}`, f);
    for (const l of ls) {
      const key = `${l.car_no}|${l.shkn_day}`;
      if (!lastLogs.has(key)) lastLogs.set(key, l);
    }
  }

  const items = visible.map((v) => {
    const key = `${v.car_no}|${v.shkn_day}`;
    const f = followups.get(key);
    const l = lastLogs.get(key);
    return {
      ...v,
      status: f?.status || 'none',
      next_contact_on: f?.next_contact_on || null,
      version: f?.version || 0,
      updated_by_name: f?.updated_by_name || '',
      last_contact: l ? { method: l.method, staff_name: l.staff_name, at: l.created_at } : null,
    };
  });
  return { items, refused };
}

async function requireVehicle(carNo, shknDay) {
  if (!/^[A-Z]{2}\d{8}$/.test(carNo || '')) throw new HttpError(400, '車輌№が正しくありません');
  if (!isIsoDate(shknDay)) throw new HttpError(400, '満了日が正しくありません');
  const rows = await db(`yuhatsu_vehicles?select=car_no&car_no=eq.${q(carNo)}&shkn_day=eq.${q(shknDay)}&limit=1`);
  if (!rows?.length) throw new HttpError(404, 'この車両は一覧から外れたか、満了日が更新されています。画面を更新してください。');
}

export async function loadLogs(carNo, shknDay) {
  await requireVehicle(carNo, shknDay);
  return db(
    `yuhatsu_logs?select=id,method,memo,staff_name,created_at&car_no=eq.${q(carNo)}&shkn_day=eq.${q(shknDay)}&order=created_at.desc&limit=200`,
  );
}

async function currentFollowup(carNo, shknDay) {
  const rows = await db(
    `yuhatsu_followups?select=status,next_contact_on,version,updated_by_name,updated_at&car_no=eq.${q(carNo)}&shkn_day=eq.${q(shknDay)}&limit=1`,
  );
  return rows?.[0] || null;
}

/**
 * ステータス・次回連絡日を更新。version が画面の値と違えば（他のスタッフが先に更新していれば）409。
 * @param {{status?:string, next_contact_on?:string|null, version:number}} patch
 */
export async function saveFollowup(carNo, shknDay, patch, staff) {
  await requireVehicle(carNo, shknDay);
  const body = {};
  if (patch.status !== undefined) {
    if (!STATUS_IDS.includes(patch.status)) throw new HttpError(400, 'ステータスが正しくありません');
    body.status = patch.status;
  }
  if (patch.next_contact_on !== undefined) {
    if (patch.next_contact_on !== null && patch.next_contact_on !== '' && !isIsoDate(patch.next_contact_on)) {
      throw new HttpError(400, '次回連絡日が正しくありません');
    }
    body.next_contact_on = patch.next_contact_on || null;
  }
  if (CLOSED_STATUSES.includes(body.status)) body.next_contact_on = null;
  if (!Object.keys(body).length) throw new HttpError(400, '変更内容がありません');

  const version = Number.isInteger(patch.version) && patch.version >= 0 ? patch.version : -1;
  if (version < 0) throw new HttpError(400, '画面を更新してからもう一度操作してください');
  const stamp = { updated_at: new Date().toISOString(), updated_by_name: staff.name };

  let saved;
  if (version === 0) {
    // まだ行がない → 作る。同時に別のスタッフが作っていたら 409
    try {
      [saved] = await db('yuhatsu_followups?select=status,next_contact_on,version,updated_by_name,updated_at', {
        method: 'POST',
        prefer: 'return=representation',
        body: { car_no: carNo, shkn_day: shknDay, status: 'none', ...body, version: 1, ...stamp },
      });
    } catch (e) {
      if (e?.code !== '23505') throw e;
      saved = null;
    }
  } else {
    [saved] = await db(
      `yuhatsu_followups?car_no=eq.${q(carNo)}&shkn_day=eq.${q(shknDay)}&version=eq.${version}&select=status,next_contact_on,version,updated_by_name,updated_at`,
      { method: 'PATCH', prefer: 'return=representation', body: { ...body, version: version + 1, ...stamp } },
    );
  }
  if (!saved) {
    const current = await currentFollowup(carNo, shknDay);
    throw new HttpError(409, `${current?.updated_by_name || '他のスタッフ'}さんが先に更新しました。最新の内容を表示します。`, { current });
  }
  return saved;
}

/** 連絡を記録。未連絡なら「案内済み」に進める */
export async function addLog(carNo, shknDay, { method, memo }, staff) {
  await requireVehicle(carNo, shknDay);
  if (!METHODS.includes(method)) throw new HttpError(400, '連絡手段が正しくありません');
  const text = typeof memo === 'string' ? memo.replace(/\r\n/g, '\n').trim() : '';
  if (text.length > 2000) throw new HttpError(400, 'メモは2000文字以内で入力してください');

  await db('yuhatsu_logs', {
    method: 'POST',
    prefer: 'return=minimal',
    body: { car_no: carNo, shkn_day: shknDay, method, memo: text, staff_id: staff.staffId, staff_name: staff.name },
  });

  let followup = await currentFollowup(carNo, shknDay);
  if (!followup || followup.status === 'none') {
    try {
      followup = await saveFollowup(carNo, shknDay, { status: 'sent', version: followup?.version || 0 }, staff);
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 409)) throw e;
      followup = await currentFollowup(carNo, shknDay);
    }
  }
  const logs = await loadLogs(carNo, shknDay);
  return { followup, logs };
}
