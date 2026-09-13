jest.mock('../../../../../models/User', () => ({ find: jest.fn() }));

const User = require('../../../../../models/User');
const {
  applyGlobalServerQueryFilters,
  applyServerQueryFilters,
  normalizeGlobalServerQuery,
  normalizeServerQuery,
} = require('../../../../../services/timeline/shared/serverQuery');

describe('serverQueryの検証', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('normalizeServerQuery: snake_case を正規化する', () => {
    const res = normalizeServerQuery({
      server_query: {
        filter_mode: 'exclude',
        logical_operator: 'and',
        keyword_array: ['a', 'b'],
        user_name: 'Alice',
        tag_search_operator: 'and',
        no_tags: true,
        animation: true,
      },
    });

    expect(res).toEqual(
      expect.objectContaining({
        filterMode: 'exclude',
        logicalOperator: 'and',
        keywordArray: ['a', 'b'],
        userName: 'Alice',
        tagSearchOperator: 'and',
        noTags: true,
        animation: true,
      })
    );
  });

  test('normalizeServerQuery: 文字列booleanを値どおりに正規化する', () => {
    expect(
      normalizeServerQuery({
        server_query: {
          no_tags: 'false',
          animation: 'false',
        },
      })
    ).toEqual(expect.objectContaining({ noTags: false, animation: false }));

    expect(
      normalizeServerQuery({
        server_query: {
          no_tags: 'true',
          animation: 'true',
        },
      })
    ).toEqual(expect.objectContaining({ noTags: true, animation: true }));
  });

  test('applyServerQueryFilters: keyword と userName を条件に追加', async () => {
    const lean = jest.fn().mockResolvedValue([{ _id: 'u1' }]);
    const select = jest.fn().mockReturnValue({ lean });
    User.find.mockReturnValue({ select });
    const andCond = [];

    const res = await applyServerQueryFilters(
      { server_query: { keyword: 'hello', user_name: 'Alice' } },
      andCond
    );

    expect(res.userName).toBe('Alice');
    expect(andCond.length).toBeGreaterThan(0);
    expect(User.find).toHaveBeenCalledWith({ username: 'Alice', delete_flg: false });
  });

  test('applyServerQueryFilters: exclude モードで $nor になる', async () => {
    const andCond = [];
    await applyServerQueryFilters(
      { server_query: { keyword_array: ['x'], filterMode: 'exclude' } },
      andCond
    );

    const hasNor = andCond.some((cond) => Array.isArray(cond.$nor));
    expect(hasNor).toBe(true);
  });

  test('normalizeGlobalServerQuery: camelCase のグローバル条件を正規化する', () => {
    expect(
      normalizeGlobalServerQuery({
        globalServerQuery: { keywordArray: ['global'], tagSearchOperator: 'and' },
      })
    ).toEqual(expect.objectContaining({ keywordArray: ['global'], tagSearchOperator: 'and' }));
  });

  test('グローバル条件とカラム条件を別のAND条件として追加する', async () => {
    const andCond = [];
    const body = {
      globalServerQuery: { keywordArray: ['global'] },
      serverQuery: { keywordArray: ['column'] },
    };

    await applyGlobalServerQueryFilters(body, andCond);
    await applyServerQueryFilters(body, andCond);

    expect(andCond).toHaveLength(2);
    expect(andCond.every((condition) => Array.isArray(condition.$and))).toBe(true);
  });
});
