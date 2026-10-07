const { buildReq, runValidators } = require('./_helpers');
const {
  validateRoomTitle,
  validateRoomEmptyMessage,
  validateRoomSearch,
  validateMemberOnly,
  validateGuestConversationEnabled,
  validateRoomDisplayOrders,
  validateRoomDisplayOrder,
} = require('../../../validates/room.validate');

describe('ルームの入力検証', () => {
  test.each([true, false, undefined])('ゲスト会話解析の許可に真偽値と省略を受け付ける（%s）', async (value) => {
    const result = await runValidators(validateGuestConversationEnabled('guest_conversation_enabled'),
      buildReq({ body: { guest_conversation_enabled: value } }));
    expect(result.isEmpty()).toBe(true);
  });

  test.each(['true', 'false', 1, 0, null, [], {}])('ゲスト会話解析の許可が真偽値でなければ拒否する（%j）', async (value) => {
    const result = await runValidators(validateGuestConversationEnabled('guest_conversation_enabled'),
      buildReq({ body: { guest_conversation_enabled: value } }));
    expect(result.isEmpty()).toBe(false);
  });
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

describe('案内文の入力検証', () => {
  test.each([
    ['省略', undefined], ['null', null], ['空文字', ''], ['空白', ' '], ['200文字', 'あ'.repeat(200)],
  ])('任意入力と200文字までを受け付ける（%s）', async (_label, value) => {
    const result = await runValidators(validateRoomEmptyMessage('empty_message'), buildReq({ body: { empty_message: value } }));
    expect(result.isEmpty()).toBe(true);
  });
  test.each([
    ['数値', 123], ['オブジェクト', {}], ['配列', []], ['201文字', 'あ'.repeat(201)],
    ['改行', '前\n後'], ['復帰', '前\r後'], ['行区切り', '前\u2028後'], ['段落区切り', '前\u2029後'],
  ])('型違い・上限超過・改行を拒否する（%s）', async (_label, value) => {
    const result = await runValidators(validateRoomEmptyMessage('empty_message'), buildReq({ body: { empty_message: value } }));
    expect(result.isEmpty()).toBe(false);
  });
});
