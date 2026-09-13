import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import ReplyItem from '@/components/timeline/items/ReplyItem.vue';
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
    ...overrides.getters,
  },
  dispatch: overrides.dispatch || (() => {}),
});

const createWrapper = (overrides = {}) =>
  shallowMount(ReplyItem, {
    stubs: baseStubs,
    props: {
      idPrefix: 'reply',
      post: {
        _id: 'post-1',
        floor: 'floor-1',
        room: 'room-1',
        user: { _id: 'user-1', username: 'user' },
      },
      reply: {
        _id: 'reply-1',
        content: 'reply',
        created_at: '2024-01-01T00:00:00Z',
        room_tags: ['tag-1'],
        reactions: [],
        supplementaries: [],
        user: { _id: 'user-1', username: 'user' },
      },
      tags: [{ _id: 'tag-1', name: 'tag1', order: 0 }],
      isGuestRulesAgreed: true,
      hideInfo: false,
      needThreadLine: false,
      showUserIcon: true,
      ...(overrides.props || {}),
    },
    mocks: {
      $store: overrides.store || createStoreMock(),
      $t: (key) => key,
      $i18n: { locale: 'ja' },
      ...(overrides.mocks || {}),
    },
  });

describe('返信の表示と操作', () => {
  it('返信音声を親投稿のルームに紐づくダウンロード操作付きプレイヤーへ渡す', () => {
    const wrapper = createWrapper({
      props: {
        reply: {
          _id: 'reply-1',
          content: 'reply',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['tag-1'],
          reactions: [],
          supplementaries: [],
          user: { _id: 'user-1', username: 'user' },
          audio_name: 'reply.m4a',
          audio_title: '返信音声',
        },
      },
    });

    const player = wrapper.find('.audio').findComponent(TimelineAudioPlayer);
    expect(player.exists()).to.equal(true);
    expect(player.props()).to.include({
      src: '/media/floor-1/room-1/reply.m4a',
      fileName: 'reply.m4a',
      audioTitle: '返信音声',
      description: '',
      preload: 'none',
      downloadTestId: 'timeline-reply-audio-download-button-reply-1',
    });
  });

  it('フォーカス対象のarticle要素に返信IDをdata属性で設定する', () => {
    const article = createWrapper().get('article');
    expect(article.attributes('tabindex')).to.equal('-1');
    expect(article.attributes('data-timeline-item-id')).to.equal('reply-1');
  });

  it('カラムの接頭辞と対象種別からリアクション選択欄のIDを生成する', async () => {
    const wrapper = createWrapper({ props: { idPrefix: 'timeline' } });
    expect(wrapper.vm.reactionPickerId).to.equal('timeline-reaction-picker-reply-reply-1');
    expect(wrapper.get('[aria-expanded]').attributes('aria-controls')).to.equal(undefined);
    wrapper.vm.toggleReactionPicker();
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(ReactionPickerStub).props('pickerId')).to.equal(wrapper.vm.reactionPickerId);
  });

  it('付加情報の表示はdisplaySupplementに従う', () => {
    const reply = {
      _id: 'reply-1',
      content: 'reply',
      created_at: '2024-01-01T00:00:00Z',
      room_tags: ['tag-1'],
      reactions: [],
      supplementaries: [{ _id: 'supp-1', user: { _id: 'user-1', username: 'user' } }],
      user: { _id: 'user-1', username: 'user' },
    };

    const wrapperHidden = createWrapper({
      props: { reply },
      store: createStoreMock({ getters: { displaySupplement: false, displayActionButton: true } }),
    });
    expect(wrapperHidden.findComponent({ name: 'SupplementItem' }).exists()).to.equal(false);
    wrapperHidden.unmount();

    const wrapperShown = createWrapper({
      props: { reply },
      store: createStoreMock({ getters: { displaySupplement: true, displayActionButton: false } }),
    });
    expect(wrapperShown.findComponent({ name: 'SupplementItem' }).exists()).to.equal(true);
    wrapperShown.unmount();
  });

  it('クリックでユーザ絞り込みを通知する', () => {
    const wrapper = createWrapper();

    wrapper.vm.onClickUserByReply(wrapper.props().reply);

    expect(wrapper.emitted().onSuccessCreateFilter).to.have.lengthOf(1);
    wrapper.unmount();
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

  it('返信タグをコピー状態へ保存して通知する', () => {
    const calls = [];
    const wrapper = createWrapper({
      store: createStoreMock({
        dispatch: (action, payload) => calls.push({ action, payload }),
      }),
      props: {
        reply: {
          _id: 'reply-1',
          content: 'reply',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['tag-1', 'missing', 'tag-1'],
          reactions: [],
          supplementaries: [],
          user: { _id: 'user-1', username: 'user' },
        },
      },
    });

    wrapper.vm.copyTagsFromReply(wrapper.props().reply);

    expect(calls).to.deep.equal([
      { action: 'doSetTagClipboardList', payload: { list: ['tag-1'] } },
      { action: 'doShowSnackbar', payload: { message: 'タグをコピーしました', role: 'status' } },
    ]);
    wrapper.unmount();
  });

  it('コピー可能な返信タグがあればコピーボタンを表示する', () => {
    const wrapper = createWrapper();

    expect(wrapper.find('[data-testid="timeline-reply-tag-copy-button"]').exists()).to.equal(true);
    wrapper.unmount();
  });

  it('コピー可能な返信タグがなければコピーボタンを表示せずコピーしない', () => {
    const calls = [];
    const wrapper = createWrapper({
      store: createStoreMock({
        dispatch: (action, payload) => calls.push({ action, payload }),
      }),
      props: {
        reply: {
          _id: 'reply-1',
          content: 'reply',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['missing'],
          reactions: [],
          supplementaries: [],
          user: { _id: 'user-1', username: 'user' },
        },
      },
    });

    expect(wrapper.vm.hasCopyableTags(wrapper.props().reply)).to.equal(false);
    expect(wrapper.find('[data-testid="timeline-reply-tag-copy-button"]').exists()).to.equal(false);
    wrapper.vm.copyTagsFromReply(wrapper.props().reply);

    expect(calls).to.deep.equal([]);
    wrapper.unmount();
  });

  it('返信のタグ更新・コピー・削除ボタンを隣接して表示し、親子IDを通知する', async () => {
    const wrapper = createWrapper({
      store: createStoreMock({ getters: { userRole: 'Administrator' } }),
      props: {
        reply: {
          _id: 'reply-1',
          content: 'reply',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['tag-1'],
          reactions: [],
          supplementaries: [],
          user: { _id: 'other-user', username: 'other' },
        },
      },
    });
    const actionButtons = Array.from(wrapper.find('.action').element.querySelectorAll('[data-testid]'));
    const tagUpdateIndex = actionButtons.findIndex((button) => button.dataset.testid === 'timeline-reply-tag-button');
    const copyIndex = actionButtons.findIndex((button) => button.dataset.testid === 'timeline-reply-tag-copy-button');
    const deleteIndex = actionButtons.findIndex((button) => button.dataset.testid === 'timeline-reply-delete-button');

    await wrapper.get('[data-testid="timeline-reply-tag-button"]').trigger('click');
    expect(wrapper.emitted().showEditTagDialog[0][0]).to.deep.equal({ post_id: wrapper.props('post')._id, reply_id: 'reply-1' });
    expect(tagUpdateIndex).to.equal(copyIndex - 1);
    expect(copyIndex).to.equal(deleteIndex - 1);
    wrapper.unmount();
  });

  it('本文とタグはメディアより先に表示される', () => {
    const wrapper = createWrapper({
      props: {
        reply: {
          _id: 'reply-1',
          content: 'reply',
          created_at: '2024-01-01T00:00:00Z',
          room_tags: ['tag-1'],
          reactions: [],
          supplementaries: [],
          user: { _id: 'user-1', username: 'user' },
          image_name: 'reply.png',
          video_name: 'reply.mp4',
          video_thumbnail_name: 'reply-thumb.jpg',
        },
      },
    });

    const container = wrapper.find('.container').element;
    const textEl = container.querySelector('.text');
    const tagsEl = container.querySelector('.tags');
    const imageEl = container.querySelector('.image');
    const videoEl = container.querySelector('.video');
    const children = Array.from(container.children);

    expect(textEl).to.not.equal(null);
    expect(tagsEl).to.not.equal(null);
    expect(imageEl).to.not.equal(null);
    expect(videoEl).to.not.equal(null);
    expect(children.indexOf(textEl)).to.be.lessThan(children.indexOf(tagsEl));
    expect(children.indexOf(tagsEl)).to.be.lessThan(children.indexOf(imageEl));
    expect(children.indexOf(tagsEl)).to.be.lessThan(children.indexOf(videoEl));

    wrapper.unmount();
  });
});
