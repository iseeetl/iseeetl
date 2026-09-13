import { expect } from 'vitest';
import {
  MAX_QUERY_COLUMNS,
  MAX_QUERY_TAGS,
  createEmptyTimelineQueryState,
  getEffectiveShowRange,
  getTimelineFilterQuerySignature,
  matchesConditionGroups,
  parseTimelineQueryFilters,
  matchesPostConditionGroups,
  splitFilterKeyword,
} from '@/features/timeline/queryFilters';
import TimelineUtil from '@/features/timeline/timelineUtil';

describe('URLによるタイムラインの絞り込み', () => {
  const roomTags = [
    { _id: 'tag-1', name: 'Analysis', translations: [{ name: '画像解析' }] },
    { _id: 'tag-2', name: 'Speech', translations: [{ name: '文字起こし' }] },
  ];

  it('空のクエリはURL条件指定モードにしない', () => {
    expect(parseTimelineQueryFilters()).to.deep.equal(createEmptyTimelineQueryState());
  });

  it('表示専用クエリを除外して絞り込みクエリだけを比較する', () => {
    const left = getTimelineFilterQuerySignature({ reply: 'no', col2_keyword: 'b', keyword: 'a' });
    const right = getTimelineFilterQuerySignature({ keyword: 'a', col2_keyword: 'b', armode: 'on' });
    const changed = getTimelineFilterQuerySignature({ keyword: 'a', col2_keyword: 'c' });

    expect(left).to.equal(right);
    expect(changed).not.to.equal(right);
  });

  it('引用符で囲んだキーワードを1条件として分割する', () => {
    expect(splitFilterKeyword('important "needs review"')).to.deep.equal(['important', 'needs review']);
  });

  it('グローバル条件と番号順のカラム個別条件を生成する', () => {
    const result = parseTimelineQueryFilters({
      query: {
        tag: '画像解析',
        tagOperator: 'and',
        col3_userName: '山田',
        col1_tag: '画像解析, 文字起こし',
        col1_tagOperator: 'and',
        col1_showRange: 'target',
      },
      roomTags,
    });

    expect(result.active).to.equal(true);
    expect(result.hasColumnQueries).to.equal(true);
    expect(result.globalConditions.tags).to.deep.equal(['tag-1']);
    expect(result.globalConditions.displayOrder).to.deep.equal([{ key: 'tag-1' }]);
    expect(result.globalConditions.tagSearchOperator).to.equal('and');
    expect(result.filters.map((filter) => filter.queryColumnNumber)).to.deep.equal([1, 3]);
    expect(result.filters[0].conditions.tags).to.deep.equal(['tag-1', 'tag-2']);
    expect(result.filters[0].conditions.showRange).to.equal('target');
    expect(result.filters[1].conditions.userName).to.equal('山田');
    expect(result.filters.every((filter) => filter.webPush === false && filter.pushFilterId === null)).to.equal(true);
  });

  it('カラム番号なしのshowRangeだけでも全体表示設定として保持する', () => {
    const result = parseTimelineQueryFilters({
      query: { showRange: 'target' },
      roomTags,
    });

    expect(result.active).to.equal(true);
    expect(result.globalConditions).to.equal(null);
    expect(result.globalShowRange).to.equal('target');
    expect(result.hasColumnQueries).to.equal(false);
  });

  it('実条件がないカラムと範囲外カラムを生成しない', () => {
    const query = {
      col1_showRange: 'target',
      col2_tag: '存在しないタグ',
      col0_keyword: 'ignored',
    };
    query[`col${MAX_QUERY_COLUMNS + 1}_keyword`] = 'ignored';

    const result = parseTimelineQueryFilters({ query, roomTags });

    expect(result.hasColumnQueries).to.equal(true);
    expect(result.filters).to.deep.equal([]);
    expect(result.warnings).to.include('empty_condition');
    expect(result.warnings).to.include('unknown_tag');
    expect(result.warnings).to.include('column_out_of_range');
    expect(result.warnings).to.include('no_valid_columns');
  });

  it('タグ条件は最大件数まで適用して上限超過を警告する', () => {
    const manyRoomTags = Array.from({ length: MAX_QUERY_TAGS + 1 }, (_, index) => ({
      _id: `tag-${index}`,
      name: `Tag${index}`,
      translations: [],
    }));
    const result = parseTimelineQueryFilters({
      query: {
        col1_tag: manyRoomTags.map((tag) => tag.name).join(','),
      },
      roomTags: manyRoomTags,
    });

    expect(result.filters[0].conditions.tags).to.have.lengthOf(MAX_QUERY_TAGS);
    expect(result.warnings).to.include('invalid_value');
  });

  it('重複クエリ値と不正値を安全な既定値へ戻す', () => {
    const result = parseTimelineQueryFilters({
      query: {
        col1_keyword: ['one', 'two'],
        col1_animation: 'yes',
        col1_noTags: 'true',
        col1_filterMode: 'unknown',
      },
      roomTags,
    });

    expect(result.filters).to.have.lengthOf(1);
    expect(result.filters[0].conditions.noTags).to.equal(true);
    expect(result.filters[0].conditions.displayOrder).to.deep.equal([{ key: 'notags' }]);
    expect(result.filters[0].conditions.animation).to.equal(false);
    expect(result.filters[0].conditions.filterMode).to.equal('include');
    expect(result.warnings).to.include('invalid_value');
  });

  it('グローバルshowRangeをカラム個別値より優先する', () => {
    expect(getEffectiveShowRange('target', { showRange: 'all' })).to.equal('target');
    expect(getEffectiveShowRange(null, { showRange: 'target' })).to.equal('target');
    expect(getEffectiveShowRange(null, null)).to.equal('all');
  });

  it('グローバル条件とカラム個別条件をAND評価する', () => {
    const calls = [];
    const matcher = (target, conditions) => {
      calls.push(conditions.id);
      return target.matches.includes(conditions.id);
    };

    expect(
      matchesConditionGroups({
        target: { matches: ['global', 'column'] },
        globalConditions: { id: 'global' },
        columnConditions: { id: 'column' },
        matcher,
      })
    ).to.equal(true);

    expect(
      matchesConditionGroups({
        target: { matches: ['global'] },
        globalConditions: { id: 'global' },
        columnConditions: { id: 'column' },
        matcher,
      })
    ).to.equal(false);
    expect(calls).to.include.members(['global', 'column']);
  });

  it('投稿ツリー内の別要素でグローバル条件とカラム条件を満たせる', () => {
    const matcher = (target, conditions) => target.matches?.includes(conditions.id) || false;
    const post = {
      matches: ['global'],
      replies: [{ matches: ['column'], supplementaries: [] }],
      supplementaries: [],
    };

    expect(
      matchesPostConditionGroups({
        post,
        globalConditions: { id: 'global', filterMode: 'include' },
        columnConditions: { id: 'column', filterMode: 'include' },
        matcher,
      })
    ).to.equal(true);
  });

  it('exclude条件は投稿ツリー内に一致要素があれば除外する', () => {
    const matcher = (target, conditions) => target.matches?.includes(conditions.id) || false;
    const post = {
      matches: [],
      replies: [],
      supplementaries: [{ matches: ['blocked'] }],
    };

    expect(
      matchesPostConditionGroups({
        post,
        columnConditions: { id: 'blocked', filterMode: 'exclude' },
        matcher,
      })
    ).to.equal(false);
    expect(
      matchesPostConditionGroups({
        post,
        columnConditions: { id: 'allowed', filterMode: 'exclude' },
        matcher,
      })
    ).to.equal(true);
  });

  it('同じ条件グループのANDキーワードとタグを投稿内の別要素で満たせる', () => {
    const post = {
      content: 'first',
      room_tags: [],
      replies: [
        {
          content: 'second',
          room_tags: ['tag-1'],
          supplementaries: [],
        },
      ],
      supplementaries: [],
    };

    expect(
      matchesPostConditionGroups({
        post,
        columnConditions: {
          filterMode: 'include',
          keywordArray: ['first', 'second'],
          logicalOperator: 'and',
          tags: ['tag-1'],
          tagSearchOperator: 'or',
        },
        matcher: (target, conditions) => TimelineUtil.doesDataMatchConditions(target, conditions),
      })
    ).to.equal(true);
  });
});
