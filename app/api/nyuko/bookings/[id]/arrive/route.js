import { requireStaff } from '@/lib/server/auth';
import { handle, HttpError, json, readJson } from '@/lib/server/http';
import { markArrived } from '@/lib/server/nyuko';

// 「入庫済み」ボタン（arrived: false で取り消し）
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, { write: true });
  const { id } = await ctx.params;
  const body = await readJson(req);
  const version = Number.isInteger(body?.version) ? body.version : -1;
  if (version < 1) throw new HttpError(400, '画面を更新してからもう一度操作してください');
  return json({ booking: await markArrived(id, body?.arrived !== false, version, staff) });
});
