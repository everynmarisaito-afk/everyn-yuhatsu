import { requireStaff } from '@/lib/server/auth';
import { handle, HttpError, json, readJson } from '@/lib/server/http';
import { setWorkFlags } from '@/lib/server/nyuko';

// 作業の状況：部品待ち・保留・入庫未定（見積後）、検査ライン済み（車検）、作業済み、返却済み
// body: { booking_id | seibi_no, version, hold_reason? , kensa? }
export const POST = handle(async (req) => {
  const staff = await requireStaff(req, { write: true });
  const body = await readJson(req);
  const version = Number.isInteger(body?.version) ? body.version : -1;
  if (version < 0) throw new HttpError(400, '画面を更新してからもう一度操作してください');
  const target = body?.booking_id ? { booking_id: body.booking_id } : { seibi_no: body?.seibi_no };
  const change = {};
  if (typeof body?.hold_reason === 'string') change.hold_reason = body.hold_reason;
  if (typeof body?.kensa === 'boolean') change.kensa = body.kensa;
  if (typeof body?.done === 'boolean') change.done = body.done;
  if (typeof body?.returned === 'boolean') change.returned = body.returned;
  if (typeof body?.member === 'string') change.member = body.member;
  return json({ saved: await setWorkFlags(target, change, version, staff) });
});
