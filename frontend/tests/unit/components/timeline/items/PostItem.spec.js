import { expect } from 'vitest';
import { reactive } from 'vue';
import { shallowMount } from '../../../helpers/testUtils';
import PostItem from '@/components/timeline/items/PostItem.vue';
import TimelineAudioPlayer from '@/components/timeline/TimelineAudioPlayer.vue';

const ReactionPickerStub = {
  name: 'ReactionPicker',
  props: ['pickerId'],
  template: '<div></div>',
  methods: {
    focusFirstReactionButton() {},
  },
};

const UiTooltipStub = {
  name: 'UiTooltip',
  props: {
    disabled: {
      type: Boolean,
      default: false,
    },
  },
  template: '<div><slot /></div>',
  data: () => ({ hideCallCount: 0, lastFocusOptions: null }),
  methods: {
    hideTooltip() {
      this.hideCallCount += 1;
    },
    focusTrigger(options) {
      this.lastFocusOptions = options;
    },
  },
};

const baseStubs = {
  ReactionItem: true,
  ReactionPicker: ReactionPickerStub,
  SupplementItem: true,
  UiAvatar: true,
  UiButton: true,
  UiIcon: true,
  UiTooltip: UiTooltipStub,
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    userId: 'user-1',
    guestId: 'guest-1',
    displayName: true,
    displayDate: true,
    displayTag: true,
    displaySupplement: true,
    displayActionButton: true,
    displayUserKickButton: true,
    userRole: 'User',
    roomRole: 'User',
    floorId: 'floor-1',
    roomId: 'room-1',
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (overrides = {}) =>
  shallowMount(PostItem, {
    stubs: baseStubs,
    props: {
      idPrefix: 'post',
      post: {
        _id: 'post-1',
        content: 'hello',
        created_at: '2024-01-01T00:00:00Z',
        room_tags: ['tag-1'],
        reactions: [],
        replies: [],
        supplementaries: [],
        user: { _id: 'user-1', username: 'user' },
        floor: 'floor-1',
        room: 'room-1',
      },
      tags: [{ _id: 'tag-1', name: 'tag1', order: 0 }],
      isGuestRulesAgreed: true,
      hideInfo: false,
      showExternalShareButton: false,
      showUserIcon: true,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || createStoreMock(),
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
    directives: {
      clipboard: () => {},
    },
  });

describe('投稿の表示と操作', () => {
  it('投稿音声をダウンロード操作付きプレイヤーへ渡す', () => {
    const wrapper = createWrapper({
      props: {
        post: {
          _id: 'post-1',
          content: 'hello',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['tag-1'],
          reactions: [],
          replies: [],
          supplementaries: [],
          user: { _id: 'user-1', username: 'user' },
          floor: 'floor-1',
          room: 'room-1',
          audio_name: 'post.m4a',
          audio_title: '投稿音声',
          audio_description: '投稿の録音',
        },
      },
    });

    const player = wrapper.find('.audio').findComponent(TimelineAudioPlayer);
    expect(player.exists()).to.equal(true);
    expect(player.props()).to.include({
      src: '/media/floor-1/room-1/post.m4a',
      fileName: 'post.m4a',
      audioTitle: '投稿音声',
      description: '投稿の録音',
      preload: 'metadata',
      downloadTestId: 'timeline-post-audio-download-button-post-1',
    });
  });

  it('投稿編集通知へ標準イベントを含めない', () => {
    const wrapper = createWrapper();
    const post = wrapper.props('post');

    wrapper.vm.showEditPostDialog(post, false);

    expect(wrapper.emitted().showEditPostDialog[0]).to.deep.equal([post, false]);
  });

  it('フォーカス対象のarticle要素に投稿IDをdata属性で設定する', () => {
    const article = createWrapper().get('article');
    expect(article.attributes('tabindex')).to.equal('-1');
    expect(article.attributes('data-timeline-item-id')).to.equal('post-1');
  });

  it('カラムの接頭辞と対象種別から選択欄のIDを作り、開いている間だけ開くボタンから参照する', async () => {
    const wrapper = createWrapper({ props: { idPrefix: 'filter2' } });
    const trigger = wrapper.get('[aria-expanded]');

    expect(wrapper.vm.reactionPickerId).to.equal('filter2-reaction-picker-post-post-1');
    expect(trigger.attributes('aria-controls')).to.equal(undefined);
    wrapper.vm.toggleReactionPicker();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[aria-expanded]').attributes('aria-controls')).to.equal(wrapper.vm.reactionPickerId);
    expect(wrapper.findComponent(ReactionPickerStub).props('pickerId')).to.equal(wrapper.vm.reactionPickerId);
  });

  it('クリックでユーザ絞り込みを通知する', () => {
    const wrapper = createWrapper();

    wrapper.vm.onClickUserByPost(wrapper.props().post);

    expect(wrapper.emitted().onSuccessCreateFilter).to.have.lengthOf(1);
    wrapper.unmount();
  });

  it('表示済み本人投稿へ最新プロフィール名と画像削除を即時反映する', async () => {
    const profile = reactive({ name: '以前の名前', imageName: 'old.png' });
    const wrapper = createWrapper({
      store: createStoreMock({
        getters: {
          resolveUserDisplayName: (user) => (user?._id === 'user-1' ? profile.name : user?.username),
          resolveUserDisplayImageName: (user) =>
            user?._id === 'user-1' ? profile.imageName : user?.image_name,
        },
      }),
      props: {
        post: {
          _id: 'post-1',
          content: 'hello',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: [],
          reactions: [],
          replies: [],
          supplementaries: [],
          user: { _id: 'user-1', username: '取得時の名前', image_name: 'fetched.png' },
          floor: 'floor-1',
          room: 'room-1',
        },
      },
    });

    expect(wrapper.vm.getUsernameOrGuestname(wrapper.props('post'))).to.equal('以前の名前');
    expect(wrapper.get('.user-icon img').attributes('src')).to.equal('/profile/user-1/old.png');

    profile.name = '更新後の名前';
    profile.imageName = null;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.getUsernameOrGuestname(wrapper.props('post'))).to.equal('更新後の名前');
    expect(wrapper.find('.user-icon img').exists()).to.equal(false);

    wrapper.vm.onClickUserByPost(wrapper.props('post'));
    expect(wrapper.emitted().onSuccessCreateFilter.at(-1)[0].conditions.userName).to.equal('更新後の名前');
  });

  it('タグクリックで条件を通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.onClickTag('tag-1');

    const payload = wrapper.emitted().onSuccessCreateFilter[0][0];
    expect(payload.conditions.tags).to.deep.equal(['tag-1']);
    wrapper.unmount();
  });

  it('リアクションメニューを開閉する', async () => {
    const wrapper = createWrapper();
    const tooltip = wrapper.vm.$refs.reactionButtonTooltip;

    wrapper.vm.toggleReactionPicker();
    expect(tooltip.hideCallCount).to.equal(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.reactionPickerVisible).to.equal(true);
    expect(tooltip.disabled).to.equal(true);

    wrapper.vm.closeReactionPicker();
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.reactionPickerVisible).to.equal(false);
    expect(tooltip.disabled).to.equal(false);
    expect(tooltip.lastFocusOptions).to.deep.equal({ showTooltip: false });
    wrapper.unmount();
  });

  it('タグ編集権限の判定ができる', () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.canEditTag({ _id: 'other' })).to.equal(true);
    expect(wrapper.vm.canEditTag({ _id: 'user-1' })).to.equal(false);
    wrapper.unmount();
  });

  it('投稿タグをコピー状態へ保存して通知する', () => {
    const calls = [];
    const wrapper = createWrapper({
      store: createStoreMock({
        dispatch: (action, payload) => calls.push({ action, payload }),
      }),
      props: {
        post: {
          _id: 'post-1',
          content: 'hello',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['tag-1', 'missing', 'tag-1'],
          reactions: [],
          replies: [],
          supplementaries: [],
          user: { _id: 'user-1', username: 'user' },
          floor: 'floor-1',
          room: 'room-1',
        },
      },
    });

    wrapper.vm.copyTagsFromPost(wrapper.props().post);

    expect(calls).to.deep.equal([
      { action: 'doSetTagClipboardList', payload: { list: ['tag-1'] } },
      { action: 'doShowSnackbar', payload: { message: 'タグをコピーしました', role: 'status' } },
    ]);
    wrapper.unmount();
  });

  it('コピー可能な投稿タグがあればコピーボタンを表示する', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('[data-testid="timeline-post-tag-copy-button"]').exists()).to.equal(true);
    wrapper.unmount();
  });

  it('コピー可能な投稿タグがなければコピーボタンを表示せずコピーしない', () => {
    const calls = [];
    const wrapper = createWrapper({
      store: createStoreMock({
        dispatch: (action, payload) => calls.push({ action, payload }),
      }),
      props: {
        post: {
          _id: 'post-1',
          content: 'hello',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['missing'],
          reactions: [],
          replies: [],
          supplementaries: [],
          user: { _id: 'user-1', username: 'user' },
          floor: 'floor-1',
          room: 'room-1',
        },
      },
    });

    expect(wrapper.vm.hasCopyableTags(wrapper.props().post)).to.equal(false);
    expect(wrapper.find('[data-testid="timeline-post-tag-copy-button"]').exists()).to.equal(false);
    wrapper.vm.copyTagsFromPost(wrapper.props().post);

    expect(calls).to.deep.equal([]);
    wrapper.unmount();
  });

  it('投稿のタグ更新・コピー・削除ボタンを隣接して表示する', () => {
    const wrapper = createWrapper({
      store: createStoreMock({ getters: { userRole: 'Administrator' } }),
      props: {
        post: {
          _id: 'post-1',
          content: 'hello',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['tag-1'],
          reactions: [],
          replies: [],
          supplementaries: [],
          user: { _id: 'other-user', username: 'other' },
          floor: 'floor-1',
          room: 'room-1',
        },
      },
    });
    const actionButtons = Array.from(wrapper.find('.action').element.querySelectorAll('[data-testid]'));
    const tagUpdateIndex = actionButtons.findIndex((button) => button.dataset.testid === 'timeline-post-tag-button');
    const copyIndex = actionButtons.findIndex((button) => button.dataset.testid === 'timeline-post-tag-copy-button');
    const deleteIndex = actionButtons.findIndex((button) => button.dataset.testid === 'timeline-post-delete-button');

    expect(tagUpdateIndex).to.equal(copyIndex - 1);
    expect(copyIndex).to.equal(deleteIndex - 1);
    wrapper.unmount();
  });

  it('本文はメディアより先に表示される', () => {
    const wrapper = createWrapper({
      props: {
        post: {
          _id: 'post-1',
          content: 'hello',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['tag-1'],
          reactions: [],
          replies: [],
          supplementaries: [],
          user: { _id: 'user-1', username: 'user' },
          floor: 'floor-1',
          room: 'room-1',
          image_name: 'img.png',
        },
      },
    });

    const container = wrapper.find('.container').element;
    const textEl = container.querySelector('.text');
    const imageEl = container.querySelector('.image');
    const children = Array.from(container.children);

    expect(textEl).to.not.equal(null);
    expect(imageEl).to.not.equal(null);
    expect(children.indexOf(textEl)).to.be.lessThan(children.indexOf(imageEl));

    wrapper.unmount();
  });
});
