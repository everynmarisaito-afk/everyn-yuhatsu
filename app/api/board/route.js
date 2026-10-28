import { requireStaff } from '@/lib/server/auth';
import { loadBoard } from '@/lib/server/board';
import { handle, json } from '@/lib/server/http';
import { jocarConfigured } from '@/lib/server/jocar';
import { ensureSampleSeeded, latestRun } from '@/lib/server/sync';
import { todayJst } from '@/lib/shared/dates';

export const GET = handle(async (req) => {
  await requireStaff(req);
  await ensureSampleSeeded();
  const today = todayJst();
  const [{ items, refused }, run] = await Promise.all([loadBoard(today), latestRun()]);
  return json({ today, mode: jocarConfigured() ? 'jocar' : 'sample', lastSync: run, refused, items });
});
