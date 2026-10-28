import { requireStaff } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { runSync } from '@/lib/server/sync';

export const maxDuration = 60;

// 画面の「今すぐ更新」
export const POST = handle(async (req) => {
  await requireStaff(req, { write: true });
  const result = await runSync('manual');
  return json(result, result.ok ? 200 : 502);
});
