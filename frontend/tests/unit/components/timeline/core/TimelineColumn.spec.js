import fs from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import TimelineColumn from '@/components/timeline/core/TimelineColumn.vue';

const COMPONENT_PATH = path.resolve(process.cwd(), 'src/components/timeline/core/TimelineColumn.vue');

const createWrapper = (overrides = {}) =>
  shallowMount(TimelineColumn, {
    stubs: {
      ReplyNotificationItem: true,
      ReactionNotificationItem: true,
      AnimationPostItem: true,
      PostItem: true,
      AnimationReplyItem: true,
      ReplyItem: true,
      TimelinePostButtons: true,
      TimelineFilterSummary: {
        name: 'TimelineFilterSummary',
        template: '<span class="timeline-filter-summary-stub"></span>',
      },
      UiButton: true,
      UiIcon: { name: 'UiIcon', template: '<i></i>' },
      UiTooltip: { name: 'UiTooltip', template: '<span><slot/></span>' },
    },
    props: {
      index: 0,
      isDefaultColumn: true,
      filter: { conditions: null, displayOrder: [], showUserIcon: false },
      posts: [],
      roomTags: [],
      commonColumnProps: () => ({}),
      ...(overrides.props || {}),
    },
    mocks: {
      $t(key) {
        if (!this.$i18n) {
          throw new Error('$i18nが必要です');
        }
        return key;
      },
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('タイムラインのカラム', () => {
  it('投稿編集の通知には投稿種別とタグIDだけを渡す', () => {
    const wrapper = createWrapper();
    const post = { _id: 'post-1' };

    wrapper.vm.onShowEditPostDialog(post, true, ['tag-1']);
    wrapper.vm.onShowEditPostDialog(post, false);

    expect(wrapper.emitted().showEditPostDialog).to.deep.equal([
      [post, true, ['tag-1']],
      [post, false, []],
    ]);
  });

  it('既定列だけtimeline名前空間を使い、通知に発生元の列番号を付ける', () => {
    const defaultColumn = createWrapper({ props: { index: 2, isDefaultColumn: true } });
    expect(defaultColumn.vm.itemIdPrefix).to.equal('timeline');
    expect(defaultColumn.get('.timeline.column').attributes('id')).to.equal('timeline');
    expect(defaultColumn.get('h2').attributes('id')).to.equal('timeline-title-main');

    defaultColumn.vm.onPressNotification({ origin_id: 'post-1' });
    expect(defaultColumn.emitted().onPressNotification[0]).to.deep.equal([{ origin_id: 'post-1' }, 2]);

    const otherColumn = createWrapper({ props: { index: 3, isDefaultColumn: false } });
    expect(otherColumn.vm.itemIdPrefix).to.equal('filter3');
    expect(otherColumn.get('.timeline.column').attributes('id')).to.equal('filter3');
    expect(otherColumn.get('h2').attributes('id')).to.equal('timeline-title3');
  });

  it('conditionsがnullなら条件なしと判定する', () => {
    const wrapper = createWrapper({ props: { filter: { conditions: null, displayOrder: [] } } });
    expect(wrapper.vm.isConditionless).to.equal(true);

    wrapper.setProps({ filter: { conditions: { keyword: 'x', displayOrder: [] } } });
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.vm.isConditionless).to.equal(false);
    });
  });

  it('showRangeがtargetの場合はrangeIsAllがfalseになる', () => {
    const wrapper = createWrapper({
      props: { filter: { conditions: { showRange: 'target', displayOrder: [] } } },
    });
    expect(wrapper.vm.rangeIsAll).to.equal(false);
  });

  it('条件なしの場合はrangeIsAllがtrueになる', () => {
    const wrapper = createWrapper({ props: { filter: { conditions: null, displayOrder: [] } } });
    expect(wrapper.vm.rangeIsAll).to.equal(true);
  });

  it('filterTagIdsは除外キーを除いてタグIDのみ返す', () => {
    const wrapper = createWrapper({
      props: {
        filter: {
          conditions: {
            filterMode: 'include',
            displayOrder: [{ key: 'notags' }, { key: 'animation' }, { key: 'fav' }, { key: 'tag-1' }, { key: 'tag-2' }],
          },
        },
      },
    });

    expect(wrapper.vm.filterTagIds).to.deep.equal(['tag-1', 'tag-2']);
  });

  it('filterTagIdsは除外フィルタでは空配列を返す', () => {
    const wrapper = createWrapper({
      props: {
        filter: {
          conditions: {
            filterMode: 'exclude',
            displayOrder: [{ key: 'tag-1' }],
          },
        },
      },
    });

    expect(wrapper.vm.filterTagIds).to.deep.equal([]);
  });

  it('timelineTitleTextは条件なしのタイトルとタグを連結する', () => {
    const wrapper = createWrapper({
      props: {
        filter: { conditions: null, displayOrder: [] },
        localTagIds: ['tag-1', 'tag-2'],
        roomTags: [
          { _id: 'tag-1', name: 'tag-1', order: 1 },
          { _id: 'tag-2', name: 'tag-2', order: 2 },
        ],
      },
    });
    expect(wrapper.vm.timelineTitleText).to.equal('タイムライン #tag-1 #tag-2');
  });

  it('timelineTitleTextは絞り込み条件を連結する', () => {
    const wrapper = createWrapper({
      props: {
        filter: {
          conditions: {
            filterMode: 'exclude',
            keyword: 'hello',
            userName: 'user',
            displayOrder: [{ key: 'notags', display: 'タグ無し' }, { key: 'tag-1' }],
          },
        },
        roomTags: [{ _id: 'tag-1', name: 'tag-1', order: 1 }],
      },
    });
    expect(wrapper.vm.timelineTitleText).to.equal('表示しない hello user タグ無し #tag-1');
  });

  it('絞り込みタイトルに共通サマリコンポーネントを表示する', () => {
    const wrapper = createWrapper({
      props: {
        filter: {
          conditions: { keyword: 'test', displayOrder: [{ key: 'notags', display: 'タグ無し' }] },
        },
      },
    });

    expect(wrapper.find('.filter-timeline-title').find('.timeline-filter-summary-stub').exists()).to.equal(true);
  });

  it('長いカラムタイトルは省略可能な領域へ置き、操作ボタン群を縮めない', () => {
    const wrapper = createWrapper({ props: { index: 4 } });
    const header = wrapper.get('.timeline-title');
    const titleArea = header.get('.timeline-title-summary');
    const actions = header.get('.timeline-title-actions');
    const source = fs.readFileSync(COMPONENT_PATH, 'utf8');
    const titleAreaStyle = source.match(/\.timeline-title \.timeline-title-summary\s*\{([^}]*)\}/u);
    const actionsStyle = source.match(/\.timeline-title-handle,\s*\.timeline-title-actions\s*\{([^}]*)\}/u);
    const titleButtonStyle = source.match(/\.timeline-scroll-to-top-button\s*\{([^}]*)\}/u);

    expect(titleArea.element.tagName).to.equal('H2');
    expect(titleArea.classes()).to.include('filter-timeline-title');
    expect(titleArea.get('.timeline-scroll-to-top-button').exists()).to.equal(true);
    expect(actions.get('[data-testid="timeline-filter-delete-button-4"]').exists()).to.equal(true);
    expect(titleAreaStyle).to.not.equal(null);
    expect(titleAreaStyle[1]).to.include('flex: 1 1 auto;');
    expect(titleAreaStyle[1]).to.include('min-width: 0;');
    expect(titleAreaStyle[1]).to.include('overflow: hidden;');
    expect(actionsStyle).to.not.equal(null);
    expect(actionsStyle[1]).to.include('flex: 0 0 auto;');
    expect(titleButtonStyle).to.not.equal(null);
    expect(titleButtonStyle[1]).to.include('width: 100%;');
    expect(titleButtonStyle[1]).to.include('overflow: hidden;');
    expect(titleButtonStyle[1]).to.include('text-overflow: ellipsis;');
  });

  it('h2の見出しを維持し、タイトルのボタンから先頭へ移動できる', async () => {
    let scrolled = null;
    const wrapper = createWrapper({
      props: { index: 2 },
      mocks: {
        $i18n: { locale: 'ja' },
        $t: (key, params) => (params?.title ? key.replace('{title}', params.title) : key),
      },
    });
    wrapper.get('.timeline-content').element.scrollTo = (options) => {
      scrolled = options;
    };
    const heading = wrapper.get('h2.filter-timeline-title');
    const button = wrapper.get('[data-testid="timeline-scroll-to-top-2"]');

    expect(heading.attributes('role')).to.equal(undefined);
    expect(heading.attributes('tabindex')).to.equal(undefined);
    expect(heading.attributes('aria-label')).to.equal(wrapper.vm.timelineTitleText);
    expect(heading.find('[data-testid="timeline-scroll-to-top-2"]').exists()).to.equal(true);
    expect(wrapper.get('.timeline-title-actions').find('.timeline-scroll-to-top-button').exists()).to.equal(false);
    expect(button.element.tagName).to.equal('BUTTON');
    expect(button.attributes('type')).to.equal('button');
    expect(button.classes()).to.include('timeline-scroll-to-top-button');
    expect(button.attributes('aria-label')).to.include('の先頭へ移動');
    expect(button.find('.timeline-filter-summary-stub').exists()).to.equal(true);
    await button.trigger('click');
    expect(scrolled).to.deep.equal({ top: 0, behavior: 'smooth' });
  });

  it('checkTagFilterはOR条件で一致を判定する', () => {
    const wrapper = createWrapper({
      props: {
        localTagIds: ['a', 'b'],
        localTagOperator: 'or',
      },
    });

    expect(wrapper.vm.checkTagFilter({ room_tags: ['c', 'b'] })).to.equal(true);
    expect(wrapper.vm.checkTagFilter({ room_tags: ['c'] })).to.equal(false);
  });

  it('checkTagFilterはAND条件で一致を判定する', () => {
    const wrapper = createWrapper({
      props: {
        localTagIds: ['a', 'b'],
        localTagOperator: 'and',
      },
    });

    expect(wrapper.vm.checkTagFilter({ room_tags: ['a', 'b', 'c'] })).to.equal(true);
    expect(wrapper.vm.checkTagFilter({ room_tags: ['a'] })).to.equal(false);
  });

  it('needThreadLineは最初の通常返信以降でtrueになる', () => {
    const wrapper = createWrapper();
    const post = {
      replies: [
        { _id: 'r1', animation: null },
        { _id: 'r2', animation: { id: 'a' } },
      ],
    };

    expect(wrapper.vm.needThreadLine(post, 0)).to.equal(false);
    expect(wrapper.vm.needThreadLine(post, 1)).to.equal(true);
  });

  it('shouldShowReplyはrangeIsAllかつ親一致時にtrueを返す', () => {
    const wrapper = createWrapper({ props: { filter: { conditions: null, displayOrder: [] } } });
    expect(wrapper.vm.shouldShowReply(true, { _id: 'r1' }, {})).to.equal(true);
  });

  it('グローバルshowRangeはカラム個別showRangeより優先される', () => {
    const wrapper = createWrapper({
      props: {
        globalShowRange: 'target',
        filter: { conditions: { showRange: 'all', displayOrder: [] } },
      },
    });

    expect(wrapper.vm.rangeIsAll).to.equal(false);
  });

  it('グローバル条件とカラム条件を投稿ツリー単位でAND評価する', () => {
    const wrapper = createWrapper({
      props: {
        globalConditions: {
          filterMode: 'include',
          keywordArray: ['global'],
          logicalOperator: 'or',
        },
        filter: {
          conditions: {
            filterMode: 'include',
            keywordArray: ['column'],
            logicalOperator: 'or',
            displayOrder: [],
          },
        },
        posts: [{ _id: 'p1', content: 'global', replies: [{ _id: 'r1', content: 'column' }] }],
      },
    });

    expect(wrapper.vm.filteredPosts.map((post) => post._id)).to.deep.equal(['p1']);
  });

  it('グローバル条件中も条件なしカラムへ通知カードを表示する', () => {
    const wrapper = createWrapper({
      props: {
        globalConditions: {
          filterMode: 'include',
          keywordArray: ['visible'],
          logicalOperator: 'or',
        },
        posts: [
          { _id: 'reply-card', replies: [], replyNotification: { _id: 'reply-1' } },
          { _id: 'reaction-card', replies: [], reactionNotification: { _id: 'reaction-1' } },
        ],
      },
    });

    expect(wrapper.vm.filteredPosts.map((post) => post._id)).to.deep.equal(['reply-card', 'reaction-card']);
    expect(wrapper.find('reply-notification-item-stub').exists()).to.equal(true);
    expect(wrapper.find('reaction-notification-item-stub').exists()).to.equal(true);
  });

  it('フォーカス投稿は絞り込み一覧から除外して別枠に保持する', () => {
    const wrapper = createWrapper({
      props: {
        focusedPostId: 'focus',
        globalConditions: {
          filterMode: 'include',
          keywordArray: ['visible'],
          logicalOperator: 'or',
        },
        posts: [
          { _id: 'focus', content: 'not matched', replies: [] },
          { _id: 'normal', content: 'visible', replies: [] },
        ],
      },
    });

    expect(wrapper.vm.focusPost._id).to.equal('focus');
    expect(wrapper.vm.filteredPosts.map((post) => post._id)).to.deep.equal(['normal']);
  });
});
