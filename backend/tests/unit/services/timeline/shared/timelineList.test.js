jest.mock('../../../../../models/Chat', () => ({ find: jest.fn() }));
jest.mock('../../../../../services/timeline/shared/timelineSerializer', () => jest.fn((v) => v));
jest.mock('../../../../../services/timeline/shared/serverQuery', () => ({
  applyGlobalServerQueryFilters: jest.fn(),
  applyServerQueryFilters: jest.fn(),
}));

const Chat = require('../../../../../models/Chat');
const serializeTimeline = require('../../../../../services/timeline/shared/timelineSerializer');
const {
  applyGlobalServerQueryFilters,
  applyServerQueryFilters,
} = require('../../../../../services/timeline/shared/serverQuery');
const {
  buildTimelineListConditions,
  listTimelineChats,
} = require('../../../../../services/timeline/shared/timelineList');

const buildFindChain = (data) => {
  const chain = {
    populate: jest.fn(() => chain),
    sort: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    lean: jest.fn(() => chain),
    exec: jest.fn().mockResolvedValue(data),
  };
  return chain;
};

describe('timelineListの検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('buildTimelineListConditions: from/to で limit が変わる', () => {
    const base = { floor_id: 'f1', room_id: 'r1' };
    const withFrom = buildTimelineListConditions({ ...base, from: '2024-01-01T00:00:00Z' });
    const withTo = buildTimelineListConditions({ ...base, to: '2024-01-01T00:00:00Z' });

    expect(withFrom.limit).toBe(10);
    expect(withTo.limit).toBe(200);
    expect(withFrom.andCond).toEqual(
      expect.arrayContaining([{ floor: 'f1' }, { room: 'r1' }, { delete_flg: false }])
    );
  });

  test('listTimelineChats: クエリを組み立てて返却', async () => {
    const chain = buildFindChain([{ _id: 'c1' }, { _id: 'c2' }]);
    Chat.find.mockReturnValue(chain);

    const res = await listTimelineChats({
      body: { floor_id: 'f1', room_id: 'r1' },
      populate: [{ path: 'user' }],
    });

    expect(applyServerQueryFilters).toHaveBeenCalled();
    expect(applyGlobalServerQueryFilters).toHaveBeenCalled();
    expect(Chat.find).toHaveBeenCalledWith(
      expect.objectContaining({ $and: expect.arrayContaining([{ floor: 'f1' }, { room: 'r1' }]) })
    );
    expect(serializeTimeline).toHaveBeenCalledTimes(2);
    expect(res).toHaveLength(2);
  });
});
