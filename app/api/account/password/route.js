import { requireStaff, verifyStaffPassword } from '@/lib/server/auth';
import { handle, HttpError, json, readJson } from '@/lib/server/http';
import { checkNewPassword, revokeStaffSessions, setAuthPassword } from '@/lib/server/password';

// 自分のパスワードを変える。body: { current, next, confirm }
export const POST = handle(async (req) => {
  const s = await requireStaff(req, { write: true });
  const body = await readJson(req);
  const current = typeof body?.current === 'string' ? body.current : '';
  if (!current || current.length > 200) throw new HttpError(400, '今のパスワードを入力してください。');
  const next = checkNewPassword(body?.next, body?.confirm);
  if (next === current) throw new HttpError(400, '今と同じパスワードです。別のパスワードにしてください。');

  const staff = s.email ? await verifyStaffPassword(s.email, current) : null;
  if (!staff || staff.id !== s.staffId) throw new HttpError(400, '今のパスワードが違います。');

  await setAuthPassword(s.staffId, next);
  await revokeStaffSessions(s.staffId, s.sessionId);
  return json({ ok: true });
});
