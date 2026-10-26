import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import SupplementItem from '@/components/timeline/items/SupplementItem.vue';
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
  UiAvatar: true,
  UiButton: true,
  UiIcon: true,
  UiTooltip: UiTooltipStub,
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    floorId: 'floor-1',
    roomId: 'room-1',
    displayActionButton: true,
    displayName: true,
    displayDate: true,
    displayUserKickButton: true,
    userId: 'user-1',
    userRole: 'User',
    roomRole: 'User',
    ...overrides.getters,
  },
  dispatch: () => {},
});

const createWrapper = (overrides = {}) =>
  shallowMount(SupplementItem, {
    stubs: baseStubs,
    props: {
      idPrefix: 'timeline',
      postId: 'post-1',
      replyId: null,
      supplement: {
        _id: 'supp-1',
        content: 'note',
        created_at: '2024-01-01T00:00:00Z',
        user: { _id: 'user-1', username: 'user' },
        reactions: [],
      },
      isGuestRulesAgreed: true,
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

describe('付加情報の表示と操作', () => {
  it.each([null, 'reply-1'])('返信IDが%sでも任意タイトル・翻訳・従来見出しを表示し、ユーザの絞り込みを維持する', async (replyId) => {
    const wrapper = createWrapper({ props: { replyId } });
    const base = wrapper.props('supplement');
    expect(wrapper.get('.user-name-button').text()).toBe('{name}の付加情報');
    await wrapper.setProps({ supplement: { ...base, title: 'Special offers', title_lang: 'en', title_translations: [{ lang: 'ja', content: 'お買い得メモ！' }] } });
    expect(wrapper.get('.user-name-button').text()).toBe('お買い得メモ！');
    await wrapper.get('.user-name-button').trigger('click');
    expect(wrapper.emitted('onSuccessCreateFilter')).toHaveLength(1);
    await wrapper.setProps({ supplement: { ...base, title: '<b>Special offers</b>', title_lang: 'en', title_translations: [] } });
    expect(wrapper.get('.user-name-button').text()).toBe('<b>Special offers</b>');
    expect(wrapper.get('.user-name-button').find('b').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each([
    ['FloorEditor', true],
    ['FloorMember', true],
    ['RoomMember', false],
    ['User', false],
  ])('%sのキックボタン表示をフロア権限に合わせる', (roomRole, expected) => {
    const wrapper = createWrapper({ store: createStoreMock({ getters: { roomRole } }) });
    expect(wrapper.find('.kick-button').exists()).to.equal(expected);
    wrapper.unmount();
  });

  it('付加情報の音声を現在のルームに紐づくダウンロード操作付きプレイヤーへ渡す', () => {
    const wrapper = createWrapper({
      props: {
        supplement: {
          _id: 'supp-1',
          content: 'note',
          created_at: '2024-01-01T00:00:00Z',
          user: { _id: 'user-1', username: 'user' },
          reactions: [],
          audio_name: 'supplement.m4a',
          audio_description: '',
        },
      },
    });

    const player = wrapper.find('.supplement-audio').findComponent(TimelineAudioPlayer);
    expect(player.exists()).to.equal(true);
    expect(player.props()).to.include({
      src: '/media/floor-1/room-1/supplement.m4a',
      fileName: 'supplement.m4a',
      audioTitle: '',
      description: '',
      preload: 'none',
      downloadTestId: 'timeline-supplement-audio-download-button-supp-1',
    });
  });

  it('カラムの接頭辞と対象種別からリアクション選択欄のIDを生成する', async () => {
    const wrapper = createWrapper();
    expect(wrapper.vm.reactionPickerId).to.equal('timeline-reaction-picker-supplement-supp-1');
    expect(wrapper.get('[aria-expanded]').attributes('aria-controls')).to.equal(undefined);
    wrapper.vm.toggleReactionPicker();
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(ReactionPickerStub).props('pickerId')).to.equal(wrapper.vm.reactionPickerId);
  });

  it('ユーザ名がAIでも人の長文付加情報と同じ展開表示になる', async () => {
    const longContent = 'a'.repeat(401);
    const wrapper = createWrapper({
      props: {
        supplement: {
          _id: 'supp-ai',
          content: longContent,
          created_at: '2024-01-01T00:00:00Z',
          user: { _id: 'result-user', username: 'AI result' },
          reactions: [],
        },
      },
    });

    expect(wrapper.find('article.supplement').exists()).to.equal(true);
    wrapper.vm.contentExpanded = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: 'TimelineText' }).props('content')).to.equal(longContent);
    wrapper.unmount();
  });

  it('ユーザクリックで絞り込みを通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.onClickUserBySupplement(wrapper.props().supplement);

    expect(wrapper.emitted().onSuccessCreateFilter).to.have.lengthOf(1);
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

  it('編集と削除を通知する', () => {
    const wrapper = createWrapper();
    wrapper.vm.onPressEditSupplementButton();
    wrapper.vm.onPressDeleteSupplementButton();

    expect(wrapper.emitted().showEditSupplementDialog).to.have.lengthOf(1);
    expect(wrapper.emitted().showDeleteSupplementDialog).to.have.lengthOf(1);
    wrapper.unmount();
  });

  it('本文はメディアより先に表示される', () => {
    const wrapper = createWrapper({
      props: {
        supplement: {
          _id: 'supp-1',
          content: 'note',
          created_at: '2024-01-01T00:00:00Z',
          user: { _id: 'user-1', username: 'user' },
          reactions: [],
          image_name: 'supp.png',
        },
      },
    });

    const container = wrapper.find('.container').element;
    const textEl = container.querySelector('.supplement-content.text');
    const imageEl = container.querySelector('.image');
    const children = Array.from(container.children);

    expect(textEl).to.not.equal(null);
    expect(imageEl).to.not.equal(null);
    expect(children.indexOf(textEl)).to.be.lessThan(children.indexOf(imageEl));

    wrapper.unmount();
  });
});


describe('長い付加情報の展開', () => {
  it('全文を初期読み上げ対象にせず、ボタンで全文・リンクを展開し閉じられる', async () => {
    const wrapper = createWrapper({ props: { supplement: { _id:'long', lang:'ja', content:'説明。'.repeat(180) + 'END', ai_origin:{kind:'conversation'}, user:{username:'Helper'}, reactions:[] } } });
    expect(wrapper.get('.expand-supplement').attributes('aria-expanded')).toBe('false');
    expect(wrapper.get('.expand-supplement').attributes('aria-controls')).toBe('timeline-supplement-body-long');
    expect(wrapper.text()).not.toContain('END');
    await wrapper.get('.expand-supplement').trigger('click');
    expect(wrapper.get('.expand-supplement').attributes('aria-expanded')).toBe('true');
    expect(wrapper.findComponent({name:'TimelineText'}).props('content')).toContain('END');
    await wrapper.get('.expand-supplement').trigger('click');
    expect(wrapper.get('.expand-supplement').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
  it('原文が短く翻訳だけが長い場合にも展開でき、言語変更で閉じる', async () => {
    const wrapper = createWrapper({props:{supplement:{_id:'translated',lang:'en',content:'Short answer.',translations:[{lang:'ja',content:'翻訳'.repeat(300)+'末尾'}],ai_origin:{kind:'conversation'},user:{username:'Helper'},reactions:[]}}});
    expect(wrapper.find('.expand-supplement').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('末尾');
    await wrapper.get('.expand-supplement').trigger('click');
    expect(wrapper.text()).toContain('末尾');
    wrapper.vm.$options.watch['$i18n.locale'].call(wrapper.vm);
    await wrapper.vm.$nextTick();
    expect(wrapper.get('.expand-supplement').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
  it.each([undefined, {kind:'speech'}, {kind:'vision'}, {kind:'video'}, {kind:'audioScene'}])('人・全解析を同じルールで折りたたむ', (origin) => {
    const wrapper=createWrapper({props:{supplement:{_id:'other',content:'long '.repeat(200),ai_origin:origin,user:{username:'User'},reactions:[]}}});
    expect(wrapper.find('.expand-supplement').exists()).toBe(true);wrapper.unmount();
  });
});
