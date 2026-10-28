import { requireStaff } from '@/lib/server/auth';
import { handle, json, readJson } from '@/lib/server/http';
import { createBooking } from '@/lib/server/nyuko';

export const POST = handle(async (req) => {
  const staff = await requireStaff(req, { write: true });
  const booking = await createBooking(await readJson(req), staff);
  return json({ booking }, 201);
});
