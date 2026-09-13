import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import chatApi from '@/api/chat';
import ReactionPicker from '@/components/timeline/inputs/ReactionPicker.vue';

const baseStubs = {
  UiIcon: true,
};

const createStoreMock = (overrides = {}) => ({
  getters: {
    userId: 'user-1',
    guestId: 'guest-1',
    guestName: 'Guest',
    userIsLogin: true,
    ...overrides.getters,
  },
});

const createWrapper = (overrides = {}) =>
  shallowMount(ReactionPicker, {
    attachTo: overrides.attachTo,
    stubs: baseStubs,
    props: {
      pickerId: 'timeline-reaction-picker-post-post-1',
      reactionPickerVisible: true,
      postId: 'post-1',
      replyId: null,
      supplementId: null,
      reactions: [],
      isGuestRulesAgreed: true,
      ...(overrides.props || {}),
    },
    provide: overrides.provide,
    mocks: {
      $store: overrides.store || createStoreMock(),
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

const createOperationReporter = (events, reportImpl) => ({
  capture() {
    events.push(['capture']);
    return 'operation-token';
  },
  report(token, operation) {
    events.push(['report', token, operation]);
    return reportImpl?.(token, operation);
  },
});

describe('リアクションの選択', () => {
  const originalAddReaction = chatApi.addReaction;

  afterEach(() => {
    chatApi.addReaction = originalAddReaction;
  });

  it('投稿・返信・付加情報を複数カラムへ同時に表示してもリアクション選択のIDが重複しない', () => {
    const harness = document.createElement('div');
    document.body.appendChild(harness);
    const pickerIds = [
      'timeline-reaction-picker-post-entity-1',
      'filter1-reaction-picker-reply-entity-1',
      'filter2-reaction-picker-supplement-entity-1',
    ];
    const wrappers = pickerIds.map((pickerId) => createWrapper({ attachTo: harness, props: { pickerId } }));

    try {
      const ids = Array.from(harness.querySelectorAll('.reaction-picker')).map((picker) => picker.id);
      expect(ids).to.deep.equal(pickerIds);
      expect(new Set(ids).size).to.equal(ids.length);
    } finally {
      wrappers.forEach((wrapper) => wrapper.unmount());
      harness.remove();
    }
  });

  it('既存リアクションがあれば判定が真になる', () => {
    const wrapper = createWrapper({
      props: {
        reactions: [{ type: 'like', user: { _id: 'user-1' } }],
      },
    });

    expect(wrapper.vm.hasReacted('like')).to.equal(true);
    wrapper.unmount();
  });

  it('ゲストリアクションでも判定が真になる', () => {
    const wrapper = createWrapper({
      store: createStoreMock({ getters: { userId: null, guestId: 'guest-1', userIsLogin: false } }),
      props: {
        reactions: [{ type: 'like', guest_id: 'guest-1' }],
      },
    });

    expect(wrapper.vm.hasReacted('like')).to.equal(true);
    wrapper.unmount();
  });

  it('追加操作でAPIを呼びクローズを通知する', async () => {
    const calls = [];
    chatApi.addReaction = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };

    const wrapper = createWrapper();
    await wrapper.vm.addReaction({ preventDefault: () => {} }, 'like');

    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).to.include({
      postId: 'post-1',
      reactionType: 'like',
      replyId: null,
      supplementId: null,
      isUser: true,
      guestName: 'Guest',
    });
    expect(wrapper.emitted().close).to.have.lengthOf(1);
    wrapper.unmount();
  });

  it('固定リアクションの追加成功後だけ内容の分類を付けて操作を通知する', async () => {
    const cases = [
      [{ replyId: null, supplementId: null }, 'post'],
      [{ replyId: 'reply-1', supplementId: null }, 'reply'],
      [{ replyId: null, supplementId: 'supplement-1' }, 'post_supplement'],
      [{ replyId: 'reply-1', supplementId: 'supplement-1' }, 'reply_supplement'],
    ];

    for (const [props, content] of cases) {
      const events = [];
      chatApi.addReaction = () => {
        events.push(['api']);
        return Promise.resolve();
      };
      const wrapper = createWrapper({
        props,
        provide: { timelineOperationReporter: createOperationReporter(events) },
      });

      await wrapper.vm.addReaction({ preventDefault: () => {} }, 'いいね');

      expect(events).to.deep.equal([
        ['capture'],
        ['api'],
        [
          'report',
          'operation-token',
          {
            kind: 'reaction_change',
            content,
            action: 'add',
            reactionType: 'いいね',
          },
        ],
      ]);
      expect(wrapper.emitted().close).to.have.lengthOf(1);
      wrapper.unmount();
    }
  });

  it('API失敗時は操作を通知せず既存どおりクローズする', async () => {
    const operationEvents = [];
    chatApi.addReaction = () => Promise.reject(new Error('reaction failed'));
    const wrapper = createWrapper({
      provide: { timelineOperationReporter: createOperationReporter(operationEvents) },
    });

    await wrapper.vm.addReaction({ preventDefault: () => {} }, 'いいね');

    expect(operationEvents).to.deep.equal([['capture']]);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
    wrapper.unmount();
  });

  it('ゲストルール完了後にトークンを取得してAPI成功を通知する', async () => {
    const events = [];
    chatApi.addReaction = () => {
      events.push(['api']);
      return Promise.resolve();
    };
    const wrapper = createWrapper({
      props: { isGuestRulesAgreed: false },
      store: createStoreMock({ getters: { userId: null, guestId: 'guest-1', userIsLogin: false } }),
      provide: {
        requireGuestRules: () => {
          events.push(['guest-rules']);
          return Promise.resolve(true);
        },
        timelineOperationReporter: createOperationReporter(events),
      },
    });

    await wrapper.vm.addReaction({ preventDefault: () => {} }, 'いいね');

    expect(events.map(([name]) => name)).to.deep.equal(['guest-rules', 'capture', 'api', 'report']);
    wrapper.unmount();
  });

  it('操作の通知に失敗してもリアクション追加の成功処理を変えない', async () => {
    const apiCalls = [];
    const operationEvents = [];
    chatApi.addReaction = (payload) => {
      apiCalls.push(payload);
      return Promise.resolve();
    };
    const wrapper = createWrapper({
      provide: {
        timelineOperationReporter: createOperationReporter(operationEvents, () => {
          throw new Error('report failed');
        }),
      },
    });

    await wrapper.vm.addReaction({ preventDefault: () => {} }, 'いいね');

    expect(apiCalls).to.have.lengthOf(1);
    expect(operationEvents).to.have.lengthOf(2);
    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
    wrapper.unmount();
  });

  it('送信中は二重送信しない', async () => {
    const calls = [];
    let resolveRequest = null;
    chatApi.addReaction = (payload) => {
      calls.push(payload);
      return new Promise((resolve) => {
        resolveRequest = resolve;
      });
    };

    const wrapper = createWrapper();
    const firstPromise = wrapper.vm.addReaction({ preventDefault: () => {} }, 'like');

    expect(wrapper.vm.sending).to.equal(true);

    await wrapper.vm.addReaction({ preventDefault: () => {} }, 'like');
    expect(calls).to.have.lengthOf(1);

    resolveRequest();
    await firstPromise;

    expect(wrapper.vm.sending).to.equal(false);
    expect(wrapper.emitted().close).to.have.lengthOf(1);
    wrapper.unmount();
  });

  it('ゲストルール未同意で拒否された場合は追加しない', async () => {
    const calls = [];
    const operationEvents = [];
    chatApi.addReaction = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };

    const wrapper = createWrapper({
      props: { isGuestRulesAgreed: false },
      store: createStoreMock({ getters: { userId: null, guestId: 'guest-1', userIsLogin: false } }),
      provide: {
        requireGuestRules: () => Promise.resolve(false),
        timelineOperationReporter: createOperationReporter(operationEvents),
      },
    });

    await wrapper.vm.addReaction({ preventDefault: () => {} }, 'like');

    expect(calls).to.have.lengthOf(0);
    expect(operationEvents).to.deep.equal([]);
    expect(wrapper.emitted().close).to.equal(undefined);
    wrapper.unmount();
  });

  it('選択肢をグループとして識別できる一意IDを使い、ボタンを通常のTab移動順に置く', () => {
    const wrapper = createWrapper();

    const picker = wrapper.get('.reaction-picker');
    expect(picker.attributes('id')).to.equal('timeline-reaction-picker-post-post-1');
    expect(picker.attributes('role')).to.equal('group');
    expect(picker.attributes('aria-label')).to.equal('リアクション');
    wrapper.findAll('button').forEach((button) => {
      expect(button.attributes('role')).to.equal(undefined);
      expect(button.attributes('tabindex')).to.equal(undefined);
    });
    wrapper.unmount();
  });

  it('Tabで末尾から先頭へ、Shift+Tabで先頭から末尾へ戻る', () => {
    const wrapper = createWrapper({ attachTo: document.body });
    const other = createWrapper({ attachTo: document.body, props: { pickerId: 'other-picker' } });
    try {
      const first = wrapper.get('.reaction-buttons button').element;
      const last = wrapper.get('.close-button').element;
      last.focus();
      const forward = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      last.dispatchEvent(forward);
      expect(forward.defaultPrevented).to.equal(true);
      expect(document.activeElement).to.equal(first);

      const backward = new KeyboardEvent('keydown', {
        key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
      });
      first.dispatchEvent(backward);
      expect(backward.defaultPrevented).to.equal(true);
      expect(document.activeElement).to.equal(last);
      expect(wrapper.emitted().close).to.equal(undefined);
      expect(other.emitted().close).to.equal(undefined);
    } finally {
      wrapper.unmount();
      other.unmount();
    }
  });

  it('途中のボタンではブラウザのTab移動を妨げない', () => {
    const wrapper = createWrapper({ attachTo: document.body });
    try {
      const middle = wrapper.findAll('.reaction-buttons button')[2].element;
      middle.focus();
      for (const shiftKey of [false, true]) {
        const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
        middle.dispatchEvent(event);
        expect(event.defaultPrevented).to.equal(false);
      }
    } finally {
      wrapper.unmount();
    }
  });

  it('送信中は無効なリアクションを飛ばし、閉じるボタンに留まる', async () => {
    const wrapper = createWrapper({ attachTo: document.body });
    try {
      await wrapper.setData({ sending: true });
      const close = wrapper.get('.close-button').element;
      close.focus();
      for (const shiftKey of [false, true]) {
        const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
        close.dispatchEvent(event);
        expect(event.defaultPrevented).to.equal(true);
        expect(document.activeElement).to.equal(close);
      }
    } finally {
      wrapper.unmount();
    }
  });

  it('Escapeでクローズを通知する', async () => {
    const operationEvents = [];
    const wrapper = createWrapper({
      provide: { timelineOperationReporter: createOperationReporter(operationEvents) },
    });
    await wrapper.get('.reaction-picker').trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted().close).to.have.lengthOf(1);
    expect(operationEvents).to.deep.equal([]);
    wrapper.unmount();
  });

  it('外側クリックでクローズを通知する', () => {
    const wrapper = createWrapper();
    const outside = document.createElement('button');

    wrapper.vm.handleClickOutside({ target: outside });

    expect(wrapper.emitted().close).to.have.lengthOf(1);
    wrapper.unmount();
  });

  it('選択欄の内部や開くボタンでポインタを離しても閉じない', () => {
    const wrapper = createWrapper();
    const inside = wrapper.get('button').element;
    const trigger = document.createElement('button');
    trigger.setAttribute('aria-controls', wrapper.props('pickerId'));

    wrapper.vm.handleClickOutside({ target: inside });
    wrapper.vm.handleClickOutside({ target: trigger });

    expect(wrapper.emitted().close).to.equal(undefined);
    wrapper.unmount();
  });

  it('最初のリアクションボタンにフォーカスできる', () => {
    const wrapper = createWrapper();
    let focused = 0;
    wrapper.vm.$refs.reactionButton0[0].focus = () => (focused += 1);
    wrapper.vm.focusFirstReactionButton();

    expect(focused).to.equal(1);
    wrapper.unmount();
  });
});
