import { timingSafeEqual } from 'node:crypto';
import { handle, HttpError, json } from '@/lib/server/http';
import { runSync } from '@/lib/server/sync';

export const maxDuration = 60;

// Vercel の定期実行（vercel.json の crons、毎朝6:00）。Authorization: Bearer <CRON_SECRET> を確認する
export const GET = handle(async (req) => {
  const secret = process.env.CRON_SECRET || '';
  const given = req.headers.get('authorization') || '';
  const expected = `Bearer ${secret}`;
  const ok = secret.length >= 32 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) throw new HttpError(401, '認証できません');
  const result = await runSync('cron');
  return json(result, result.ok ? 200 : 502);
});
