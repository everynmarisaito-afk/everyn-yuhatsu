import { requireStaff } from '@/lib/server/auth';
import { handle, HttpError, json } from '@/lib/server/http';
import { db } from '@/lib/server/supabase';

// 管理者用：有効なスタッフの一覧（パスワード再設定の相手を選ぶため）
export const GET = handle(async (req) => {
  const s = await requireStaff(req);
  if (s.role !== 'admin') throw new HttpError(403, '管理者だけが使えます。');
  const rows = await db('staff_users?select=id,name,email,role&is_active=eq.true&order=name.asc');
  return json({ staff: (rows || []).map((r) => ({ id: r.id, name: r.name || '', email: r.email || '', role: r.role === 'admin' ? 'admin' : 'staff', self: r.id === s.staffId })) });
});
