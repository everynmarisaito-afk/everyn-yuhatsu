import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, daysBetween, fromYmd, todayJst } from '../lib/shared/dates.js';
import { keyNumber, mapJocarSet, parseJocarBody } from '../lib/server/jocar-map.js';
import { bucket, guidanceMessage, isDue, modelYear, needsAction } from '../lib/shared/view.js';
import { sampleVehicles } from '../lib/server/sample.js';

const TODAY = '2026-10-28';

test('日本時間の今日', () => {
  assert.equal(todayJst(new Date('2026-10-27T15:30:00Z')), '2026-10-28');
  assert.equal(todayJst(new Date('2026-10-27T14:59:00Z')), '2026-10-27');
});

test('日付の計算', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(daysBetween('2026-10-28', '2026-11-27'), 30);
  assert.equal(addMonths('2026-12-31', -2), '2026-10-31');
  assert.equal(addMonths('2027-04-30', -2), '2027-02-28');
});

test('JOCAR の日付', () => {
  assert.equal(fromYmd('20261128'), '2026-11-28');
  assert.equal(fromYmd('20270200'), '2027-02-28'); // 日なし → 月末
  assert.equal(fromYmd('00000000'), null);
  assert.equal(fromYmd(''), null);
  assert.equal(fromYmd('20261332'), null);
});

const set = (car = {}, koky = {}) => ({
  CarInfo: { CarNo: 'CK00000123', ShknDay: '20261201', TrknoRk: '品川', TrknoBn: '300', TrknoKn: 'さ', TrknoNo: '1208', MkNm: 'アウディ', CarNm: 'RS3', Grade: 'ベース', NenskDay: '20210400', Kyori: '28400', EraseDay: '00000000', MngStopDay: '00000000', ...car },
  KokyInfo: { KokyNo: 'KK00000045', KokyNm1: '高橋', KokyNm2: '健一', KokyKn: 'タカハシ', Tel: '', PTel: '090-0000-0101', Mail: 'a@example.com', DmKbnCd: '1', ContactTelFlgCd: '1', ContactMailFlgCd: '0', ContactMonFlgCd: '1', ContactSatFlgCd: '1', ContactStTime: '1800', ContactEdTime: '2000', TntNm: '斎藤', ...koky },
});

test('JOCAR の1セットを行に変換', () => {
  const r = mapJocarSet(set(), TODAY);
  assert.equal(r.car_no, 'CK00000123');
  assert.equal(r.shkn_day, '2026-12-01');
  assert.equal(r.customer_name, '高橋 健一');
  assert.equal(r.model_year, '202104');
  assert.equal(r.mileage_km, 28400);
  assert.equal(r.prefer_tel, true);
  assert.equal(r.prefer_mail, false);
  assert.equal(r.prefer_days, '月土');
  assert.equal(r.prefer_from, '1800');
  assert.equal(r.sales_staff, '斎藤');
});

test('抹消・管理停止・満了日なしは取り込まない', () => {
  assert.equal(mapJocarSet(set({ EraseDay: '20260101' }), TODAY), null);
  assert.equal(mapJocarSet(set({ MngStopDay: '20261001' }), TODAY), null);
  assert.ok(mapJocarSet(set({ MngStopDay: '20270101' }), TODAY)); // 停止日が先ならまだ対象
  assert.equal(mapJocarSet(set({ ShknDay: '00000000' }), TODAY), null);
  assert.equal(mapJocarSet(set({ CarNo: 'X1' }), TODAY), null);
});

test('保有者なしでも車両は取り込む', () => {
  const r = mapJocarSet({ CarInfo: set().CarInfo }, TODAY);
  assert.equal(r.customer_name, '');
  assert.equal(r.koky_no, null);
});

test('MaxKey と応答本文', () => {
  assert.equal(keyNumber('CK00000100'), 100);
  assert.equal(keyNumber(''), null);
  const body = { messageID: 'I01001', detail: { RecordCount: '1' } };
  assert.deepEqual(parseJocarBody(JSON.stringify(body)), body);
  assert.deepEqual(parseJocarBody(JSON.stringify(JSON.stringify(body))), body); // 二重に文字列化された応答
  assert.equal(parseJocarBody('not json'), null);
});

test('期間の区分と要対応', () => {
  assert.equal(bucket(-1), 'over');
  assert.equal(bucket(0), 'd30');
  assert.equal(bucket(30), 'd30');
  assert.equal(bucket(31), 'd60');
  assert.equal(bucket(61), 'd90');
  assert.equal(needsAction({ status: 'none' }, TODAY), true);
  assert.equal(needsAction({ status: 'wait', next_contact_on: '2026-10-28' }, TODAY), true);
  assert.equal(needsAction({ status: 'wait', next_contact_on: '2026-10-29' }, TODAY), false);
  assert.equal(isDue({ status: 'book', next_contact_on: '2026-10-01' }, TODAY), false);
});

test('表示の整形と案内文', () => {
  assert.equal(modelYear('202104'), '2021年4月');
  assert.equal(modelYear('2021'), '2021年');
  const msg = guidanceMessage(mapJocarSet(set(), TODAY));
  assert.match(msg, /高橋 健一 様/);
  assert.match(msg, /品川 300 さ 1208/);
  assert.match(msg, /2026年12月1日/);
  assert.match(msg, /https:\/\/shaken\.everyn-club\.com/);
});

test('サンプルは "SM" の車輌№で、DBの制約に合う', () => {
  const rows = sampleVehicles(TODAY);
  assert.equal(rows.length, 18);
  for (const r of rows) {
    assert.match(r.car_no, /^[A-Z]{2}\d{8}$/);
    assert.ok(r.car_no.startsWith('SM'));
    assert.equal(r.is_sample, true);
  }
});
