const {
  buildPaginationLabels,
  buildPaginationOptions,
  withOptionalDeleteFlag,
} = require('../../../../services/_shared/paginationHelpers');

describe('ページ単位の一覧の共通処理', () => {
  test('ページ単位の一覧に必要なラベルを返す', () => {
    expect(buildPaginationLabels()).toEqual({
      totalDocs: 'total',
      totalPages: 'pages',
      docs: 'docs',
      page: 'page',
      nextPage: 'nextPage',
      prevPage: 'prevPage',
      pagingCounter: 'pagingCounter',
      hasPrevPage: 'hasPrevPage',
      hasNextPage: 'hasNextPage',
      meta: null,
    });
  });

  test('ページ単位の一覧取得に既定値を適用する', () => {
    const options = buildPaginationOptions({ page: 1, sort: { created_at: -1 } });

    expect(options).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 10,
        sort: { created_at: -1 },
        customLabels: buildPaginationLabels(),
      })
    );
    expect(options.populate).toBeUndefined();
    expect(options.lean).toBeUndefined();
  });

  test('指定された場合はpopulateとleanを一覧取得の設定へ含める', () => {
    const options = buildPaginationOptions({
      page: 2,
      sort: { name: 1 },
      limit: 5,
      populate: 'owner',
      lean: true,
    });

    expect(options).toEqual(
      expect.objectContaining({
        page: 2,
        limit: 5,
        sort: { name: 1 },
        populate: 'owner',
        lean: true,
        customLabels: buildPaginationLabels(),
      })
    );
  });

  test.each([true, false])('delete_flg=%sを検索条件へ追加する', (deleteFlg) => {
    expect(withOptionalDeleteFlag({ name: 'tag' }, deleteFlg)).toEqual({
      name: 'tag',
      delete_flg: deleteFlg,
    });
  });

  test('削除状態の指定がなければ検索条件を変更しない', () => {
    const query = { name: 'tag' };
    expect(withOptionalDeleteFlag(query)).toBe(query);
  });
});
