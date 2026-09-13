jest.mock('../../../../../services/timeline/management/context', () => ({ ensureRoomBelongsToFloor: jest.fn() }));
jest.mock('../../../../../services/timeline/management/query.service', () => ({ timelineQuery: jest.fn() }));
const { timelineQuery } = require('../../../../../services/timeline/management/query.service');
const { ensureRoomBelongsToFloor } = require('../../../../../services/timeline/management/context');
const { estimate } = require('../../../../../services/timeline/management/estimate.service');
const body = { floor_id: 'floor', room_id: 'room', type: 'json' };
beforeEach(() => jest.resetAllMocks());
test.each([[], [{ content: '日本語' }], [{ content: 'one' }, { content: 'two' }]].map((items) => [items]))('全件を保持せず整形済みJSONのサイズを計数する', async (items) => {
  const cursor = { close: jest.fn(), async *[Symbol.asyncIterator]() { yield* items; } };
  timelineQuery.mockReturnValue({ cursor: () => cursor });
  const result = await estimate(body);
  expect(result.estimatedBytes).toBe(Buffer.byteLength(JSON.stringify(items, null, '  ')));
  expect(result.itemCount).toBe(items.length);
  expect(cursor.close).toHaveBeenCalledTimes(1);
});
test('cursor失敗時にも後処理する', async () => {
  const cursor = { close: jest.fn(), async *[Symbol.asyncIterator]() { yield {}; throw new Error('read failed'); } };
  timelineQuery.mockReturnValue({ cursor: () => cursor });
  await expect(estimate(body)).rejects.toThrow('read failed');
  expect(cursor.close).toHaveBeenCalledTimes(1);
});
test('所属不一致は集計前に拒否する', async () => {
  ensureRoomBelongsToFloor.mockRejectedValue(new Error('wrong room'));
  await expect(estimate(body)).rejects.toThrow('wrong room');
  expect(timelineQuery).not.toHaveBeenCalled();
});
