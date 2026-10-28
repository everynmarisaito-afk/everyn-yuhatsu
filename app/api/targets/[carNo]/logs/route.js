import { requireStaff } from '@/lib/server/auth';
import { addLog, loadLogs } from '@/lib/server/board';
import { handle, json, readJson } from '@/lib/server/http';

export const GET = handle(async (req, ctx) => {
  await requireStaff(req);
  const { carNo } = await ctx.params;
  const shkn = new URL(req.url).searchParams.get('shkn');
  return json({ logs: await loadLogs(carNo, shkn) });
});

export const POST = handle(async (req, ctx) => {
  const staff = await requireStaff(req, { write: true });
  const { carNo } = await ctx.params;
  const body = await readJson(req);
  return json(await addLog(carNo, body?.shkn_day, { method: body?.method, memo: body?.memo }, staff));
});
