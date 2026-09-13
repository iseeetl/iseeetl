import { expect } from 'vitest';
import TimelineUtil from '@/features/timeline/timelineUtil';
import { matchesPostConditionGroups } from '@/features/timeline/queryFilters';
import {
  ensurePostsArray,
  getDefaultIndex,
  getLatestReplyablePost,
  getConditionlessIndexes,
  getPresetTagIdsFromFilter,
  insertNewToFiltersHead,
  normalizeFiltersFromStore,
  prepareFiltersForSession,
  reconcilePostInFilters,
  removeFromFilters,
  sanitizeFiltersForStore,
  updateExistingInFilters,
} from '@/features/timeline/filters';

describe('タイムラインの絞り込み処理', () => {
  it('getDefaultIndex は conditions が null の位置を返す', () => {
    const filters = [{ conditions: { displayOrder: [] } }, { conditions: null }, { conditions: {} }];
    expect(getDefaultIndex(filters)).to.equal(1);
  });

  it('getLatestReplyablePost はデフォルト列を優先する', () => {
    const okPost = { _id: 'p1', animation: null };
    const filters = [
      { conditions: null, posts: [{ _id: 'n1', replyNotification: true }, okPost] },
      { conditions: { displayOrder: [] }, posts: [{ _id: 'p2', animation: null }] },
    ];
    const found = getLatestReplyablePost({ filters, currentTabIndex: 1 });
    expect(found).to.equal(okPost);
  });

  it('getLatestReplyablePost はデフォルト列がない場合に現在タブを参照する', () => {
    const okPost = { _id: 'p2', animation: null };
    const filters = [
      { conditions: { displayOrder: [] }, posts: [{ _id: 'p1', replyNotification: true }] },
      { conditions: { displayOrder: [] }, posts: [okPost] },
    ];
    const found = getLatestReplyablePost({ filters, currentTabIndex: 1 });
    expect(found).to.equal(okPost);
  });

  it('getPresetTagIdsFromFilter は投稿へ付与できるタグIDだけを返す', () => {
    const filter = {
      conditions: {
        filterMode: 'include',
        displayOrder: [{ key: 'tag1' }, { key: 'notags' }, { key: 'animation' }, { key: 'fav' }, { key: 'tag2' }],
      },
    };

    expect(getPresetTagIdsFromFilter(filter)).to.deep.equal(['tag1', 'tag2']);
  });

  it('getPresetTagIdsFromFilter は除外フィルタなら空配列を返す', () => {
    const filter = {
      conditions: {
        filterMode: 'exclude',
        displayOrder: [{ key: 'tag1' }],
      },
    };

    expect(getPresetTagIdsFromFilter(filter)).to.deep.equal([]);
  });

  it('getPresetTagIdsFromFilter は条件または表示順がなければ空配列を返す', () => {
    expect(getPresetTagIdsFromFilter()).to.deep.equal([]);
    expect(getPresetTagIdsFromFilter({ conditions: null })).to.deep.equal([]);
    expect(getPresetTagIdsFromFilter({ conditions: {} })).to.deep.equal([]);
  });

  it('ensurePostsArray は posts を初期化する', () => {
    const filters = [{ conditions: null }];
    ensurePostsArray({
      filters,
      index: 0,
    });
    expect(filters[0].posts).to.deep.equal([]);
  });

  it('insertNewToFiltersHead は条件に合う列に追加する', () => {
    const filters = [
      { conditions: null, posts: [] },
      { conditions: { displayOrder: [] }, posts: [] },
    ];
    const post = { _id: 'p3' };
    insertNewToFiltersHead({
      filters,
      post,
      matchesAny: (_, conditions) => conditions === null,
      ensurePostsArray: (i) => ensurePostsArray({ filters, index: i }),
    });

    expect(filters[0].posts[0]).to.equal(post);
    expect(filters[1].posts).to.have.length(0);
  });

  it('insertNewToFiltersHead は既存投稿を更新する', () => {
    const filters = [{ conditions: null, posts: [{ _id: 'p4', v: 1 }] }];
    const post = { _id: 'p4', v: 2 };

    insertNewToFiltersHead({
      filters,
      post,
      matchesAny: () => true,
      ensurePostsArray: () => {},
    });

    expect(filters[0].posts[0]).to.deep.equal(post);
  });

  it('insertNewToFiltersHead は一致しない場合に追加しない', () => {
    const filters = [
      { conditions: { displayOrder: [] }, posts: [] },
      { conditions: { displayOrder: [] }, posts: [] },
    ];
    const post = { _id: 'p5' };

    insertNewToFiltersHead({
      filters,
      post,
      matchesAny: () => false,
      ensurePostsArray: () => {},
    });

    expect(filters[0].posts).to.have.length(0);
    expect(filters[1].posts).to.have.length(0);
  });

  it('updateExistingInFilters は一致しない列から削除する', () => {
    const post = { _id: 'p4', v: 2 };
    const filters = [
      { conditions: null, posts: [{ _id: 'p4', v: 1 }] },
      { conditions: { displayOrder: [] }, posts: [{ _id: 'p4', v: 1 }] },
    ];

    updateExistingInFilters({
      filters,
      post,
      matchesAny: (_, conditions) => conditions === null,
    });

    expect(filters[0].posts[0]).to.deep.equal(post);
    expect(filters[1].posts).to.have.length(0);
  });

  it('reconcilePostInFilters は返信タグで新しく一致した列へ親投稿を追加する', () => {
    const originalPost = { _id: 'p4', replies: [] };
    const filters = [
      { conditions: null, posts: [originalPost] },
      { conditions: { tags: ['tag-a'] }, posts: [] },
      { conditions: { tags: ['tag-b'] }, posts: [] },
    ];
    const post = {
      _id: 'p4',
      replies: [{ _id: 'r1', room_tags: ['tag-a'] }],
    };
    const matchesAny = (target, conditions) =>
      matchesPostConditionGroups({
        post: target,
        columnConditions: conditions,
        matcher: (item, targetConditions) => TimelineUtil.doesDataMatchConditions(item, targetConditions),
      });

    reconcilePostInFilters({
      filters,
      post,
      matchesAny,
      ensurePostsArray: (i) => ensurePostsArray({ filters, index: i }),
    });

    expect(filters[0].posts).to.deep.equal([post]);
    expect(filters[1].posts).to.deep.equal([post]);
    expect(filters[2].posts).to.deep.equal([]);
  });

  it('reconcilePostInFilters は既存投稿を重複させず条件から外れた列から削除する', () => {
    const filters = [{ conditions: { tags: ['tag-a'] }, posts: [] }];
    const matchesAny = (target, conditions) =>
      target.replies.some((reply) => conditions.tags.some((tagId) => reply.room_tags.includes(tagId)));
    const matchingPost = {
      _id: 'p4',
      version: 1,
      replies: [{ _id: 'r1', room_tags: ['tag-a'] }],
    };
    const updatedPost = { ...matchingPost, version: 2 };

    reconcilePostInFilters({ filters, post: matchingPost, matchesAny });
    reconcilePostInFilters({ filters, post: updatedPost, matchesAny });

    expect(filters[0].posts).to.deep.equal([updatedPost]);

    reconcilePostInFilters({
      filters,
      post: { ...updatedPost, replies: [{ _id: 'r1', room_tags: [] }] },
      matchesAny,
    });

    expect(filters[0].posts).to.deep.equal([]);
  });

  it('reconcilePostInFilters は除外条件で一致状態が反転した場合も所属を更新する', () => {
    const filters = [{ conditions: { filterMode: 'exclude', tags: ['tag-a'] }, posts: [] }];
    const matchesAny = (target, conditions) => {
      const hasExcludedTag = target.replies.some((reply) =>
        conditions.tags.some((tagId) => reply.room_tags.includes(tagId))
      );
      return !hasExcludedTag;
    };
    const withoutExcludedTag = { _id: 'p4', replies: [{ _id: 'r1', room_tags: [] }] };
    const withExcludedTag = { _id: 'p4', replies: [{ _id: 'r1', room_tags: ['tag-a'] }] };

    reconcilePostInFilters({ filters, post: withoutExcludedTag, matchesAny });
    expect(filters[0].posts).to.deep.equal([withoutExcludedTag]);

    reconcilePostInFilters({ filters, post: withExcludedTag, matchesAny });
    expect(filters[0].posts).to.deep.equal([]);

    reconcilePostInFilters({ filters, post: withoutExcludedTag, matchesAny });
    expect(filters[0].posts).to.deep.equal([withoutExcludedTag]);
  });

  it('removeFromFilters は指定投稿を削除する', () => {
    const filters = [{ posts: [{ _id: 'p5' }] }, { posts: [{ _id: 'p5' }, { _id: 'p6' }] }];
    removeFromFilters({ filters, postId: 'p5' });
    expect(filters[0].posts).to.have.length(0);
    expect(filters[1].posts.map((p) => p._id)).to.deep.equal(['p6']);
  });

  it('normalizeFiltersFromStore は size を数値へ正規化する', () => {
    const filters = [
      { id: 'f1', size: { size: 10 } },
      { id: 'f2', size: { foo: 1 } },
      { id: 'f3', size: 20 },
    ];

    const result = normalizeFiltersFromStore(filters);

    expect(result[0].size).to.equal(10);
    expect(result[1].size).to.equal(33);
    expect(result[2].size).to.equal(20);
  });

  it('prepareFiltersForSession は空フィルタを除外し posts を初期化する', () => {
    const filters = [{}, { id: 'f1', posts: [{ _id: 'p1' }], _sending: true, conditions: null }];

    const result = prepareFiltersForSession(filters);

    expect(result).to.have.length(1);
    expect(result[0].posts).to.deep.equal([]);
    expect(result[0]).to.not.have.property('_sending');
  });

  it('sanitizeFiltersForStore は保存用の形に整形する', () => {
    const result = sanitizeFiltersForStore([
      {
        id: 'f1',
        size: { size: 5 },
        conditions: undefined,
        showUserIcon: false,
        speech: '1',
        webPush: 0,
        pushFilterId: 'pid',
      },
      { size: { foo: 1 }, conditions: {} },
    ]);

    expect(result[0]).to.deep.equal({
      id: 'f1',
      size: 5,
      conditions: null,
      showUserIcon: false,
      speech: true,
      webPush: false,
      pushFilterId: 'pid',
    });
    expect(result[1].size).to.equal(33);
    expect(result[1].showUserIcon).to.equal(true);
    expect(result[1].conditions).to.deep.equal({});
  });

  it('getConditionlessIndexes は条件なしカラムの位置を返す', () => {
    const filters = [{ conditions: null }, { conditions: {} }, { conditions: null }];
    expect(getConditionlessIndexes(filters)).to.deep.equal([0, 2]);
  });
});
