import { expect } from 'vitest';
import {
  DELETE_FILTER_ACTIVE,
  DELETE_FILTER_ALL,
  DELETE_FILTER_DELETED,
  normalizeDeleteFilter,
  withDeleteFilter,
} from '@/features/management/lifecycle';

describe('管理対象の状態による検索条件', () => {
  it.each([
    [DELETE_FILTER_ACTIVE, false],
    [DELETE_FILTER_DELETED, true],
  ])('%s 絞り込み条件をdelete_flgへ変換する', (filter, expected) => {
    expect(withDeleteFilter({ page: 2, search: 'term' }, filter)).toEqual({
      page: 2,
      search: 'term',
      delete_flg: expected,
    });
  });

  it('all 絞り込み条件ではdelete_flgを送らない', () => {
    expect(withDeleteFilter({ page: 1 }, DELETE_FILTER_ALL)).toEqual({ page: 1 });
  });

  it('不正な絞り込み条件をallへ正規化する', () => {
    expect(normalizeDeleteFilter('unknown')).toBe(DELETE_FILTER_ALL);
  });
});
