import { describe, it, expect } from 'vitest';
import { initialPostTags, parseColumnOptions, initialColumnIndex, columnOptionsSignature } from '@/features/timeline/postDefaults';
import { getPresetTagIdsFromFilter } from '@/features/timeline/filters';
const tags = [{ _id: 'guide' }, { _id: 'question' }];
describe('Column entry and tag defaults', () => {
  it('empty overrides both column and previous defaults', () => {
    expect(initialPostTags({ mode: 'empty', column: ['guide'], previous: ['question'], tags })).toEqual({ tags: [], source: 'clear' });
  });
  it.each([['guide', 'tab'], ['question', 'previous']])('auto resolves its actual source: %s', (id, source) => {
    expect(initialPostTags({ column: id === 'guide' ? ['guide'] : [], previous: ['question'], tags })).toEqual({ tags: [id], source });
  });
  it.each([[[]], [['question']]])('continuation preserves confirmed tags even with empty defaults: %j', ids => {
    expect(initialPostTags({ mode: 'empty', column: ['guide'], previous: ['guide'], continuation: { tags: ids, source: null }, tags })).toEqual({ tags: ids, source: null });
  });
  it('removed tags cannot retain misleading source highlights', () => {
    expect(initialPostTags({ continuation: { tags: ['question', 'gone'], source: 'paste' }, tags })).toEqual({ tags: ['question'], source: null });
  });
  it('strict invalid and duplicate options fall back with warnings', () => {
    const result = parseColumnOptions({ initialTab: ['col1', 'first'], col1_postTagMode: 'EMPTY', col2_postTagMode: 'empty', col11_postTagMode: 'auto' });
    expect(result.initialTab).toBe('first'); expect(result.modes).toEqual({ 1: 'auto', 2: 'empty' }); expect(result.warnings).toHaveLength(3);
  });
  it('entry column number is an identity rather than a position', () => {
    const filters = [{ conditions: null }, { queryColumnNumber: 7, posts: [] }, { queryColumnNumber: 2 }];
    expect(initialColumnIndex(filters, 'col2')).toBe(2); expect(initialColumnIndex(filters, 'col7')).toBe(1);
    expect(initialColumnIndex(filters, 'col3')).toBe(-1); expect(initialColumnIndex(filters, 'col2', true)).toBe(0);
  });
  it('presentation options do not include search or locale keys', () => {
    expect(columnOptionsSignature({ col1_tag: 'a', lang: 'ja', initialTab: 'col1' })).toBe(columnOptionsSignature({ col1_tag: 'b', lang: 'en', initialTab: 'col1' }));
  });
  it('explicit This tab supports exclusion while old automatic exclusion defaults stay empty', () => {
    const filter = { conditions: { filterMode: 'exclude', displayOrder: [{ key: 'guide' }, { key: 'notags' }] } };
    expect(getPresetTagIdsFromFilter(filter)).toEqual([]);
    expect(getPresetTagIdsFromFilter(filter, { includeExcluded: true })).toEqual(['guide']);
  });
});
