import { requireStaff } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';
import { jocarConfigured } from '@/lib/server/jocar';
import { loadNyuko } from '@/lib/server/nyuko';
import { ensureSampleSeeded, latestRun } from '@/lib/server/sync';
import { todayJst } from '@/lib/shared/dates';

export const GET = handle(async (req) => {
  await requireStaff(req);
  await ensureSampleSeeded();
  const today = todayJst();
  const [data, run] = await Promise.all([loadNyuko(today), latestRun()]);
  return json({ today, mode: jocarConfigured() ? 'jocar' : 'sample', lastSync: run, ...data });
});
