const matchConditions = require('../../../../../services/timeline/shared/matchConditions');

describe('matchConditionsの検証', () => {
  const baseData = {
    room_tags: ['t1', 't2'],
    content: 'hello world',
    username: 'alice',
    animation: '',
  };

  const baseCond = {
    filterMode: 'include',
    keywordArray: [],
    logicalOperator: 'and',
    userName: '',
    tags: [],
    tagSearchOperator: 'and',
    noTags: false,
    animation: false,
  };

  test('条件が空の場合は常に true', () => {
    expect(matchConditions(baseData, { ...baseCond })).toBe(true);
  });

  describe('絞り込み方式', () => {
    test('filterMode=exclude では一致条件は false になる', () => {
      const cond = { ...baseCond, filterMode: 'exclude', userName: 'alice' };
      expect(matchConditions(baseData, cond)).toBe(false);
    });

    test('filterMode=exclude では不一致条件は true になる', () => {
      const cond = { ...baseCond, filterMode: 'exclude', userName: 'bob' };
      expect(matchConditions(baseData, cond)).toBe(true);
    });
  });

  describe('検索キーワード', () => {
    test('logicalOperator=and ですべて含む場合に true', () => {
      const cond = { ...baseCond, keywordArray: ['hello', 'world'], logicalOperator: 'and' };
      expect(matchConditions(baseData, cond)).toBe(true);
    });

    test('logicalOperator=and で一部欠けると false', () => {
      const cond = { ...baseCond, keywordArray: ['hello', 'missing'], logicalOperator: 'and' };
      expect(matchConditions(baseData, cond)).toBe(false);
    });

    test('logicalOperator=or でどれか含む場合に true', () => {
      const cond = { ...baseCond, keywordArray: ['missing', 'hello'], logicalOperator: 'or' };
      expect(matchConditions(baseData, cond)).toBe(true);
    });

    test('logicalOperator=or でどれも含まないと false', () => {
      const cond = { ...baseCond, keywordArray: ['foo', 'bar'], logicalOperator: 'or' };
      expect(matchConditions(baseData, cond)).toBe(false);
    });
  });

  describe('ユーザ名', () => {
    test('userName が一致すれば true', () => {
      const cond = { ...baseCond, userName: 'alice' };
      expect(matchConditions(baseData, cond)).toBe(true);
    });

    test('userName が不一致なら false', () => {
      const cond = { ...baseCond, userName: 'bob' };
      expect(matchConditions(baseData, cond)).toBe(false);
    });
  });

  describe('タグとタグなし条件', () => {
    test('tagSearchOperator=and で全タグ含むと true', () => {
      const cond = { ...baseCond, tags: ['t1', 't2'], tagSearchOperator: 'and' };
      expect(matchConditions(baseData, cond)).toBe(true);
    });

    test('tagSearchOperator=and で一部欠けると false', () => {
      const cond = { ...baseCond, tags: ['t1', 't3'], tagSearchOperator: 'and' };
      expect(matchConditions(baseData, cond)).toBe(false);
    });

    test('tagSearchOperator=or でいずれか含むと true', () => {
      const cond = { ...baseCond, tags: ['t3', 't2'], tagSearchOperator: 'or' };
      expect(matchConditions(baseData, cond)).toBe(true);
    });

    test('tagSearchOperator=or でどれも含まないと false', () => {
      const cond = { ...baseCond, tags: ['x', 'y'], tagSearchOperator: 'or' };
      expect(matchConditions(baseData, cond)).toBe(false);
    });

    test('noTags=true でタグなしデータは true', () => {
      const data = { ...baseData, room_tags: [] };
      const cond = { ...baseCond, noTags: true };
      expect(matchConditions(data, cond)).toBe(true);
    });

    test('noTags=true でタグがあると false', () => {
      const cond = { ...baseCond, noTags: true };
      expect(matchConditions(baseData, cond)).toBe(false);
    });
  });

  describe('アニメーション', () => {
    test('animation=true で data.animation が truthy なら true', () => {
      const data = { ...baseData, animation: 'scroll' };
      const cond = { ...baseCond, animation: true };
      expect(matchConditions(data, cond)).toBe(true);
    });

    test('animation=true で data.animation が falsy なら false', () => {
      const cond = { ...baseCond, animation: true };
      expect(matchConditions(baseData, cond)).toBe(false);
    });
  });

  test('すべての条件を満たす場合のみ true', () => {
    const data = {
      room_tags: ['red', 'blue'],
      content: 'foo bar baz',
      username: 'eve',
      animation: 'fling',
    };
    const cond = {
      keywordArray: ['foo', 'bar'],
      logicalOperator: 'and',
      userName: 'eve',
      tags: ['red'],
      tagSearchOperator: 'or',
      noTags: false,
      animation: true,
    };
    expect(matchConditions(data, cond)).toBe(true);
  });

  test('複数条件のうち 1 つでも外れると false', () => {
    const data = {
      room_tags: ['red'],
      content: 'foo bar baz',
      username: 'eve',
      animation: 'fling',
    };
    const cond = {
      keywordArray: ['foo', 'bar', 'missing'],
      logicalOperator: 'and',
      userName: 'eve',
      tags: ['red'],
      tagSearchOperator: 'and',
      noTags: false,
      animation: true,
    };
    expect(matchConditions(data, cond)).toBe(false);
  });
});
