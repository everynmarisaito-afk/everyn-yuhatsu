import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeliveryOverdue, normalizeWorkType, pickSeibiFor, progress } from '../lib/shared/nyuko.js';
import { mapJocarSeibi, mapVehicleHit } from '../lib/server/jocar-map.js';
import { sampleNyuko } from '../lib/server/sample.js';

const T = '2026-10-28';

test('作業区分の読み替え', () => {
  assert.equal(normalizeWorkType('車検'), '車検');
  assert.equal(normalizeWorkType('12ヶ月点検'), '点検');
  assert.equal(normalizeWorkType('一般整備'), '一般整備');
  assert.equal(normalizeWorkType('部品'), 'その他');
});

test('進み具合', () => {
  const b = (planned_date, state = 'booked') => ({ planned_date, state });
  assert.equal(progress(b('2026-10-30'), null, T).key, 'planned');
  assert.equal(progress(b(T), null, T).key, 'today');
  assert.equal(progress(b('2026-10-26'), null, T).key, 'missing');
  assert.equal(progress(b('2026-10-26', 'cancelled'), null, T).key, 'cancelled');
  assert.equal(progress(b(T), { uke_day: T }, T).key, 'arrived');
  assert.equal(progress(b(T), { nko_day: T, sgy_st_day: T }, T).key, 'working');
  assert.equal(progress(b(T), { nko_day: T, sgy_ed_day: T }, T).key, 'finished');
  assert.equal(progress(b(T), { nsh_day: T }, T).key, 'delivered');
  assert.equal(progress(null, { nko_day: T }, T).key, 'arrived');
  // アプリの「入庫済み」ボタン → 作業待ち（伝票が来たら伝票の日付が優先）
  assert.equal(progress({ ...b('2026-10-26'), arrived_at: '2026-10-28T01:00:00Z' }, null, T).label, '作業待ち');
  assert.equal(progress({ ...b(T), arrived_at: '2026-10-28T01:00:00Z' }, { nko_day: T, sgy_st_day: T }, T).key, 'working');
  assert.equal(progress(b(T), { nko_day: T }, T).label, '作業待ち');
});

test('納車予定超過', () => {
  assert.equal(isDeliveryOverdue(null, { nsh_y_day: '2026-10-27' }, T), true);
  assert.equal(isDeliveryOverdue(null, { nsh_y_day: '2026-10-27', nsh_day: '2026-10-27' }, T), false);
  assert.equal(isDeliveryOverdue({ planned_date: '2026-10-30', return_planned_date: '2026-10-27' }, null, T), false);
});

test('予約に結び付く伝票の選び方', () => {
  const booking = { car_no: 'CK00000001', planned_date: '2026-10-28', unlinked_seibi: ['SB00000009'] };
  const slips = [
    { seibi_no: 'SB00000001', car_no: 'CK00000001', nko_day: '2026-11-20' }, // 遠すぎる
    { seibi_no: 'SB00000002', car_no: 'CK00000001', nko_day: '2026-10-31' },
    { seibi_no: 'SB00000003', car_no: 'CK00000001', uke_day: '2026-10-29' }, // 一番近い
    { seibi_no: 'SB00000004', car_no: 'CK00000002', nko_day: '2026-10-28' }, // 別の車
    { seibi_no: 'SB00000009', car_no: 'CK00000001', nko_day: '2026-10-28' }, // 手で外した
  ];
  assert.equal(pickSeibiFor(booking, slips)?.seibi_no, 'SB00000003');
  assert.equal(pickSeibiFor({ ...booking, car_no: null }, slips), null);
});

test('JOCAR 整備伝票の変換', () => {
  const row = mapJocarSeibi({
    SeibiInfo: {
      GmNo: 'SB00000123', GmStsCd: '0', SgyKbnNm: '一般整備', SgyKbnNmSml: '修理', UkeDay: '20261027',
      EigtntNmM: '斎藤', SgytntNmM: '田中', UketntNm: '受付', Memo: 'メモ', CreDate: '2026/10/27 09:10:00.000',
      SkjInfo: { NkoYDay: '20261027', NkoYTime: '0930', NkoDay: '20261027', NshYDay: '20261030', NshYTime: '1700', NshDay: '00000000', SgyStDay: '00000000' },
    },
    CarInfo: { CarNo: 'CK00000045', TrknoRk: '大阪', TrknoBn: '300', TrknoKn: 'あ', TrknoNo: '1234', MkNm: 'BMW', CarNm: 'X3' },
    KokyInfo: { KokyNm1: '岡田', KokyNm2: '恵子', PTel: '090-0000-0001' },
  });
  assert.equal(row.seibi_no, 'SB00000123');
  assert.equal(row.car_no, 'CK00000045');
  assert.equal(row.nko_day, '2026-10-27');
  assert.equal(row.nsh_y_day, '2026-10-30');
  assert.equal(row.nsh_day, null);
  assert.equal(row.sgy_st_day, null);
  assert.equal(row.work_staff, '田中');
  assert.equal(row.plate, '大阪 300 あ 1234');
  assert.equal(row.customer_name, '岡田 恵子');
  assert.equal(row.jocar_created_at, '2026-10-27T09:10:00+09:00');
  assert.equal(mapJocarSeibi({ SeibiInfo: { GmNo: '' } }), null);
});

test('車両検索の結果', () => {
  const hit = mapVehicleHit({ CarInfo: { CarNo: 'CK00000001', ShknDay: '00000000', EraseDay: '00000000', TrknoNo: '1234' }, KokyInfo: { KokyNm1: 'A', SgytntNm: '田中' } });
  assert.equal(hit.shkn_day, null);
  assert.equal(hit.work_staff, '田中');
  assert.equal(hit.erased, false);
});

test('入庫サンプルがDBの制約に合う', () => {
  const { bookings, seibi } = sampleNyuko(T);
  for (const b of bookings) {
    assert.ok(['車検', '点検', '一般整備', 'その他'].includes(b.work_type));
    assert.ok(b.car_no === null || /^[A-Z]{2}\d{8}$/.test(b.car_no));
    assert.ok(b.planned_time === '' || /^\d{2}:\d{2}$/.test(b.planned_time));
    assert.equal(b.is_sample, true);
  }
  for (const s of seibi) assert.match(s.seibi_no, /^SS\d{8}$/);
  // サンプルの予約2件（Cクラス）がサンプル伝票に自動で結び付く
  const c = bookings.find((b) => b.car_no === 'SM00000004');
  assert.equal(pickSeibiFor(c, seibi)?.seibi_no, 'SS00000001');
});
