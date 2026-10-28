import { requireStaff } from '@/lib/server/auth';
import { handle, HttpError, json, readJson } from '@/lib/server/http';
import { linkSeibiManually, unlinkSeibi } from '@/lib/server/nyuko';

// ジョーカー伝票との結び付け（link）／解除（unlink）
export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, { write: true });
  const { id } = await ctx.params;
  const body = await readJson(req);
  const version = Number.isInteger(body?.version) ? body.version : -1;
  if (version < 1) throw new HttpError(400, '画面を更新してからもう一度操作してください');
  if (body?.action === 'unlink') return json({ booking: await unlinkSeibi(id, version, staff) });
  if (body?.action === 'link') return json({ booking: await linkSeibiManually(id, body.seibi_no, version, staff) });
  throw new HttpError(400, '操作が正しくありません');
});
