import { requireStaff } from '@/lib/server/auth';
import { handle, HttpError, json } from '@/lib/server/http';
import { jocarConfigured, JocarError, searchVehicles } from '@/lib/server/jocar';
import { db, q } from '@/lib/server/supabase';

const fromLocal = (v) => ({
  car_no: v.car_no,
  shkn_day: v.shkn_day,
  plate: [v.plate_area, v.plate_class, v.plate_kana, v.plate_number].filter(Boolean).join(' '),
  maker: v.maker,
  car_name: v.car_name,
  grade: v.grade,
  customer_name: v.customer_name,
  customer_kana: v.customer_kana,
  phone: v.mobile || v.tel,
  sales_staff: v.sales_staff,
  work_staff: v.service_staff,
});
const LOCAL_COLS = 'car_no,shkn_day,plate_area,plate_class,plate_kana,plate_number,maker,car_name,grade,customer_name,customer_kana,tel,mobile,sales_staff,service_staff';

// 入庫予約の車両検索。?q=（ナンバー4桁・電話・お客様名）または ?car=（車輌№）
export const GET = handle(async (req) => {
  await requireStaff(req);
  const params = new URL(req.url).searchParams;
  const car = params.get('car');
  if (car) {
    if (!/^[A-Z]{2}\d{8}$/.test(car)) throw new HttpError(400, '車輌№が正しくありません');
    const rows = await db(`yuhatsu_vehicles?select=${LOCAL_COLS}&car_no=eq.${q(car)}&limit=1`);
    return json({ results: rows.map(fromLocal) });
  }
  const query = String(params.get('q') || '').trim();
  if (query.length < 2) throw new HttpError(400, '2文字以上で検索してください');
  if (query.length > 40) throw new HttpError(400, '検索語が長すぎます');

  if (jocarConfigured()) {
    try {
      return json({ results: await searchVehicles(query), source: 'jocar' });
    } catch (e) {
      if (e instanceof JocarError) throw new HttpError(502, e.message);
      throw e;
    }
  }
  // サンプルモード：取り込み済みの車両から探す
  const safe = query.replace(/[,()*"\\]/g, ' ').trim();
  const pat = q(`*${safe}*`);
  const rows = await db(
    `yuhatsu_vehicles?select=${LOCAL_COLS}&or=(customer_name.ilike.${pat},customer_kana.ilike.${pat},plate_number.ilike.${pat},tel.ilike.${pat},mobile.ilike.${pat},car_name.ilike.${pat})&limit=20`,
  );
  return json({ results: rows.map(fromLocal), source: 'local' });
});
