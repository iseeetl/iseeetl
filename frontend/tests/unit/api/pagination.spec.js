import { expect } from 'vitest';
import { buildPaginateParams } from '@/api/pagination';

describe('一覧取得の検索条件', () => {
  it('search を含むデータは search を送る', () => {
    const result = buildPaginateParams({ page: 2, search: 'word' });
    expect(result).to.deep.equal({ page: 2, search: 'word' });
  });

  it('search が null の場合は空文字に正規化する', () => {
    const result = buildPaginateParams({ page: 1, search: null });
    expect(result).to.deep.equal({ page: 1, search: '' });
  });

  it('search が無い場合は含めない', () => {
    const result = buildPaginateParams({ page: 3 });
    expect(result).to.deep.equal({ page: 3 });
  });

  it.each([true, false])('delete_flg=%s を明示した場合は検索条件へ含める', (deleteFlg) => {
    const result = buildPaginateParams({ page: 1, delete_flg: deleteFlg });
    expect(result).to.deep.equal({ page: 1, delete_flg: deleteFlg });
  });

  it('delete_flg が未指定の場合は検索条件へ含めない', () => {
    const result = buildPaginateParams({ page: 1 });
    expect(result).not.to.have.property('delete_flg');
  });
});
