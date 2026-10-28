import { requireStaff } from '@/lib/server/auth';
import { handle, json, readJson } from '@/lib/server/http';
import { updateBooking } from '@/lib/server/nyuko';

export const PATCH = handle(async (req, ctx) => {
  const staff = await requireStaff(req, { write: true });
  const { id } = await ctx.params;
  const booking = await updateBooking(id, await readJson(req), staff);
  return json({ booking });
});
