import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMemberIndex, memberStatus, phoneKey, plateKey, vinKey } from '../lib/shared/match.js';

test('キーのならし', () => {
  assert.equal(vinKey('ＷＢＡ８Ｅ１２０－１Ｋ０'), 'WBA8E1201K0'); // 全角（ジョーカー）→半角
  assert.equal(plateKey('品川 300 さ 12-08'), '品川300さ1208');
  assert.equal(plateKey('品川　３００　さ　１２０８'), '品川300さ1208');
  assert.equal(plateKey('品川300さ・・99'), '品川300さ99');
  assert.equal(phoneKey('090-0000-0101'), '09000000101');
});

test('メンバーサービスの判定', () => {
  const ix = buildMemberIndex([
    { member_number: 'M001', member_rank: 'PREMIUM', expiry_date: '2027-03-31', payment_status: 'paid', vehicle: { vin: 'WBA8E1201K0', license_plate: '品川 300 さ 12-08' }, customer: { phone: '090-0000-0101' } },
    { member_number: 'M002', member_rank: 'PREMIUM', expiry_date: '2026-10-31', payment_status: 'unpaid', vehicle: { vin: '', license_plate: '大阪330あ4321' }, customer: { phone: '080-1111-2222' } },
  ]);
  const T = '2026-11-08';
  // 車台番号で一致（ジョーカーは全角）
  const a = memberStatus(ix, { vin: 'ＷＢＡ８Ｅ１２０１Ｋ０', plate: '', phone: '' }, T);
  assert.equal(a.state, 'member'); assert.equal(a.number, 'M001'); assert.equal(a.by, 'vin');
  // ナンバーで一致、期限切れ・未入金
  const b = memberStatus(ix, { vin: '', plate: '大阪 330 あ 4321', phone: '' }, T);
  assert.equal(b.state, 'member'); assert.equal(b.expired, true); assert.equal(b.unpaid, true); assert.equal(b.by, 'plate');
  // 車は違うが電話番号が会員 → 別の車で加入
  assert.equal(memberStatus(ix, { vin: 'XXXX99999', plate: '堺 300 か 1111', phone: '09000000101' }, T).state, 'other_car');
  // どれも合わない
  assert.equal(memberStatus(ix, { vin: '', plate: '', phone: '' }, T).state, 'none');
});
