const { buildReq, runValidators } = require('./_helpers');
const { MAX_QUERY_ARRAY_ITEMS, validateServerQuery } = require('../../../validates/serverQuery.validate');

describe('検索条件の入力検証', () => {
  test('有効な検索条件を受け付ける', async () => {
    const req = buildReq({
      body: {
        server_query: {
          filterMode: 'include',
          logicalOperator: 'or',
          keywordArray: [],
          keyword: 'hello',
          userName: 'user',
          tags: [],
          tagSearchOperator: 'and',
          noTags: false,
          animation: true,
        },
      },
    });
    const result = await runValidators(validateServerQuery(), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('不正な絞り込み方式を拒否する', async () => {
    const req = buildReq({
      body: {
        server_query: {
          filterMode: 'bad',
        },
      },
    });
    const result = await runValidators(validateServerQuery(), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('camelCaseの両条件とnullを受け付ける', async () => {
    const req = buildReq({
      body: {
        globalServerQuery: { tags: ['tag-1'], tagSearchOperator: 'or' },
        serverQuery: null,
      },
    });

    const result = await runValidators(validateServerQuery(), req);
    expect(result.isEmpty()).toBe(true);
  });

  test('globalServerQueryの不正値を拒否する', async () => {
    const req = buildReq({
      body: {
        globalServerQuery: {
          logicalOperator: 'invalid',
          keywordArray: [123],
        },
      },
    });

    const result = await runValidators(validateServerQuery(), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('global_server_queryのsnake_case条件を検証する', async () => {
    const validReq = buildReq({
      body: {
        global_server_query: {
          filter_mode: 'exclude',
          logical_operator: 'and',
          keyword_array: ['keyword'],
          user_name: 'user',
          tag_search_operator: 'or',
          no_tags: false,
        },
      },
    });
    const invalidReq = buildReq({
      body: {
        global_server_query: {
          filter_mode: 'invalid',
          keyword_array: [123],
        },
      },
    });

    expect((await runValidators(validateServerQuery(), validReq)).isEmpty()).toBe(true);
    expect((await runValidators(validateServerQuery(), invalidReq)).isEmpty()).toBe(false);
  });

  test('keywordArrayとtagsの上限超過および空要素を拒否する', async () => {
    const req = buildReq({
      body: {
        globalServerQuery: {
          keywordArray: Array.from({ length: MAX_QUERY_ARRAY_ITEMS + 1 }, (_, index) => `keyword-${index}`),
          tags: [''],
        },
        serverQuery: {
          tags: Array.from({ length: MAX_QUERY_ARRAY_ITEMS + 1 }, (_, index) => `tag-${index}`),
          keywordArray: [''],
        },
      },
    });

    const result = await runValidators(validateServerQuery(), req);
    expect(result.isEmpty()).toBe(false);
  });

  test('keywordArrayとtagsのnull要素を拒否する', async () => {
    const req = buildReq({
      body: {
        globalServerQuery: { keywordArray: [null] },
        serverQuery: { tags: [null] },
      },
    });

    const result = await runValidators(validateServerQuery(), req);
    expect(result.isEmpty()).toBe(false);
  });
});
