import { expect } from 'vitest';
import { buildFilterSummaryText, getFilterModeLabel, isSpecialFilterKey } from '@/features/timeline/filterSummary';

const t = (key) => key;
const getTranslatedTagName = (key) => ({ 'tag-1': 'タグ1', 'tag-2': 'タグ2' }[key] || key);

describe('タイムラインの絞り込み条件の要約', () => {
  it('isSpecialFilterKey は特別キーだけ true を返す', () => {
    expect(isSpecialFilterKey('notags')).to.equal(true);
    expect(isSpecialFilterKey('animation')).to.equal(true);
    expect(isSpecialFilterKey('fav')).to.equal(true);
    expect(isSpecialFilterKey('tag-1')).to.equal(false);
  });

  it('getFilterModeLabel は条件に応じて表示文言を返す', () => {
    expect(getFilterModeLabel(null, t)).to.equal('');
    expect(getFilterModeLabel({ filterMode: 'include' }, t)).to.equal('表示する');
    expect(getFilterModeLabel({ filterMode: 'exclude' }, t)).to.equal('表示しない');
  });

  it('buildFilterSummaryText は条件なしでタイムラインとローカルタグを連結する', () => {
    const text = buildFilterSummaryText({
      filter: { conditions: null },
      localTagIds: ['tag-1', 'tag-2'],
      getTranslatedTagName,
      t,
    });

    expect(text).to.equal('タイムライン #タグ1 #タグ2');
  });

  it('buildFilterSummaryText は条件ありで keyword/userName/displayOrder を連結する', () => {
    const text = buildFilterSummaryText({
      filter: {
        conditions: {
          filterMode: 'exclude',
          keyword: 'hello',
          userName: 'alice',
          displayOrder: [
            { key: 'notags', display: 'タグ無し' },
            { key: 'tag-1' },
            { key: null },
            { key: 'fav', display: '' },
          ],
        },
      },
      getTranslatedTagName,
      t,
    });

    expect(text).to.equal('表示しない hello alice タグ無し #タグ1 お気に入り');
  });
});
