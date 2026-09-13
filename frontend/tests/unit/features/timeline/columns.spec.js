import { expect } from 'vitest';
import { buildColumnProps, buildColumnEvents } from '@/features/timeline/columns';

const columnEventNames = [
  'onPressNotification',
  'onGetNextPosts',
  'showEditReplyDialog',
  'showDeleteReplyDialog',
  'showEditSupplementDialog',
  'showDeleteSupplementDialog',
  'showEditTagDialog',
  'showGalleryDialog',
  'showEditKickedUserDialog',
  'showDeletePostDialog',
  'showEditPostDialog',
  'toggleColumnSpeech',
  'showFilterDialog',
  'deleteFilter',
  'successCreateFilter',
  'toggleAnimation',
];

describe('タイムラインのカラム設定', () => {
  it('指定された接続先からカラムに渡すプロパティを組み立てる', () => {
    const posts = [{ _id: 'post-1' }];
    const filter = { conditions: null, posts };
    const filters = [filter];
    const roomTags = [{ _id: 'tag-1' }];
    const animatingItemsColumn = { 'post-1': true };
    const localTagIds = ['tag-1'];
    const globalConditions = [{ keyword: 'hello' }];
    const globalShowRange = { start: 1, end: 2 };
    const speechCalls = [];

    const props = buildColumnProps({
      filter,
      index: 0,
      filters,
      roomTags,
      isMobile: false,
      timelineFontFamily: 'serif',
      timelineFontSize: '16px',
      animatingItemsColumn,
      animationEnabled: true,
      isGuestRulesAgreed: true,
      hideReply: false,
      hideInfo: true,
      localSpeech: false,
      localTagIds,
      localTagOperator: 'and',
      globalConditions,
      globalShowRange,
      focusedPostId: 'post-1',
      isGuestReactionOnly: false,
      showExternalShareButton: true,
      isSpeechActive: (receivedFilters, receivedIndex) => {
        speechCalls.push([receivedFilters, receivedIndex]);
        return true;
      },
    });

    expect(props).to.deep.equal({
      index: 0,
      filter,
      isDefaultColumn: true,
      posts,
      roomTags,
      isMobile: false,
      timelineFontFamily: 'serif',
      timelineFontSize: '16px',
      isSpeechActive: true,
      animatingItemsColumn,
      animationEnabled: true,
      isGuestRulesAgreed: true,
      hideReply: false,
      hideInfo: true,
      localSpeech: false,
      localTagIds,
      localTagOperator: 'and',
      globalConditions,
      globalShowRange,
      focusedPostId: 'post-1',
      isGuestReactionOnly: false,
      showExternalShareButton: true,
    });
    expect(props.posts).to.equal(posts);
    expect(props.roomTags).to.equal(roomTags);
    expect(props.localTagIds).to.equal(localTagIds);
    expect(speechCalls).to.deep.equal([[filters, 0]]);
  });

  it('postsとクエリ絞り込み条件の代替処理を維持する', () => {
    const filter = { conditions: null, posts: null };
    const filters = [filter];
    const props = buildColumnProps({
      filter,
      index: 0,
      filters,
      globalConditions: undefined,
      globalShowRange: '',
      isSpeechActive: () => false,
    });

    expect(props.posts).to.deep.equal([]);
    expect(props.globalConditions).to.equal(null);
    expect(props.globalShowRange).to.equal(null);
  });

  it('最初の条件なしカラムだけを既定列にする', () => {
    const filters = [
      { conditions: null, posts: [] },
      { conditions: { keyword: 'k' }, posts: [] },
      { conditions: null, posts: [] },
    ];
    const buildForIndex = (index) =>
      buildColumnProps({
        filter: filters[index],
        index,
        filters,
        animationEnabled: true,
        isSpeechActive: () => false,
      });

    expect(buildForIndex(0).isDefaultColumn).to.equal(true);
    expect(buildForIndex(1).isDefaultColumn).to.equal(false);
    expect(buildForIndex(2).isDefaultColumn).to.equal(false);
    expect(buildForIndex(0).animationEnabled).to.equal(true);
  });

  it('許可された操作だけを参照を変えずに複製し、変更できない一覧にする', () => {
    const commands = Object.fromEntries(columnEventNames.map((name) => [name, () => name]));
    commands.ignored = () => 'ignored';
    const before = { ...commands };

    const eventsA = buildColumnEvents(commands);
    const eventsB = buildColumnEvents(commands);

    expect(eventsA).not.to.equal(eventsB);
    expect(Object.keys(eventsA)).to.deep.equal(columnEventNames);
    columnEventNames.forEach((name) => expect(eventsA[name]).to.equal(commands[name]));
    expect(Object.isFrozen(eventsA)).to.equal(true);
    expect(Object.isFrozen(commands)).to.equal(false);
    expect(commands).to.deep.equal(before);
  });
});
