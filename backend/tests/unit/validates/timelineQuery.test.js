const { mapListRequest, mapDetailRequest } = require('../../../validates/timelineQuery');
const params = { room_id: '1'.repeat(24), post_id: '2'.repeat(24) };

describe('タイムライン対象クエリ', () => {
  test('検索の共通条件とカラム条件を別々に保持し、空の任意値を省く', () => {
    expect(mapListRequest(params, { from: null, globalServerQuery: { tags: ['tag'], noTags: false }, serverQuery: { keywordArray: ['text'] } }, true))
      .toEqual({ room_id: params.room_id, globalServerQuery: { tags: ['tag'], noTags: false }, serverQuery: { keywordArray: ['text'] } });
  });
  test.each([
    { floor_id: params.room_id }, { from: 'null' }, { from: ['2026-09-05'] },
    { from: '2026-02-30' }, { serverQuery: { noTags: 'true' } },
    { serverQuery: { arbitrary: true } }, { serverQuery: { keywordArray: [''] } },
  ])('不正な検索入力を拒否する: %j', (input) => {
    expect(() => mapListRequest(params, input, true)).toThrow();
  });
  test('通常一覧には条件object、詳細にはクエリを持ち込まない', () => {
    expect(() => mapListRequest(params, { serverQuery: {} })).toThrow();
    expect(() => mapDetailRequest(params, { from: '2026-09-05' })).toThrow();
    expect(mapDetailRequest(params, {})).toEqual({ room_id: params.room_id, post_id: params.post_id });
  });
});
