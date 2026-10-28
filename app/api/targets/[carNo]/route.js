import { requireStaff } from '@/lib/server/auth';
import { saveFollowup } from '@/lib/server/board';
import { handle, json, readJson } from '@/lib/server/http';

// ステータス・次回連絡日の更新
export const PATCH = handle(async (req, ctx) => {
  const staff = await requireStaff(req, { write: true });
  const { carNo } = await ctx.params;
  const body = await readJson(req);
  const patch = { version: body?.version };
  if ('status' in (body || {})) patch.status = body.status;
  if ('next_contact_on' in (body || {})) patch.next_contact_on = body.next_contact_on;
  const followup = await saveFollowup(carNo, body?.shkn_day, patch, staff);
  return json({ followup });
});
