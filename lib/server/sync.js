import 'server-only';
import { db, q } from './supabase.js';
import { HttpError } from './http.js';
import { fetchInspectionVehicles, jocarConfigured, JocarError } from './jocar.js';
import { sampleVehicles } from './sample.js';
import { todayJst } from '../shared/dates.js';

// JOCAR → yuhatsu_vehicles の同期。
//  * JOCAR のキーが未設定のあいだはサンプルデータを1回だけ入れる（毎日入れ直すと満了日が動いてステータスが消えるため）
//  * キーが設定されたら JOCAR の結果で入れ替え、サンプルは消す
//  * 誘発の状況（followups）と連絡記録（logs）は消さない

const CHUNK = 200;

async function upsertVehicles(rows, syncedAt) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, synced_at: syncedAt }));
    await db('yuhatsu_vehicles?on_conflict=car_no', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      body: chunk,
    });
  }
}

export async function latestRun() {
  const rows = await db('yuhatsu_sync_runs?select=mode,trigger,started_at,finished_at,ok,fetched,error&order=started_at.desc&limit=1');
  return rows?.[0] || null;
}

/** サンプルモードで、まだ何も入っていなければサンプルを入れる */
export async function ensureSampleSeeded() {
  if (jocarConfigured()) return;
  const any = await db('yuhatsu_vehicles?select=car_no&limit=1');
  if (any?.length) return;
  await runSync('manual');
}

/**
 * @param {'cron'|'manual'} trigger
 * @returns {Promise<{ok:boolean, mode:string, fetched:number, error?:string}>}
 */
export async function runSync(trigger) {
  const mode = jocarConfigured() ? 'jocar' : 'sample';

  // 二重実行の防止：2分以内に始まって終わっていない同期があれば待ってもらう
  const last = await latestRun();
  if (last && !last.finished_at && Date.now() - Date.parse(last.started_at) < 120_000) {
    throw new HttpError(409, 'いま同期中です。少し待ってから画面を更新してください。');
  }

  const startedAt = new Date().toISOString();
  const [run] = await db('yuhatsu_sync_runs?select=id', {
    method: 'POST', prefer: 'return=representation', body: { mode, trigger, started_at: startedAt },
  });

  try {
    const today = todayJst();
    let fetched = 0;
    if (mode === 'jocar') {
      const rows = await fetchInspectionVehicles(today);
      fetched = rows.length;
      await upsertVehicles(rows, startedAt);
      // 今回の結果に含まれなかった車両（範囲外になった・抹消・管理停止）とサンプルを消す
      await db(`yuhatsu_vehicles?or=(synced_at.lt.${q(`"${startedAt}"`)},is_sample.eq.true)`, { method: 'DELETE', prefer: 'return=minimal' });
      // サンプルで試した記録も片付ける（サンプルの車輌№は "SM" で始まる）
      await db('yuhatsu_logs?car_no=like.SM*', { method: 'DELETE', prefer: 'return=minimal' });
      await db('yuhatsu_followups?car_no=like.SM*', { method: 'DELETE', prefer: 'return=minimal' });
    } else {
      const existing = await db('yuhatsu_vehicles?select=car_no&is_sample=eq.true&limit=1');
      if (!existing?.length) {
        const rows = sampleVehicles(today);
        fetched = rows.length;
        await upsertVehicles(rows, startedAt);
      }
    }
    await db(`yuhatsu_sync_runs?id=eq.${run.id}`, {
      method: 'PATCH', prefer: 'return=minimal', body: { finished_at: new Date().toISOString(), ok: true, fetched },
    });
    return { ok: true, mode, fetched };
  } catch (e) {
    const message = e instanceof JocarError || e instanceof HttpError ? e.message : 'サーバー内部のエラーで同期できませんでした';
    console.error(e);
    await db(`yuhatsu_sync_runs?id=eq.${run.id}`, {
      method: 'PATCH', prefer: 'return=minimal', body: { finished_at: new Date().toISOString(), ok: false, error: message.slice(0, 2000) },
    }).catch(() => {});
    return { ok: false, mode, fetched: 0, error: message };
  }
}
