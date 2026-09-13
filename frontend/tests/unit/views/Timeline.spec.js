import { expect, vi } from 'vitest';
import { setTestRoute, shallowMount } from '../helpers/testUtils';
import { createMemoryHistory, createRouter as createVueRouter } from 'vue-router';
import { reactive } from 'vue';
import { mount } from '@vue/test-utils';
import Timeline from '@/views/Timeline.vue';
import UiDialog from '@/components/ui/UiDialog.vue';
import appStore from '@/store';
import chatApi from '@/api/chat';
import roomApi from '@/api/room';
import tagApi from '@/api/tag';
import { beginPlannedPageLeave, resetPlannedPageLeave } from '@/utils/plannedPageLeave';

import flushPromises from '../helpers/flushPromises';

const buildViewWithoutLifecycle = (view) => ({
  ...view,
  created() {},
  mounted() {},
  beforeUnmount() {},
});

const baseStubs = {
  TimelineArView: true,
  TimelineNormalView: true,
  TimelineDialogs: {
    name: 'TimelineDialogs',
    methods: {
      openEditPostDialogAndFocus() {},
    },
    template: '<div />',
  },
};

const createRouter = (overrides = {}) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'Home', component: {} }],
  });
  return setTestRoute(router, { path: '/', query: overrides.query || {} });
};

const createRouterWithRoute = (route = {}) => {
  const router = createVueRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:post_id?', name: 'TimeLine', component: {} }],
  });
  const params = route.params || {};
  const query = route.query || {};
  return setTestRoute(router, { name: 'TimeLine', params, query });
};

