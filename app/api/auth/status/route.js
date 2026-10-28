import { getSession } from '@/lib/server/auth';
import { handle, json } from '@/lib/server/http';

export const GET = handle(async (req) => {
  const s = await getSession(req);
  if (!s) return json({ authenticated: false });
  return json({ authenticated: true, name: s.name, role: s.role });
});
