import { expect } from 'vitest';
import { shallowMount } from '../../../helpers/testUtils';
import chatApi from '@/api/chat';
import ReactionItem from '@/components/timeline/items/ReactionItem.vue';

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
  shallowMount(ReactionItem, {
    props: {
      reactions: [],
      postId: 'post-1',
      replyId: null,
      supplementId: null,
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

describe('リアクションの表示と操作', () => {
  const originalToggle = chatApi.toggleReaction;

  afterEach(() => {
    chatApi.toggleReaction = originalToggle;
  });

  it('リアクションがある場合は表示判定が真になる', () => {
    const wrapper = createWrapper({
      props: { reactions: [{ _id: 'r1', type: 'like' }] },
    });

    expect(wrapper.vm.hasReactions).to.equal(true);
    wrapper.unmount();
  });

  it('リアクション数は種別で集計する', () => {
    const wrapper = createWrapper({
      props: {
        reactions: [
          { _id: 'r1', type: 'like' },
          { _id: 'r2', type: 'like' },
          { _id: 'r3', type: 'smile' },
        ],
      },
    });

    expect(wrapper.vm.getReactionCount('like')).to.equal(2);
    expect(wrapper.vm.getReactionCount('smile')).to.equal(1);
    wrapper.unmount();
  });

  it('ゲストルール未同意で拒否された場合は処理しない', async () => {
    const calls = [];
    const operationEvents = [];
    chatApi.toggleReaction = (payload) => {
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

    await wrapper.vm.toggleReaction('like');

    expect(calls).to.have.lengthOf(0);
    expect(operationEvents).to.deep.equal([]);
    wrapper.unmount();
  });

  it('追加操作でAPIを呼ぶ', async () => {
    const calls = [];
    chatApi.toggleReaction = (payload) => {
      calls.push(payload);
      return Promise.resolve();
    };

    const wrapper = createWrapper();
    await wrapper.vm.toggleReaction('like');

    expect(calls).to.have.lengthOf(1);
    expect(calls[0]).to.include({
      postId: 'post-1',
      reactionType: 'like',
      replyId: null,
      supplementId: null,
      isUser: true,
      isDelete: false,
      guestName: 'Guest',
    });
    wrapper.unmount();
  });

  it('固定リアクションの追加成功後だけ内容の分類を付けて操作を通知する', async () => {
    const cases = [
      [{ replyId: null, supplementId: null }, 'post'],
      [{ replyId: 'reply-1', supplementId: null }, 'reply'],
      [{ replyId: null, supplementId: 'supplement-1' }, 'post_supplement'],
      [{ replyId: 'reply-1', supplementId: 'supplement-1' }, 'reply_supplement'],
    ];

    for (const [props, contentType] of cases) {
      const events = [];
      chatApi.toggleReaction = () => {
        events.push(['api']);
        return Promise.resolve();
      };
      const wrapper = createWrapper({
        props,
        provide: { timelineOperationReporter: createOperationReporter(events) },
      });

      await wrapper.vm.toggleReaction('いいね');

      expect(events).to.deep.equal([
        ['capture'],
        ['api'],
        [
          'report',
          'operation-token',
          {
            kind: 'reaction_change',
            content: contentType,
            action: 'add',
            reactionType: 'いいね',
          },
        ],
      ]);
      wrapper.unmount();
    }
  });

  it('リアクションの削除成功後だけ解除操作を通知する', async () => {
    const apiCalls = [];
    const operationEvents = [];
    chatApi.toggleReaction = (payload) => {
      apiCalls.push(payload);
      return Promise.resolve();
    };
    const wrapper = createWrapper({
      props: {
        reactions: [{ _id: 'reaction-1', type: 'いいね', user: { _id: 'user-1' } }],
      },
      provide: { timelineOperationReporter: createOperationReporter(operationEvents) },
    });

    await wrapper.vm.toggleReaction('いいね');

    expect(apiCalls[0]).to.include({ isDelete: true, reactionId: 'reaction-1' });
    expect(operationEvents[1]).to.deep.equal([
      'report',
      'operation-token',
      {
        kind: 'reaction_change',
        content: 'post',
        action: 'remove',
        reactionType: 'いいね',
      },
    ]);
    wrapper.unmount();
  });

  it('API失敗時は操作を通知しない', async () => {
    const operationEvents = [];
    chatApi.toggleReaction = () => Promise.reject(new Error('reaction failed'));
    const wrapper = createWrapper({
      provide: { timelineOperationReporter: createOperationReporter(operationEvents) },
    });

    await wrapper.vm.toggleReaction('いいね');

    expect(operationEvents).to.deep.equal([['capture']]);
    expect(wrapper.vm.sending).to.equal(false);
    wrapper.unmount();
  });

  it('ゲストルール完了後にトークンを取得してAPI成功を通知する', async () => {
    const events = [];
    chatApi.toggleReaction = () => {
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

    await wrapper.vm.toggleReaction('いいね');

    expect(events.map(([name]) => name)).to.deep.equal(['guest-rules', 'capture', 'api', 'report']);
    wrapper.unmount();
  });

  it('操作の通知に失敗してもリアクション追加の成功処理を変えない', async () => {
    const apiCalls = [];
    const operationEvents = [];
    chatApi.toggleReaction = (payload) => {
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

    await wrapper.vm.toggleReaction('いいね');

    expect(apiCalls).to.have.lengthOf(1);
    expect(operationEvents).to.have.lengthOf(2);
    expect(wrapper.vm.sending).to.equal(false);
    wrapper.unmount();
  });
});