const createWrapper = (overrides = {}) =>
  shallowMount(buildViewWithoutLifecycle(Timeline), {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    router: overrides.router || createRouter({ query: overrides.query }),
    provide: overrides.provide || {},
    mocks: {
      $store: overrides.store || { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' } },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });

const createWrapperWithCreated = (overrides = {}) => {
  const View = {
    ...Timeline,
    mounted() {},
    methods: {
      ...Timeline.methods,
      initTimeLine: overrides.initTimeLine || (() => {}),
      checkMobile: overrides.checkMobile || (() => {}),
    },
  };
  const router = overrides.router || createRouterWithRoute(overrides.route || {});
  return shallowMount(View, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    router,
    mocks: {
      $store: overrides.store || {
        getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1', userEyeFriendlyMode: false },
      },
      $i18n: overrides.i18n || { locale: 'en' },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
};

const createWrapperWithMethods = (overrides = {}) => {
  const View = {
    ...buildViewWithoutLifecycle(Timeline),
    methods: {
      ...Timeline.methods,
      ...(overrides.methods || {}),
    },
  };
  return shallowMount(View, {
    stubs: { ...baseStubs, ...(overrides.stubs || {}) },
    router: overrides.router || createRouter({ query: overrides.query }),
    mocks: {
      $store: overrides.store || { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' } },
      $t: (key) => key,
      ...(overrides.mocks || {}),
    },
  });
};

describe('タイムライン画面', () => {
  let originalRaf;
  let originalCaf;
  let originalWindowRaf;
  let originalWindowCaf;

  beforeEach(() => {
    originalRaf = global.requestAnimationFrame;
    originalCaf = global.cancelAnimationFrame;
    originalWindowRaf = window.requestAnimationFrame;
    originalWindowCaf = window.cancelAnimationFrame;
    global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    global.cancelAnimationFrame = (id) => clearTimeout(id);
    window.requestAnimationFrame = global.requestAnimationFrame;
    window.cancelAnimationFrame = global.cancelAnimationFrame;
  });

  afterEach(() => {
    resetPlannedPageLeave();
    global.requestAnimationFrame = originalRaf;
    global.cancelAnimationFrame = originalCaf;
    window.requestAnimationFrame = originalWindowRaf;
    window.cancelAnimationFrame = originalWindowCaf;
  });

  it('ルームのpage_view成功後にtimeline_viewを送り、解除時に計測を取り消す', () => {
    const token = Object.freeze({});
    const events = [];
    const pageReporter = {
      capture: vi.fn(() => token),
      activate: vi.fn((capturedToken, room, onPageViewSent) => {
        events.push('page_view');
        expect(capturedToken).to.equal(token);
        expect(room).to.equal(rawRoom);
        expect(onPageViewSent).to.be.a('function');
        onPageViewSent();
        return true;
      }),
      cancel: vi.fn((capturedToken) => {
        events.push('cancel');
        expect(capturedToken).to.equal(token);
        return true;
      }),
    };
    const eventReporter = {
      track: vi.fn((eventName) => {
        events.push(eventName);
        return true;
      }),
    };
    const rawRoom = {
      _id: '507f191e810c19729de860ea',
      title: 'Raw Room',
      floor: { _id: '507f1f77bcf86cd799439011', title: 'Raw Floor' },
    };
    const wrapper = createWrapper({
      provide: {
        analyticsEventReporter: eventReporter,
        analyticsPageReporter: pageReporter,
      },
      mocks: {
        $route: {
          params: {
            floor_id: '507f1f77bcf86cd799439011',
            room_id: '507f191e810c19729de860ea',
          },
          query: {},
        },
      },
    });

    wrapper.vm.initializeTimelineAnalytics();
    expect(pageReporter.capture).toHaveBeenCalledOnce();
    expect(wrapper.vm.activateTimelineAnalytics(rawRoom)).to.equal(true);
    expect(events).to.deep.equal(['page_view', 'timeline_view']);

    wrapper.vm.clearTimelineAnalytics();
    wrapper.vm.clearTimelineAnalytics();
    expect(pageReporter.cancel).toHaveBeenCalledOnce();
    expect(events).to.deep.equal(['page_view', 'timeline_view', 'cancel']);
  });

  it('通常表示とAR表示で同じ通知音音声要素をタイムライン直下に維持する', async () => {
    const wrapper = createWrapper();
    const audio = wrapper.get('[data-testid="timeline-notification-audio"]');

    expect(wrapper.findAll('[data-testid="timeline-notification-audio"]')).to.have.lengthOf(1);
    expect(audio.element.parentElement).to.equal(wrapper.element);
    expect(wrapper.find('#silence_audio').exists()).to.equal(false);

    await wrapper.vm.$router.push({ path: '/', query: { armode: 'on' } });
    await flushPromises();

    expect(wrapper.get('[data-testid="timeline-notification-audio"]').element).to.equal(audio.element);
    expect(wrapper.find('#silence_audio').exists()).to.equal(false);
  });

  it('ダイアログ共通情報へ現在のルームID・ルーム表示名・フロア表示名を含める', async () => {
    const wrapper = createWrapper({
      store: {
        getters: {
          userIsLogin: true,
          roomId: 'r1',
          floorId: 'f1',
          floorTitle: 'Floor title',
          resolveUserDisplayName: (user) =>
            user?._id === 'owner-1' ? 'Current owner name' : user?.username,
        },
      },
    });
    await wrapper.setData({
      room: {
        ...wrapper.vm.room,
        title: 'Current room',
        creator: 'Fetched owner name',
        creatorUser: { _id: 'owner-1', username: 'Fetched owner name' },
      },
    });

    expect(wrapper.vm.dialogShared.roomId).to.equal('r1');
    expect(wrapper.vm.dialogShared.roomTitle).to.equal('Current room');
    expect(wrapper.vm.dialogShared.floorTitle).to.equal('Floor title');
    expect(wrapper.vm.dialogShared.roomInfo.creator).to.equal('Current owner name');
  });

  it('カラムイベントは同じ画面内で凍結済みの同一参照を返す', () => {
    const wrapper = createWrapper();

    const eventsA = wrapper.vm.getColumnEvents();
    const eventsB = wrapper.vm.getColumnEvents();

    expect(eventsA).to.equal(eventsB);
    expect(Object.isFrozen(eventsA)).to.equal(true);
    expect(eventsA.onGetNextPosts).to.equal(wrapper.vm.getNextPostsButtonClick);
  });

  it('Socket接続状態を現在の言語で翻訳する', async () => {
    const wrapper = createWrapper({ mocks: { $t: (key) => `translated:${key}` } });

    await wrapper.setData({ infra: { ...wrapper.vm.infra, socketStatus: 'connecting' } });
    expect(wrapper.vm.socketStatusMessage).to.equal('translated:接続中...');

    await wrapper.setData({ infra: { ...wrapper.vm.infra, socketStatus: 'disconnected' } });
    expect(wrapper.vm.socketStatusMessage).to.equal('translated:接続が切断されました。再接続中...');
  });

  it('tablistの矢印操作はrole=tabからのイベントだけを処理する', () => {
    const wrapper = createWrapper();
    wrapper.setData({
      timeline: { filters: [{ conditions: null }, { conditions: { keyword: 'k' } }] },
      ui: { currentTabIndex: 0 },
    });
    let prevented = 0;

    wrapper.vm.handleTabListKeydown({
      key: 'ArrowRight',
      target: { getAttribute: () => null },
      preventDefault: () => (prevented += 1),
    });
    expect(wrapper.vm.ui.currentTabIndex).to.equal(0);
    expect(prevented).to.equal(0);

    wrapper.vm.handleTabListKeydown({
      key: 'ArrowRight',
      target: { getAttribute: (name) => (name === 'role' ? 'tab' : null) },
      preventDefault: () => (prevented += 1),
    });
    expect(wrapper.vm.ui.currentTabIndex).to.equal(1);
    expect(prevented).to.equal(1);
  });

  it('全体設定と目にやさしいモードの個別設定の両方が有効な場合だけアニメーションを動かす', async () => {
    const getters = reactive({
      userIsLogin: true,
      roomId: 'r1',
      floorId: 'f1',
      enableTextAnimation: true,
    });
    const wrapper = createWrapper({ store: { getters } });
    expect(wrapper.vm.effectiveAnimationEnabled).to.equal(true);

    await wrapper.setData({ ui: { ...wrapper.vm.ui, localEnableTextAnimation: false } });
    expect(wrapper.vm.effectiveAnimationEnabled).to.equal(false);

    await wrapper.setData({ ui: { ...wrapper.vm.ui, localEnableTextAnimation: true } });
    getters.enableTextAnimation = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.effectiveAnimationEnabled).to.equal(false);
  });

  it('アニメーションを無効にすると表示要素と実行状態を同じ処理で初期化する', async () => {
    const getters = reactive({
      userIsLogin: true,
      roomId: 'r1',
      floorId: 'f1',
      enableTextAnimation: true,
    });
    const wrapper = createWrapper({ store: { getters } });
    wrapper.vm.timeline.animatingItems = { 0: { 'post-1': true } };
    const animation = document.createElement('div');
    animation.className = 'animation animation-active';
    animation.dataset.columnIndex = '0';
    animation.dataset.postId = 'post-1';
    animation._paused = true;
    animation.style.opacity = '0.5';
    wrapper.element.appendChild(animation);

    getters.enableTextAnimation = false;
    await wrapper.vm.$nextTick();

    expect(animation._paused).to.equal(false);
    expect(animation.hasAttribute('style')).to.equal(false);
    expect(animation.classList.contains('animation-active')).to.equal(false);
    expect(wrapper.vm.timeline.animatingItems[0]['post-1']).to.equal(false);
  });

  it('通知移動は整数の発火元カラムが存在しない場合に何もしない', async () => {
    const wrapper = createWrapper();
    let fetched = 0;
    wrapper.vm.fetchTimelinePosts = () => (fetched += 1);
    wrapper.setData({ timeline: { filters: [{ conditions: null, posts: [] }] } });

    await wrapper.vm.onPressNotification({ origin_id: 'post-1' });
    await wrapper.vm.onPressNotification({ origin_id: 'post-1' }, 9);

    expect(fetched).to.equal(0);
  });

  it('返信通知を押すと対象返信へフォーカスし、通知元のカラムだけをスクロールする', async () => {
    const wrapper = createWrapper();
    wrapper.setData({
      timeline: { filters: [{ conditions: null, posts: [{ _id: 'post:[1]', created_at: '2024-01-01' }] }] },
    });
    const root = document.createElement('div');
    root.id = 'timeline-inner-0';
    const content = document.createElement('div');
    content.className = 'timeline-content';
    const target = document.createElement('article');
    target.dataset.timelineItemId = 'reply:[]';
    Object.defineProperty(target, 'offsetTop', { value: 321 });
    let focusOptions = null;
    let scrollOptions = null;
    target.focus = (options) => {
      focusOptions = options;
    };
    content.scrollTo = (options) => {
      scrollOptions = options;
    };
    content.appendChild(target);
    root.appendChild(content);
    document.body.appendChild(root);

    try {
      await wrapper.vm.onPressNotification(
        { origin_id: 'post:[1]', created_at: '2024-01-02', replyNotification: { _id: 'reply:[]' } },
        0
      );
      expect(focusOptions).to.deep.equal({ preventScroll: true });
      expect(scrollOptions).to.deep.equal({ top: 321, behavior: 'smooth' });
    } finally {
      root.remove();
    }
  });

  it('元の投稿を未取得なら取得を待ち、返信が未表示なら元の投稿へ移動する', async () => {
    const wrapper = createWrapper();
    wrapper.setData({ timeline: { filters: [{ conditions: null, posts: [] }] } });
    const root = document.createElement('div');
    root.id = 'timeline-inner-0';
    const content = document.createElement('div');
    content.className = 'timeline-content';
    content.scrollTo = () => {};
    root.appendChild(content);
    document.body.appendChild(root);
    const calls = [];
    let focused = 0;
    wrapper.vm.fetchTimelinePosts = async (index, options) => {
      calls.push({ index, options });
      const origin = document.createElement('article');
      origin.dataset.timelineItemId = 'origin-1';
      origin.focus = () => (focused += 1);
      content.appendChild(origin);
    };

    try {
      await wrapper.vm.onPressNotification(
        { origin_id: 'origin-1', created_at: '2024-01-02', replyNotification: { _id: 'deleted-reply' } },
        0
      );
      expect(calls).to.deep.equal([
        { index: 0, options: { from: null, to: '2024-01-02', position: 'tail' } },
      ]);
      expect(focused).to.equal(1);
    } finally {
      root.remove();
    }
  });

  it('通知対象の取得が失敗した場合は移動せず発火元フォーカスを維持する', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({ timeline: { filters: [{ conditions: null, posts: [] }] } });
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    wrapper.vm.fetchTimelinePosts = () => Promise.reject(new Error('fetch failed'));

    try {
      await wrapper.vm.onPressNotification({ origin_id: 'origin-1', created_at: '2024-01-02' }, 0);
      expect(document.activeElement).to.equal(trigger);
    } finally {
      trigger.remove();
    }
  });

  it('名前または翻訳からタグIDを取得する', () => {
    const wrapper = createWrapper();
    wrapper.setData({ room: { tags: [{ _id: 't1', name: 'tag', translations: [{ name: 'タグ' }] }] } });

    expect(wrapper.vm.findTagIdByNameOrTranslation('tag')).to.equal('t1');
    expect(wrapper.vm.findTagIdByNameOrTranslation('タグ')).to.equal('t1');
    expect(wrapper.vm.findTagIdByNameOrTranslation('missing')).to.equal(null);
  });

  it('特別キーを除いたタグID一覧を返す', () => {
    const wrapper = createWrapper();
    wrapper.setData({
      ui: { currentTabIndex: 0 },
      timeline: {
        filters: [
          {
            conditions: {
              displayOrder: [{ key: 'tag1' }, { key: 'notags' }, { key: 'fav' }, { key: 'tag2' }],
            },
          },
        ],
      },
    });

    expect(wrapper.vm.currentFilterTagIds).to.deep.equal(['tag1', 'tag2']);
  });

  it('currentFilterTagIds は conditions 未定義なら空配列を返す', () => {
    const wrapper = createWrapper();
    wrapper.setData({
      ui: { currentTabIndex: 0 },
      timeline: { filters: [{}, { conditions: null }] },
    });

    expect(wrapper.vm.currentFilterTagIds).to.deep.equal([]);
  });

  it('currentFilterTagIds は除外フィルタなら空配列を返す', async () => {
    const wrapper = createWrapper();
    await wrapper.setData({
      ui: { ...wrapper.vm.ui, currentTabIndex: 0 },
      timeline: {
        ...wrapper.vm.timeline,
        filters: [
          {
            conditions: {
              filterMode: 'exclude',
              displayOrder: [{ key: 'tag1' }],
            },
          },
        ],
      },
    });

    expect(wrapper.vm.currentFilterTagIds).to.deep.equal([]);
  });

  it('表示中タイムライン全体から自分の最新投稿タグを返す', async () => {
    const wrapper = createWrapper({
      store: {
        getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1', userId: 'user-1', guestId: null },
      },
    });

    await wrapper.setData({
      timeline: {
        ...wrapper.vm.timeline,
        filters: [
          {
            conditions: null,
            posts: [
              {
                _id: 'own-old',
                created_at: '2026-01-01T00:00:00.000Z',
                user: { _id: 'user-1' },
                room_tags: ['old'],
              },
              {
                _id: 'other-new',
                created_at: '2026-01-04T00:00:00.000Z',
                user: { _id: 'user-2' },
                room_tags: ['other'],
              },
              {
                _id: 'own-notification',
                origin_id: 'own-new',
                created_at: '2026-01-05T00:00:00.000Z',
                user: { _id: 'user-1' },
                room_tags: ['notify'],
                replyNotification: {},
              },
            ],
          },
          {
            conditions: { displayOrder: [] },
            posts: [
              {
                _id: 'own-new',
                created_at: '2026-01-03T00:00:00.000Z',
                user: { _id: 'user-1' },
                room_tags: ['new', 'changed'],
              },
            ],
          },
        ],
      },
    });

    expect(wrapper.vm.getPreviousOwnPostTagIds()).to.deep.equal(['new', 'changed']);
  });

  it('表示中タイムラインに自分の投稿が無ければ空配列を返す', async () => {
    const wrapper = createWrapper({
      store: {
        getters: {
          userIsLogin: true,
          roomId: 'r1',
          floorId: 'f1',
          userId: 'user-1',
          tagList: ['store-tag'],
        },
      },
    });

    await wrapper.setData({
      timeline: {
        ...wrapper.vm.timeline,
        filters: [
          {
            conditions: null,
            posts: [
              {
                _id: 'other',
                created_at: '2026-01-01T00:00:00.000Z',
                user: { _id: 'user-2' },
                room_tags: ['other'],
              },
            ],
          },
        ],
      },
    });

    expect(wrapper.vm.getPreviousOwnPostTagIds()).to.deep.equal([]);
  });

  it('ゲスト利用時はguestIdで自分の投稿タグを判定する', async () => {
    const wrapper = createWrapper({
      store: {
        getters: { userIsLogin: false, roomId: 'r1', floorId: 'f1', userId: null, guestId: 'guest-1' },
      },
    });

    await wrapper.setData({
      timeline: {
        ...wrapper.vm.timeline,
        filters: [
          {
            conditions: null,
            posts: [
              {
                _id: 'guest-post',
                created_at: '2026-01-01T00:00:00.000Z',
                user: null,
                guest_id: 'guest-1',
                room_tags: ['guest-tag'],
              },
            ],
          },
        ],
      },
    });

    expect(wrapper.vm.getPreviousOwnPostTagIds()).to.deep.equal(['guest-tag']);
  });

  it('新規投稿の場合だけ自分の直前の投稿のタグをダイアログへ渡す', async () => {
    const wrapper = createWrapperWithMethods({
      methods: {
        ensureGuestRules: () => Promise.resolve(true),
        setTargetLangs: () => {},
        getPreviousOwnPostTagIds: () => ['prev'],
      },
      store: { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1', userId: 'user-1' } },
    });
    await wrapper.vm.showEditPostDialog(null, false, []);
    expect(wrapper.vm.dialogs.post.edit.previousOwnPostTagIds).to.deep.equal(['prev']);

    await wrapper.vm.showEditPostDialog({ _id: 'post-1' }, false, []);
    expect(wrapper.vm.dialogs.post.edit.previousOwnPostTagIds).to.deep.equal([]);
  });

  it('音注意ダイアログは共通復帰失敗時だけ音タグボタンへフォールバックする', () => {
    let fallbackCount = 0;
    const wrapper = createWrapperWithMethods({
      methods: {
        focusSoundTagButton: () => {
          fallbackCount += 1;
        },
      },
    });

    wrapper.vm.closeSoundCautionConfirm({ focusRestored: true });
    expect(fallbackCount).to.equal(0);

    wrapper.vm.closeSoundCautionConfirm({ focusRestored: false });
    expect(fallbackCount).to.equal(1);
  });

  it('タグ更新成功時は部分的なAPI応答で投稿全体を上書きしない', () => {
    let reconciledPost = null;
    const wrapper = createWrapperWithMethods({
      methods: {
        reconcilePostInFilters: (post) => {
          reconciledPost = post;
        },
      },
    });
    const updatedPost = { post_id: 'post-1', room_tags: ['tag-1'] };

    wrapper.vm.handleDialogEvent('successEditTag', updatedPost);

    expect(reconciledPost).to.equal(null);
  });

  it('ダイアログ成功データをタイムライン計測の固定操作へ変換する', () => {
    const reports = [];
    const wrapper = createWrapperWithMethods({
      methods: {
        reportTimelineOperation: (token, operation) => {
          reports.push({ token, operation });
          return true;
        },
      },
    });
    wrapper.vm.dialogs.post.edit.operationToken = 'post-edit';
    wrapper.vm.dialogs.post.delete.operationToken = 'post-delete';
    wrapper.vm.dialogs.supplement.edit.operationToken = 'supplement-edit';
    wrapper.vm.dialogs.supplement.edit.replyId = 'reply-1';

    wrapper.vm.postSaved({
      contentType: 'post',
      actionType: 'create',
      presentationAnimation: null,
      mediaType: 'image',
      previousTagIds: [],
      nextTagIds: ['tag-1'],
    });
    wrapper.vm.postDeleted({
      contentType: 'post',
      actionType: 'delete',
      presentationAnimation: 'move-and-erase',
      previousTagIds: ['tag-1'],
    });
    wrapper.vm.supplementQuickTextInserted({
      contentType: 'supplement',
      quickTextId: 'quick-1',
      quickTextLabel: '定型文',
    });

    expect(reports).to.deep.equal([
      {
        token: 'post-edit',
        operation: {
          kind: 'content_change',
          content: 'post',
          action: 'create',
          response: { animation: null },
          beforeTagIds: [],
          afterTagIds: ['tag-1'],
          newMainMediaType: 'image',
        },
      },
      {
        token: 'post-delete',
        operation: {
          kind: 'content_change',
          content: 'post',
          action: 'delete',
          before: { animation: 'move-and-erase' },
          beforeTagIds: ['tag-1'],
          afterTagIds: [],
        },
      },
      {
        token: 'supplement-edit',
        operation: {
          kind: 'quick_text_use',
          content: 'reply_supplement',
          quickText: { _id: 'quick-1', label: '定型文' },
        },
      },
    ]);
  });

  it('連続投稿では共有ストアのタグではなく、表示中の自分の直前の投稿のタグを使う', () => {
    const wrapper = createWrapperWithMethods({
      methods: {
        getPreviousOwnPostTagIds: () => ['visible-prev'],
      },
      store: {
        getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1', userId: 'user-1', tagList: ['store-tag'] },
      },
    });

    wrapper.vm.handleContinuousPost();

    expect(wrapper.vm.dialogs.post.edit.previousOwnPostTagIds).to.deep.equal(['visible-prev']);
  });

  it('handleContinuousPost は表示中に自分の投稿がなければタグを未選択にする', () => {
    const wrapper = createWrapperWithMethods({
      methods: {
        getPreviousOwnPostTagIds: () => [],
      },
      store: {
        getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1', userId: 'user-1', tagList: ['store-tag'] },
      },
    });

    wrapper.vm.handleContinuousPost();

    expect(wrapper.vm.dialogs.post.edit.previousOwnPostTagIds).to.deep.equal([]);
  });

  it('handleContinuousPost は絞り込みカラム由来タグを維持する', () => {
    const wrapper = createWrapperWithMethods({
      methods: {
        getPreviousOwnPostTagIds: () => ['visible-prev'],
      },
    });
    wrapper.vm.dialogs.post.edit.presetTagIds = ['preset'];

    wrapper.vm.handleContinuousPost();

    expect(wrapper.vm.dialogs.post.edit.presetTagIds).to.deep.equal(['preset']);
    expect(wrapper.vm.dialogs.post.edit.previousOwnPostTagIds).to.deep.equal(['visible-prev']);
  });

  it('created とタグ取得後の解析はクエリパラメータを反映する', () => {
    const wrapper = createWrapperWithCreated({
      route: {
        query: {
          lang: 'ja',
          reply: 'no',
          info: 'no',
          eyeFriendlyMode: 'on',
          tag: 't1,t2',
          tagOperator: 'and',
        },
        params: { post_id: 'p1' },
      },
      i18n: { locale: 'en' },
      store: { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1', userEyeFriendlyMode: false } },
    });

    expect(wrapper.vm.$i18n.locale).to.equal('ja');
    expect(wrapper.vm.ui.hideReply).to.equal(true);
    expect(wrapper.vm.ui.hideInfo).to.equal(true);
    expect(wrapper.vm.ui.localFontSize).to.equal('20px');
    expect(wrapper.vm.ui.localEnableTextAnimation).to.equal(false);
    wrapper.vm.room.tags = [
      { _id: 'tag-1', name: 't1' },
      { _id: 'tag-2', name: 't2' },
    ];
    wrapper.vm.applyTimelineQueryFilters(wrapper.vm.$route.query);

    expect(wrapper.vm.ui.localTagOperator).to.equal('and');
    expect(wrapper.vm.ui.localTagIds).to.deep.equal(['tag-1', 'tag-2']);
    expect(wrapper.vm.ui.queryFilters.active).to.equal(true);
    expect(wrapper.vm.ui.focusedPostId).to.equal('p1');
  });

  it('プロフィールの目にやさしいモード保存後に表示設定を再適用する', async () => {
    const getters = reactive({
      userIsLogin: true,
      roomId: 'r1',
      floorId: 'f1',
      userEyeFriendlyMode: false,
    });
    const appliedFontSizes = [];
    const wrapper = createWrapperWithMethods({
      store: { getters },
      methods: {
        applyStoredTimelineSettings() {
          appliedFontSizes.push(this.ui.localFontSize);
          this.timeline.fontSize = this.ui.localFontSize
            ? `font-size:${this.ui.localFontSize};`
            : 'font-size:14px;';
        },
      },
    });

    getters.userEyeFriendlyMode = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.ui.localFontSize).to.equal('20px');
    expect(wrapper.vm.ui.localEnableTextAnimation).to.equal(false);
    expect(wrapper.vm.timeline.fontSize).to.equal('font-size:20px;');

    getters.userEyeFriendlyMode = false;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.ui.localFontSize).to.equal(null);
    expect(wrapper.vm.ui.localEnableTextAnimation).to.equal(true);
    expect(wrapper.vm.timeline.fontSize).to.equal('font-size:14px;');
    expect(appliedFontSizes).to.deep.equal(['20px', null]);
  });

  it('目にやさしいモードのURL指定はプロフィール保存値より優先する', async () => {
    const getters = reactive({
      userIsLogin: true,
      roomId: 'r1',
      floorId: 'f1',
      userEyeFriendlyMode: true,
    });
    const wrapper = createWrapperWithMethods({
      query: { eyeFriendlyMode: 'on' },
      store: { getters },
    });

    getters.userEyeFriendlyMode = false;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.ui.localFontSize).to.equal('20px');
    expect(wrapper.vm.ui.localEnableTextAnimation).to.equal(false);
  });

  it('プロフィール言語保存後に翻訳対象を更新しルーム表示とSocketを再読込する', async () => {
    const getters = reactive({
      userIsLogin: true,
      roomId: 'r1',
      floorId: 'f1',
      floorTargetLangs: ['ja', 'en'],
      lang: 'ja',
      userEyeFriendlyMode: false,
    });
    const i18n = reactive({ locale: 'ja' });
    let refreshCount = 0;
    const reconnectOptions = [];
    const wrapper = createWrapperWithMethods({
      store: { getters },
      mocks: { $i18n: i18n, $t: (key) => key },
      methods: {
        refreshTranslatedRoomPresentation: () => {
          refreshCount += 1;
          return Promise.resolve(true);
        },
        requestSocketReconnect: (options) => {
          reconnectOptions.push(options);
          return Promise.resolve(null);
        },
      },
    });
    wrapper.vm.timelineResourcesReady = true;
    wrapper.vm.room.status = { languages: ['ja', 'en'] };

    // ProfileDialogでは言語選択時にlocaleが先に変わり、保存成功後にVuexが確定する。
    i18n.locale = 'en';
    getters.lang = 'en';
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(i18n.locale).to.equal('en');
    expect(wrapper.vm.timeline.targetLangs).to.deep.equal(['ja']);
    expect(refreshCount).to.equal(1);
    expect(reconnectOptions).to.deep.equal([{ force: true, reason: 'profile-language-change' }]);
  });

  it('言語のURL指定中はプロフィール保存後も指定言語を維持する', async () => {
    const getters = reactive({
      userIsLogin: true,
      roomId: 'r1',
      floorId: 'f1',
      floorTargetLangs: ['ja', 'en'],
      lang: 'ja',
      userEyeFriendlyMode: false,
    });
    const i18n = reactive({ locale: 'ja' });
    let refreshCount = 0;
    let reconnectCount = 0;
    const wrapper = createWrapperWithMethods({
      query: { lang: 'ja' },
      store: { getters },
      mocks: { $i18n: i18n, $t: (key) => key },
      methods: {
        refreshTranslatedRoomPresentation: () => {
          refreshCount += 1;
          return Promise.resolve(true);
        },
        requestSocketReconnect: () => {
          reconnectCount += 1;
          return Promise.resolve(null);
        },
      },
    });
    wrapper.vm.timelineResourcesReady = true;
    wrapper.vm.room.status = { languages: ['ja', 'en'] };

    // プロフィール詳細の取得による言語反映を、保存前のlocale変更で再現する。
    i18n.locale = 'en';
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(i18n.locale).to.equal('ja');
    expect(wrapper.vm.timeline.targetLangs).to.deep.equal(['en']);
    expect(refreshCount).to.equal(0);
    expect(reconnectCount).to.equal(0);

    // その後に保存してVuexの言語が確定しても、URL指定を維持する。
    getters.lang = 'en';
    await wrapper.vm.$nextTick();
    await flushPromises();

    expect(i18n.locale).to.equal('ja');
    expect(refreshCount).to.equal(0);
    expect(reconnectCount).to.equal(0);
  });

  it('言語変更後のルーム詳細再取得でフロアとルームの翻訳表示を更新する', async () => {
    const originalDetail = roomApi.detail;
    const dispatchCalls = [];
    const router = createVueRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/floor/:floor_id/room/:room_id', name: 'TimeLine', component: {} }],
    });
    await setTestRoute(router, {
      name: 'TimeLine',
      params: { floor_id: 'f1', room_id: 'r1' },
    }).isReady();
    roomApi.detail = ({ _id }) => {
      expect(_id).to.equal('r1');
      return Promise.resolve({
        data: {
          _id: 'r1',
          title: '元ルーム',
          description: '元説明',
          lang: 'ja',
          translations: [{ lang: 'en', title: 'Room', description: 'Description' }],
          floor: {
            _id: 'f1',
            title: '元フロア',
            lang: 'ja',
            translations: [{ lang: 'en', title: 'Floor' }],
          },
        },
      });
    };
    const wrapper = createWrapperWithMethods({
      router,
      store: {
        getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' },
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      mocks: { $i18n: { locale: 'en' }, $t: (key) => key },
    });

    try {
      const updated = await wrapper.vm.refreshTranslatedRoomPresentation();

      expect(updated).to.equal(true);
      expect(wrapper.vm.room.title).to.equal('Room');
      expect(wrapper.vm.room.description).to.equal('Description');
      expect(dispatchCalls).to.deep.include.members([
        { type: 'doUpdateFloorTitle', payload: { title: 'Floor' } },
        { type: 'doUpdateRoomTitle', payload: { title: 'Room' } },
      ]);
    } finally {
      roomApi.detail = originalDetail;
      wrapper.unmount();
    }
  });

  it('プロフィール保存後に表示中の本人ユーザスナップショットを同期する', async () => {
    const getters = reactive({
      userIsLogin: true,
      roomId: 'r1',
      floorId: 'f1',
      userId: 'user-1',
      userName: '旧名',
      userImageName: 'old.png',
    });
    const ownPostUser = { _id: 'user-1', username: '旧名', image_name: 'old.png' };
    const ownDialogUser = { _id: 'user-1', username: '旧名', image_name: 'old.png' };
    const otherUser = { _id: 'user-2', username: '別名', image_name: 'other.png' };
    const wrapper = createWrapperWithMethods({ store: { getters } });
    wrapper.vm.timeline.filters = [
      {
        conditions: null,
        posts: [{ user: ownPostUser, replies: [{ user: otherUser }] }],
      },
    ];
    wrapper.vm.dialogs.post.edit.value = { user: ownDialogUser };

    getters.userName = '新名';
    getters.userImageName = null;
    await wrapper.vm.$nextTick();

    expect(ownPostUser).to.deep.equal({ _id: 'user-1', username: '新名', image_name: null });
    expect(ownDialogUser).to.deep.equal({ _id: 'user-1', username: '新名', image_name: null });
    expect(otherUser).to.deep.equal({ _id: 'user-2', username: '別名', image_name: 'other.png' });
  });

  it('post_idのルート変更時はフォーカス対象を同期し、初期化済みなら詳細を取得する', () => {
    const fetchedPostIds = [];
    const wrapper = createWrapperWithMethods({
      methods: {
        fetchFocusPostAndAppend: (postId) => {
          fetchedPostIds.push(postId);
          return Promise.resolve();
        },
      },
    });
    const routePostWatcher = Timeline.watch['$route.params.post_id'];

    wrapper.vm.timelineResourcesReady = false;
    routePostWatcher.call(wrapper.vm, 'before-init');
    expect(wrapper.vm.ui.focusedPostId).to.equal('before-init');
    expect(fetchedPostIds).to.deep.equal([]);

    wrapper.vm.timelineResourcesReady = true;
    routePostWatcher.call(wrapper.vm, 'post-2');
    expect(wrapper.vm.ui.focusedPostId).to.equal('post-2');
    expect(fetchedPostIds).to.deep.equal(['post-2']);

    routePostWatcher.call(wrapper.vm, undefined);
    expect(wrapper.vm.ui.focusedPostId).to.equal(null);
    expect(fetchedPostIds).to.deep.equal(['post-2']);
  });

  it('post_id変更後に到着した古い詳細応答とエラーを反映しない', async () => {
    const originalFetchDetail = chatApi.fetchDetail;
    const requests = new Map();
    const snackbarCalls = [];
    chatApi.fetchDetail = ({ post_id: postId }) =>
      new Promise((resolve, reject) => requests.set(postId, { resolve, reject }));

    const wrapper = createWrapperWithMethods();
    wrapper.vm.timeline.filters = [{ conditions: null, posts: [] }];
    wrapper.vm.timelineResourcesReady = true;
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });

    try {
      wrapper.vm.handleRoutePostIdChange('post-a');
      wrapper.vm.handleRoutePostIdChange('post-b');
      requests.get('post-b').resolve({ data: { _id: 'post-b' } });
      await flushPromises();
      requests.get('post-a').resolve({ data: { _id: 'post-a' } });
      await flushPromises();

      expect(wrapper.vm.timeline.filters[0].posts.map(({ _id }) => _id)).to.deep.equal(['post-b']);

      wrapper.vm.handleRoutePostIdChange('post-c');
      wrapper.vm.handleRoutePostIdChange(undefined);
      requests.get('post-c').reject(new Error('stale request'));
      await flushPromises();
      expect(snackbarCalls).to.deep.equal([]);
    } finally {
      chatApi.fetchDetail = originalFetchDetail;
      wrapper.unmount();
    }
  });

  it('URLクエリ変更時は再解析してSocketを再接続する', () => {
    let reconnectCount = 0;
    let reconnectOptions = null;
    const wrapper = createWrapperWithMethods({
      methods: {
        requestSocketReconnect: (options) => {
          reconnectCount += 1;
          reconnectOptions = options;
          return Promise.resolve(null);
        },
      },
      store: {
        getters: {
          userIsLogin: true,
          roomId: 'r1',
          floorId: 'f1',
          lang: 'ja',
          userEyeFriendlyMode: false,
        },
      },
      mocks: { $i18n: { locale: 'ja' }, $t: (key) => key },
    });
    wrapper.vm.room.tags = [{ _id: 'tag-1', name: 'Tag1' }];
    wrapper.vm.timelineResourcesReady = true;

    wrapper.vm.handleRouteQueryChange({ tag: 'Tag1', col1_keyword: 'important' });

    expect(wrapper.vm.ui.queryFilters.globalConditions.tags).to.deep.equal(['tag-1']);
    expect(wrapper.vm.ui.queryFilters.filters).to.have.lengthOf(1);
    expect(wrapper.vm.ui.currentTabIndex).to.equal(0);
    expect(reconnectCount).to.equal(1);
    expect(reconnectOptions).to.deep.equal({ force: true, reason: 'query-change' });
  });

  it('表示専用クエリ変更時はSocketを再接続せず選択カラムを維持する', () => {
    let reconnectCount = 0;
    const wrapper = createWrapperWithMethods({
      methods: {
        requestSocketReconnect: () => {
          reconnectCount += 1;
          return Promise.resolve(null);
        },
      },
      store: {
        getters: {
          userIsLogin: true,
          roomId: 'r1',
          floorId: 'f1',
          lang: 'ja',
          userEyeFriendlyMode: false,
        },
      },
      mocks: { $i18n: { locale: 'ja' }, $t: (key) => key },
    });
    wrapper.vm.timelineResourcesReady = true;
    wrapper.vm.ui.currentTabIndex = 2;

    wrapper.vm.handleRouteQueryChange({ reply: 'no' }, { reply: 'yes' });

    expect(wrapper.vm.ui.hideReply).to.equal(true);
    expect(wrapper.vm.ui.currentTabIndex).to.equal(2);
    expect(reconnectCount).to.equal(0);
  });

  it('言語クエリ変更時はフロア・ルーム表示と翻訳対象言語を更新してSocketを再接続する', () => {
    let reconnectCount = 0;
    let presentationRefreshCount = 0;
    const i18n = { locale: 'ja' };
    const wrapper = createWrapperWithMethods({
      methods: {
        refreshTranslatedRoomPresentation: () => {
          presentationRefreshCount += 1;
          return Promise.resolve(true);
        },
        requestSocketReconnect: () => {
          reconnectCount += 1;
          return Promise.resolve(null);
        },
      },
      store: {
        getters: {
          userIsLogin: true,
          roomId: 'r1',
          floorId: 'f1',
          lang: 'ja',
          floorTargetLangs: ['ja', 'en'],
          userEyeFriendlyMode: false,
        },
      },
      mocks: { $i18n: i18n, $t: (key) => key },
    });
    wrapper.vm.timelineResourcesReady = true;
    wrapper.vm.room.status = { languages: ['ja', 'en'] };

    wrapper.vm.handleRouteQueryChange({ lang: 'en' }, { lang: 'ja' });

    expect(i18n.locale).to.equal('en');
    expect(wrapper.vm.timeline.targetLangs).to.deep.equal(['ja']);
    expect(presentationRefreshCount).to.equal(1);
    expect(reconnectCount).to.equal(1);
  });

  it('手動再接続はforce指定で専用再接続APIを呼ぶ', () => {
    let reconnectOptions = null;
    const wrapper = createWrapperWithMethods({
      methods: {
        requestSocketReconnect: (options) => {
          reconnectOptions = options;
          return Promise.resolve(null);
        },
      },
    });

    wrapper.vm.handleSocketReconnect();

    expect(reconnectOptions).to.deep.equal({ force: true, reason: 'manual' });
  });

  it('URL条件指定モードの編集は保存とPushFilter APIを実行しない', async () => {
    const dispatchCalls = [];
    const apiCalls = [];
    const analyticsOperations = [];
    const originalCreate = chatApi.createPushFilter;
    const originalUpdate = chatApi.updatePushFilter;
    const originalDelete = chatApi.deletePushFilter;
    chatApi.createPushFilter = () => {
      apiCalls.push('create');
    };
    chatApi.updatePushFilter = () => {
      apiCalls.push('update');
    };
    chatApi.deletePushFilter = () => {
      apiCalls.push('delete');
    };

    const wrapper = createWrapperWithMethods({
      methods: {
        captureTimelineOperation: () => 'filter-token',
        reportTimelineOperation: (token, operation) => {
          analyticsOperations.push({ token, operation: { ...operation } });
          return true;
        },
      },
      store: {
        getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' },
        dispatch: (...args) => dispatchCalls.push(args),
      },
    });
    wrapper.vm.ui.queryFilters.active = true;
    wrapper.vm.fetchTimelinePosts = () => {};
    const payload = {
      conditions: { keyword: 'temporary', keywordArray: ['temporary'] },
      webPush: true,
      showUserIcon: true,
    };

    try {
      await wrapper.vm.successCreateFilter(payload);
      wrapper.vm.timeline.filters[0].pushFilterId = 'push-1';
      await wrapper.vm.successUpdateFilter(0, { ...payload, webPush: false });
      expect(wrapper.vm.timeline.filters[0].pushFilterId).to.equal('push-1');
      await wrapper.vm.deleteFilter(0);

      expect(apiCalls).to.deep.equal([]);
      expect(dispatchCalls).to.deep.equal([]);
      expect(analyticsOperations.map(({ token, operation }) => ({
        token,
        kind: operation.kind,
        action: operation.action,
      }))).to.deep.equal([
        { token: 'filter-token', kind: 'filter_change', action: 'create' },
        { token: 'filter-token', kind: 'filter_change', action: 'update' },
        { token: 'filter-token', kind: 'filter_change', action: 'delete' },
      ]);
    } finally {
      chatApi.createPushFilter = originalCreate;
      chatApi.updatePushFilter = originalUpdate;
      chatApi.deletePushFilter = originalDelete;
    }
  });
  it('beforeUnmount はソケットと監視を解除する', async () => {
    const View = {
      ...Timeline,
      created() {},
      mounted() {},
    };
    const wrapper = shallowMount(View, {
      stubs: baseStubs,
      router: createRouterWithRoute(),
      mocks: {
        $store: { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1', lang: 'ja' } },
        $i18n: { locale: 'ja' },
        $t: (key) => key,
      },
    });

    let disconnected = 0;
    let cleanupCalled = 0;
    let analyticsClearCount = 0;
    let disconnectAfterCleanup = false;
    await wrapper.setData({
      infra: {
        socket: {
          disconnect: () => {
            disconnected += 1;
            disconnectAfterCleanup = cleanupCalled > 0;
          },
        },
        socketCleanup: () => {
          cleanupCalled += 1;
        },
        animationObserver: { disconnect: () => (disconnected += 1) },
        timelineContentObserver: { disconnect: () => (disconnected += 1) },
      },
    });
    wrapper.vm.scrollState = {
      observers: new Map([[1, { disconnect: () => (disconnected += 1) }]]),
      observedSentinels: new WeakSet(),
    };
    wrapper.vm.timelineAnalytics.tracker = {
      clear: () => {
        analyticsClearCount += 1;
      },
    };

    const originalSpeech = window.speechSynthesis;
    window.speechSynthesis = { cancel: () => {} };

    wrapper.unmount();

    window.speechSynthesis = originalSpeech;
    expect(cleanupCalled).to.equal(1);
    expect(disconnectAfterCleanup).to.equal(true);
    expect(disconnected).to.equal(4);
    expect(wrapper.vm.infra.timelineDisposed).to.equal(true);
    expect(wrapper.vm.infra.timelineLifecycleGeneration).to.equal(1);
    expect(analyticsClearCount).to.equal(1);
  });

  it('fetchTimelinePosts 失敗時はスナックバーを表示する', async () => {
    const originalFetch = chatApi.fetchPosts;
    chatApi.fetchPosts = () => Promise.reject(new Error('Network Error'));

    const wrapper = createWrapper({
      store: { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' } },
      mocks: { $t: (key) => key },
    });

    const snackbarCalls = [];
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    wrapper.vm.reevaluateAutoLoad = () => {};
    wrapper.vm.queueUpdateAnimationObserver = () => {};

    wrapper.setData({ timeline: { filters: [{ conditions: null, posts: [] }] } });
    await wrapper.vm.fetchTimelinePosts(0);

    expect(snackbarCalls[0].role).to.equal('alert');
    expect(snackbarCalls[0].message).to.equal('投稿の取得に失敗しました 処理に失敗しました');
    expect(wrapper.vm.timeline.filters[0]._sending).to.equal(undefined);

    chatApi.fetchPosts = originalFetch;
  });
  it('破棄後に完了した投稿取得結果は画面へ反映しない', async () => {
    const originalFetch = chatApi.fetchPosts;
    let resolveRequest;
    chatApi.fetchPosts = () => new Promise((resolve) => (resolveRequest = resolve));

    const wrapper = createWrapper({
      store: { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' } },
      mocks: { $t: (key) => key },
    });
    const snackbarCalls = [];
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    wrapper.vm.reevaluateAutoLoad = () => {};
    wrapper.vm.queueUpdateAnimationObserver = () => {};
    await wrapper.setData({ timeline: { filters: [{ conditions: null, posts: [] }] } });

    try {
      const request = wrapper.vm.fetchTimelinePosts(0);
      wrapper.vm.invalidateTimelineLifecycle();
      resolveRequest({ data: [{ _id: 'post-after-leave' }] });
      await request;

      expect(wrapper.vm.timeline.filters[0].posts).to.deep.equal([]);
      expect(snackbarCalls).to.deep.equal([]);
    } finally {
      chatApi.fetchPosts = originalFetch;
    }
  });

  it('計画的離脱中の投稿取得結果は反映せず取得中状態だけ解除する', async () => {
    const originalFetch = chatApi.fetchPosts;
    chatApi.fetchPosts = () => Promise.resolve({ data: [{ _id: 'post-after-leave' }] });

    const wrapper = createWrapper({
      store: { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' } },
      mocks: { $t: (key) => key },
    });
    const snackbarCalls = [];
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    wrapper.vm.reevaluateAutoLoad = () => {};
    wrapper.vm.queueUpdateAnimationObserver = () => {};
    await wrapper.setData({ timeline: { filters: [{ conditions: null, posts: [] }] } });

    try {
      beginPlannedPageLeave();
      await wrapper.vm.fetchTimelinePosts(0);
      expect(wrapper.vm.timeline.filters[0].posts).to.deep.equal([]);
      expect(wrapper.vm.timeline.filters[0]._sending).to.equal(undefined);
      expect(snackbarCalls).to.deep.equal([]);
    } finally {
      chatApi.fetchPosts = originalFetch;
    }
  });
  it('明示的にキャンセルした投稿取得はエラー表示しない', async () => {
    const originalFetch = chatApi.fetchPosts;
    chatApi.fetchPosts = () => Promise.reject({ code: 'ERR_CANCELED' });

    const wrapper = createWrapper({
      store: { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' } },
      mocks: { $t: (key) => key },
    });
    const snackbarCalls = [];
    wrapper.vm.setSnackbar = (message, role) => snackbarCalls.push({ message, role });
    wrapper.vm.reevaluateAutoLoad = () => {};
    wrapper.vm.queueUpdateAnimationObserver = () => {};
    await wrapper.setData({ timeline: { filters: [{ conditions: null, posts: [] }] } });

    try {
      await wrapper.vm.fetchTimelinePosts(0);
      expect(snackbarCalls).to.deep.equal([]);
      expect(wrapper.vm.timeline.filters[0]._sending).to.equal(undefined);
    } finally {
      chatApi.fetchPosts = originalFetch;
    }
  });

  it('fetchSoundTagで401エラー時はログアウトしてログイン画面へ遷移する', async () => {
    const originalFetch = tagApi.soundTag.fetch;
    tagApi.soundTag.fetch = () => Promise.reject({ response: { status: 401 } });
    const dispatchCalls = [];
    const pushCalls = [];
    const router = createRouter();
    router.push = (payload) => {
      pushCalls.push(payload);
      return Promise.resolve();
    };
    const wrapper = createWrapper({
      router,
      store: {
        getters: {
          userIsLogin: true,
          roomId: 'r1',
          floorId: 'f1',
        },
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      mocks: { $t: (key) => key },
    });

    try {
      wrapper.vm.fetchSoundTag();
      await flushPromises();

      expect(dispatchCalls.map((call) => call.type)).to.include('doLogout');
      expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
    } finally {
      tagApi.soundTag.fetch = originalFetch;
    }
  });

  it('isSocketConnect が true になると setupTimelineContentObserver を呼ぶ', async () => {
    const calls = [];
    const wrapper = createWrapperWithMethods({
      methods: {
        setupTimelineContentObserver: () => calls.push('setup'),
      },
    });

    wrapper.setData({ infra: { ...wrapper.vm.infra, isSocketConnect: true } });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(calls).to.deep.equal(['setup']);
  });

  it('filters 変更で queueUpdateAnimationObserver を呼ぶ', async () => {
    const calls = [];
    const wrapper = createWrapperWithMethods({
      methods: {
        queueUpdateAnimationObserver: () => calls.push('queue'),
      },
    });

    wrapper.setData({ timeline: { ...wrapper.vm.timeline, filters: [{ id: 'f1' }] } });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(calls.length).to.be.greaterThan(0);
  });

  it('タブ切替で queueUpdateAnimationObserver を呼ぶ', async () => {
    const calls = [];
    const wrapper = createWrapperWithMethods({
      methods: {
        queueUpdateAnimationObserver: () => calls.push('queue'),
      },
    });

    wrapper.setData({ ui: { ...wrapper.vm.ui, currentTabIndex: 1 } });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(calls).to.deep.equal(['queue']);
  });

  it('setTargetLangs は room.status が null でも例外を出さない', () => {
    const wrapper = createWrapper({
      store: {
        getters: {
          floorTargetLangs: ['ja', 'en'],
          userIsLogin: true,
          roomId: 'r1',
          floorId: 'f1',
        },
      },
      mocks: {
        $i18n: { locale: 'ja' },
      },
    });

    wrapper.setData({
      room: {
        ...wrapper.vm.room,
        status: null,
      },
    });

    expect(() => wrapper.vm.setTargetLangs()).to.not.throw();
    expect(wrapper.vm.timeline.targetLangs).to.deep.equal(['en']);
  });

  it('ルームメンバー脱退成功時はダイアログを閉じてルーム一覧へ遷移する', async () => {
    const pushCalls = [];
    const router = createRouter();
    router.push = (payload) => {
      pushCalls.push(payload);
      return Promise.resolve();
    };
    const wrapper = createWrapper({ router });
    await wrapper.setData({
      dialogs: {
        ...wrapper.vm.dialogs,
        roomMember: {
          ...wrapper.vm.dialogs.roomMember,
          leaveVisible: true,
        },
      },
    });

    wrapper.vm.successLeaveRoomMember();

    expect(wrapper.vm.dialogs.roomMember.leaveVisible).to.equal(false);
    expect(pushCalls).to.deep.equal([{ path: '/floor/f1' }]);
  });

  it('カラムのドラッグ終了時は親の絞り込み条件配列を並べ替えて保存する', async () => {
    const wrapper = createWrapper();
    const saveCalls = [];
    wrapper.vm.saveSortFilter = () => saveCalls.push(true);
    await wrapper.setData({
      timeline: {
        ...wrapper.vm.timeline,
        filters: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }],
      },
    });

    wrapper.vm.onDragEnd({ oldDraggableIndex: 0, newDraggableIndex: 2 });

    expect(wrapper.vm.timeline.filters.map((filter) => filter.id)).to.deep.equal(['f2', 'f3', 'f1']);
    expect(saveCalls).to.deep.equal([true]);
  });

  it('Splitpanes v4のresized データからカラム幅を保存して再評価する', async () => {
    const wrapper = createWrapper();
    const saveCalls = [];
    const reevaluatedIndexes = [];
    wrapper.vm.saveSortFilter = () => saveCalls.push(true);
    wrapper.vm.reevaluateAutoLoad = (index) => reevaluatedIndexes.push(index);
    await wrapper.setData({
      timeline: {
        ...wrapper.vm.timeline,
        filters: [{ id: 'f1', size: 50 }, { id: 'f2', size: 50 }],
      },
    });

    wrapper.vm.onPaneResized({
      panes: [
        { min: 1, max: 100, size: 35 },
        { min: 1, max: 100, size: 65 },
      ],
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.timeline.filters.map((filter) => filter.size)).to.deep.equal([35, 65]);
    expect(saveCalls).to.deep.equal([true]);
    expect(reevaluatedIndexes).to.deep.equal([0, 1]);
  });

  it('resized データが不正またはカラム件数を超えても例外や保存を発生させない', async () => {
    const wrapper = createWrapper();
    const saveCalls = [];
    wrapper.vm.saveSortFilter = () => saveCalls.push(true);
    await wrapper.setData({
      timeline: {
        ...wrapper.vm.timeline,
        filters: [{ id: 'f1', size: 100 }],
      },
    });

    expect(() => wrapper.vm.onPaneResized()).to.not.throw();
    expect(() => wrapper.vm.onPaneResized({ panes: [{ size: 'invalid' }, { size: 50 }] })).to.not.throw();

    expect(wrapper.vm.timeline.filters[0].size).to.equal(100);
    expect(saveCalls).to.deep.equal([]);
  });

  it('guest_reaction_only では N ショートカットで投稿ダイアログを開かない', async () => {
    const wrapper = createWrapper({
      store: { getters: { userIsLogin: false, roomId: 'r1', floorId: 'f1' } },
    });
    await wrapper.setData({
      room: {
        ...wrapper.vm.room,
        guestReactionOnly: true,
      },
    });

    const calls = [];
    wrapper.vm.showEditPostDialog = (...args) => calls.push(args);
    wrapper.vm.shortcutPushNkey({ key: 'n' });

    expect(calls).to.deep.equal([]);
  });

  it('通常ルームでは N ショートカットで投稿ダイアログを開く', async () => {
    const wrapper = createWrapper({
      store: { getters: { userIsLogin: true, roomId: 'r1', floorId: 'f1' } },
    });
    await wrapper.setData({
      room: {
        ...wrapper.vm.room,
        guestReactionOnly: false,
      },
    });

    const calls = [];
    wrapper.vm.showEditPostDialog = (...args) => calls.push(args);
    wrapper.vm.shortcutPushNkey({ key: 'n' });

    expect(calls).to.deep.equal([[null, false]]);
  });

  describe('文字入力中のショートカット抑止', () => {
    const prepareShortcuts = (overrides = {}) => {
      const wrapper = createWrapper(overrides);
      wrapper.vm.showEditPostDialog = vi.fn();
      wrapper.vm.showEditReplyDialog = vi.fn();
      wrapper.vm.getLatestReplyablePost = vi.fn(() => ({ _id: 'post-1' }));
      return wrapper;
    };

    const expectNoShortcut = (wrapper) => {
      expect(wrapper.vm.showEditPostDialog).not.toHaveBeenCalled();
      expect(wrapper.vm.showEditReplyDialog).not.toHaveBeenCalled();
    };

    it('共通ダイアログの名前入力中は反応せず、閉じた後は再び使える', async () => {
      const wrapper = prepareShortcuts({
        store: {
          getters: {
            userIsLogin: true,
            roomId: 'r1',
            floorId: 'f1',
            get inertAppContainer() { return appStore.getters.inertAppContainer; },
          },
        },
      });
      const dialog = mount(UiDialog, {
        props: { titleId: 'profile-title', initialFocus: '#username' },
        slots: {
          title: '<h2 id="profile-title">プロフィール</h2>',
          default: '<input id="username" aria-label="ユーザ名" />',
        },
      });
      const listener = wrapper.vm.shortcutPushNkey;
      document.addEventListener('keyup', listener);
      try {
        await dialog.setProps({ open: true });
        await flushPromises();
        const input = document.getElementById('username');
        input.focus();
        expect(appStore.getters.inertAppContainer).to.equal(true);
        for (const key of ['m', 'n', 'r']) {
          input.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
          document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        }
        expectNoShortcut(wrapper);
        expect(document.activeElement).to.equal(input);

        await dialog.setProps({ open: false });
        await flushPromises();
        expect(appStore.getters.inertAppContainer).to.equal(false);
        for (const key of ['m', 'n', 'r']) {
          document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        }
        expect(wrapper.vm.showEditPostDialog.mock.calls).to.deep.equal([[null, true], [null, false]]);
        expect(wrapper.vm.showEditReplyDialog).toHaveBeenCalledWith({ _id: 'post-1' }, null, null);
      } finally {
        document.removeEventListener('keyup', listener);
        dialog.unmount();
      }
    });

    it.each([
      ['入力欄', '<input />'],
      ['複数行入力欄', '<textarea></textarea>'],
      ['選択欄', '<select><option>名前</option></select>'],
      ['編集可能な領域', '<div contenteditable="true"><span>名前</span></div>'],
      ['プレーンテキストの編集領域', '<div contenteditable="plaintext-only"><span>名前</span></div>'],
      ['テキストボックス', '<div role="textbox"><span>名前</span></div>'],
      ['ダイアログ内のボタン', '<section role="dialog"><button>保存</button></section>'],
    ])('%sでのキー入力をショートカットとして扱わない', (_label, html) => {
      const wrapper = prepareShortcuts();
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      const target = host.querySelector('span, button, input, textarea, select');
      const listener = wrapper.vm.shortcutPushNkey;
      document.addEventListener('keyup', listener);
      try {
        for (const key of ['m', 'n', 'r']) {
          target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
        }
        expectNoShortcut(wrapper);
      } finally {
        document.removeEventListener('keyup', listener);
        host.remove();
      }
    });

    it.each([
      ['日本語変換中', { isComposing: true }],
      ['IME処理中のキーコード', { keyCode: 229 }],
      ['Ctrl併用', { ctrlKey: true }],
      ['Alt併用', { altKey: true }],
      ['Meta併用', { metaKey: true }],
      ['既に処理済み', { defaultPrevented: true }],
    ])('%sのキー入力ではダイアログを開かない', (_label, eventOptions) => {
      const wrapper = prepareShortcuts();
      for (const key of ['m', 'n', 'r']) {
        wrapper.vm.shortcutPushNkey({ key, ...eventOptions });
      }
      expectNoShortcut(wrapper);
    });

    it('Shiftで入力した大文字でも通常のショートカットを使える', () => {
      const wrapper = prepareShortcuts();
      for (const key of ['M', 'N', 'R']) {
        wrapper.vm.shortcutPushNkey({ key, shiftKey: true });
      }
      expect(wrapper.vm.showEditPostDialog.mock.calls).to.deep.equal([[null, true], [null, false]]);
      expect(wrapper.vm.showEditReplyDialog).toHaveBeenCalledWith({ _id: 'post-1' }, null, null);
    });
  });
});
