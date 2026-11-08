import 'server-only';
import { db } from './supabase.js';

/**
 * ジョーカーに出てくる担当者名をすべて集める（整備伝票の営業・作業担当、顧客カルテの営業・作業担当）。
 * JOCAR API には担当者マスタの取得がないため、実データから作る。
 * 営業と作業を兼ねる人もいるので、区別せず1つの名簿にして多く使われている順に並べる。
 */
export async function jocarStaffNames() {
  const [slips, cards] = await Promise.all([
    db('nyuko_seibi?select=sales_staff,work_staff&limit=20000').catch(() => []),
    db('yuhatsu_vehicles?select=sales_staff,service_staff&limit=20000').catch(() => []),
  ]);
  const count = new Map();
  const add = (n) => {
    const name = String(n || '').trim();
    if (name) count.set(name, (count.get(name) || 0) + 1);
  };
  for (const s of slips) { add(s.sales_staff); add(s.work_staff); }
  for (const v of cards) { add(v.sales_staff); add(v.service_staff); }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja')).map(([n]) => n);
}
