import { requireStaff } from '@/lib/server/auth';
import { handle, HttpError, json, readJson } from '@/lib/server/http';
import { checkNewPassword, revokeStaffSessions, setAuthPassword } from '@/lib/server/password';
import { db, isUuid, q } from '@/lib/server/supabase';

// 管理者用：スタッフのパスワードを再設定する。body: { next, confirm }
export const POST = handle(async (req, { params }) => {
  const s = await requireStaff(req, { write: true });
  if (s.role !== 'admin') throw new HttpError(403, '管理者だけが使えます。');
  const { id } = await params;
  if (!isUuid(id)) throw new HttpError(400, 'スタッフが正しくありません。');
  if (id === s.staffId) throw new HttpError(400, '自分のパスワードは「自分のパスワードを変更」から変えてください。');

  const rows = await db(`staff_users?select=id,name,email,is_active&id=eq.${q(id)}&limit=1`);
  const target = rows?.[0];
  if (!target || target.is_active !== true) throw new HttpError(404, 'このスタッフは見つからないか、利用停止になっています。');

  const body = await readJson(req);
  const next = checkNewPassword(body?.next, body?.confirm);
  await setAuthPassword(id, next);
  await revokeStaffSessions(id);
  console.info('staff password reset', { by: s.staffId, target: id });
  return json({ ok: true, name: target.name || target.email });
});
