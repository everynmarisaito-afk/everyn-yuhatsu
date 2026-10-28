import { createSession, isSameOrigin, setSessionCookie, verifyStaffPassword } from '@/lib/server/auth';
import { handle, HttpError, json, readJson } from '@/lib/server/http';

export const POST = handle(async (req) => {
  if (!isSameOrigin(req)) throw new HttpError(403, 'リクエスト元を確認できません。ページを開き直してください。');
  const body = await readJson(req);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password || email.length > 200 || password.length > 200) {
    throw new HttpError(400, 'メールアドレスとパスワードを入力してください。');
  }
  const staff = await verifyStaffPassword(email, password);
  if (!staff) throw new HttpError(401, 'メールアドレスかパスワードが違うか、このアカウントは利用できません。');
  const token = await createSession(staff.id);
  return setSessionCookie(json({ ok: true, name: staff.name || staff.email }), token);
});
