import { clearSessionCookie, isSameOrigin, revokeSession } from '@/lib/server/auth';
import { handle, HttpError, json } from '@/lib/server/http';

export const POST = handle(async (req) => {
  if (!isSameOrigin(req)) throw new HttpError(403, 'リクエスト元を確認できません。');
  await revokeSession(req);
  return clearSessionCookie(json({ ok: true }));
});
