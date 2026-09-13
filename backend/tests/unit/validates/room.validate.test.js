const { buildReq, runValidators } = require('./_helpers');
const {
  validateRoomTitle,
  validateRoomSearch,
  validateMemberOnly,
  validateRoomDisplayOrders,
  validateRoomDisplayOrder,
} = require('../../../validates/room.validate');

describe('ルームの入力検証', () => {
  test('上限以内のルームタイトルを受け付ける', async () => {
    const req = buildReq({ body: { title: 'room' } });
    const result = await runValidators(validateRoomTitle('title'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('ルームの検索語はnullと上限以内の文字列を受け付ける', async () => {
    const reqNull = buildReq({ body: { search: null } });
    const resultNull = await runValidators(validateRoomSearch('search'), reqNull);
    expect(resultNull.isEmpty()).toBe(true);

    const reqMax = buildReq({ body: { search: 'a'.repeat(100) } });
    const resultMax = await runValidators(validateRoomSearch('search'), reqMax);
    expect(resultMax.isEmpty()).toBe(true);
  });

  test('ルームの検索語が上限を超えたら拒否する', async () => {
    const req = buildReq({ body: { search: 'a'.repeat(101) } });
    const result = await runValidators(validateRoomSearch('search'), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('メンバー限定の設定は真偽値を必須にする', async () => {
    const req = buildReq({ body: { member_only: false } });
    const result = await runValidators(validateMemberOnly('member_only'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('ルームの表示順の一括指定は配列を必須にする', async () => {
    const req = buildReq({ body: { display_orders: [] } });
    const result = await runValidators(validateRoomDisplayOrders('display_orders'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('ルームの表示順は100より大きい整数も受け付ける', async () => {
    const req = buildReq({ body: { display_order: 101 } });
    const result = await runValidators(validateRoomDisplayOrder('display_order'), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('ルームの表示順が負の整数なら拒否する', async () => {
    const req = buildReq({ body: { display_order: -1 } });
    const result = await runValidators(validateRoomDisplayOrder('display_order'), req);
    expect(result.isEmpty()).toBe(false);
  });
});
