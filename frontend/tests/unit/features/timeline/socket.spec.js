import { expect, vi } from 'vitest';
import { bindSocketHandlers } from '@/features/timeline/socket';

describe('タイムラインのSocketイベント処理', () => {
  it.each([
    ['room', 'room_restricted', { name: 'Room', params: { floor_id: 'floor-a' } }],
    ['room', 'room_deleted', { name: 'Room', params: { floor_id: 'floor-a' } }],
    ['floor', 'floor_deleted', { name: 'Floor' }],
  ])('%sの%sで再接続を止め、ログアウトせず退避する', async (scope, reason, destination) => {
    const socket = createSocket();
    socket.disconnect = vi.fn();
    const ctx = { infra: {}, room: {}, dialogs: { sound: { tags: [] } }, timeline: { filters: [] }, ui: {},
      $refs: {}, $route: { params: { floor_id: 'floor-a' } },
      $router: { push: vi.fn().mockResolvedValue() }, $store: { getters: {}, dispatch: vi.fn() }, $t: (key) => key };
    bindSocketHandlers(socket, ctx);
    socket.handlers.ACCESS_REVOKED({ scope, reason });
    expect(socket.disconnect).toHaveBeenCalledOnce();
    expect(ctx.infra.socketDisposed).toBe(true);
    expect(ctx.infra.socketStatusTimerDisabled).toBe(true);
    expect(ctx.$router.push).toHaveBeenCalledWith(destination);
    expect(ctx.$store.dispatch).not.toHaveBeenCalledWith('doLogout');
  });
  const createSocket = () => ({
    handlers: {},
    offCalls: [],
    on(event, handler) {
      this.handlers[event] = handler;
      return this;
    },
    off(event, handler) {
      this.offCalls.push({ event, handler });
      if (this.handlers[event] === handler) {
        delete this.handlers[event];
      }
      return this;
    },
  });
  const stubConsoleError = () => {
    const consoleObject =
      (typeof window !== 'undefined' && window.console) || (typeof global !== 'undefined' && global.console);
    const calls = [];
    const original = consoleObject && consoleObject.error;
    if (consoleObject) {
      consoleObject.error = (...args) => {
        calls.push(args);
      };
    }
    return {
      calls,
      restore: () => {
        if (consoleObject) {
          consoleObject.error = original;
        }
      },
    };
  };

  it('bindSocketHandlers はハンドラ登録を行う', () => {
    const socket = createSocket();

    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
    };

    bindSocketHandlers(socket, ctx);

    expect(socket.handlers).to.have.property('connect');
    expect(socket.handlers).to.have.property('disconnect');
  });

  it('connect は条件ありフィルタのみの場合にデフォルトを追加しない', () => {
    const socket = createSocket();
    const consoleSpy = stubConsoleError();
    const dispatchCalls = [];
    let initialFetchCalled = false;
    let applyStoredTimelineSettingsCalled = false;
    let fetchFocusCalled = false;

    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: { localSpeech: true, focusedPostId: 'post-1' },
      $refs: {},
      $router: { push: () => {} },
      $store: {
        getters: {
          roomId: 'room-1',
          filters: {
            'room-1': [{ id: 'f1', size: { size: 10 }, conditions: { tag: 'x' }, posts: [{ _id: 'p1' }] }],
          },
        },
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
      $t: (key) => key,
      initialFetchAllColumns: () => {
        initialFetchCalled = true;
      },
      applyStoredTimelineSettings: () => {
        applyStoredTimelineSettingsCalled = true;
      },
      fetchFocusPostAndAppend: () => {
        fetchFocusCalled = true;
        throw new Error('focus fetch fail');
      },
    };

    try {
      bindSocketHandlers(socket, ctx);
      socket.handlers.connect();

      expect(ctx.timeline.filters).to.have.lengthOf(1);
      expect(ctx.timeline.filters[0].conditions).to.deep.equal({ tag: 'x' });
      expect(initialFetchCalled).to.equal(true);
      expect(applyStoredTimelineSettingsCalled).to.equal(true);
      expect(fetchFocusCalled).to.equal(true);
      expect(dispatchCalls[0].type).to.equal('doSetFilters');
      expect(dispatchCalls[0].payload.roomId).to.equal('room-1');
      expect(consoleSpy.calls).to.have.lengthOf(1);
      expect(consoleSpy.calls[0][0]).to.equal('failed to fetch focus post:');
    } finally {
      consoleSpy.restore();
    }
  });

  it('connect はフィルタが空の場合にデフォルトを追加する', () => {
    const socket = createSocket();
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: { localSpeech: false, focusedPostId: null },
      $refs: {},
      $router: { push: () => {} },
      $store: {
        getters: {
          roomId: 'room-1',
          filters: {
            'room-1': [],
          },
        },
        dispatch: () => {},
      },
      $t: (key) => key,
      initialFetchAllColumns: () => {},
      applyStoredTimelineSettings: () => {},
      fetchFocusPostAndAppend: () => {},
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.connect();

    expect(ctx.timeline.filters).to.have.lengthOf(1);
    expect(ctx.timeline.filters[0].conditions).to.equal(null);
  });

  it('connect は条件なしカラムがある場合に追加しない', () => {
    const socket = createSocket();
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: { localSpeech: false, focusedPostId: null },
      $refs: {},
      $router: { push: () => {} },
      $store: {
        getters: {
          roomId: 'room-1',
          filters: {
            'room-1': [{ id: 'f1', conditions: null, posts: [{ _id: 'p1' }], speech: false }],
          },
        },
        dispatch: () => {},
      },
      $t: (key) => key,
      initialFetchAllColumns: () => {},
      applyStoredTimelineSettings: () => {},
      fetchFocusPostAndAppend: () => {},
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.connect();

    expect(ctx.timeline.filters).to.have.lengthOf(1);
    expect(ctx.timeline.filters[0].conditions).to.equal(null);
    expect(ctx.timeline.filters[0].speech).to.equal(false);
    expect(ctx.timeline.filters[0].size).to.equal(100);
  });

  it('connect はURL指定カラムを使い保存済みフィルタを更新しない', () => {
    const socket = createSocket();
    const dispatchCalls = [];
    const queryFilter = {
      queryColumnNumber: 2,
      conditions: { keyword: 'query', keywordArray: ['query'] },
      posts: [{ _id: 'stale' }],
    };
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {
        localSpeech: false,
        focusedPostId: null,
        queryFilters: {
          active: true,
          hasColumnQueries: true,
          filters: [queryFilter],
        },
      },
      $refs: {},
      $router: { push: () => {} },
      $store: {
        getters: {
          roomId: 'room-1',
          filters: { 'room-1': [{ conditions: { keyword: 'saved' } }] },
        },
        dispatch: (...args) => dispatchCalls.push(args),
      },
      $t: (key) => key,
      initialFetchAllColumns: () => {},
      applyStoredTimelineSettings: () => {},
      fetchFocusPostAndAppend: () => {},
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.connect();

    expect(ctx.timeline.filters.map((filter) => filter.conditions)).to.deep.equal([null, queryFilter.conditions]);
    expect(ctx.timeline.filters[1].posts).to.deep.equal([]);
    expect(dispatchCalls).to.deep.equal([]);
  });
  it('POST_CREATE は音再生・読み上げ・filters追加を行う', () => {
    const socket = createSocket();
    const audioRef = {
      currentTime: 12,
      playCalls: 0,
      play() {
        this.playCalls += 1;
      },
    };
    const spoken = [];
    const win = global.window || (global.window = {});
    const originalSpeech = win.speechSynthesis;
    const originalUtterance = global.SpeechSynthesisUtterance;

    win.speechSynthesis = {
      speak: (utterance) => spoken.push(utterance),
    };
    global.SpeechSynthesisUtterance = function SpeechSynthesisUtterance() {
      this.text = '';
      this.lang = '';
      this.rate = 1;
    };

    let inserted = null;
    const ctx = {
      infra: {},
      room: { tags: ['tag-a'] },
      dialogs: { sound: { tags: ['tag-a'] } },
      timeline: { filters: [{ conditions: null, speech: true, posts: [] }] },
      ui: { localSpeech: false },
      $refs: { newAudio: audioRef },
      $store: { getters: { speechSpeed: 1 } },
      doesDataMatchConditions: () => true,
      insertNewToFiltersHead: (post) => {
        inserted = post;
      },
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.POST_CREATE({
      _id: 'p1',
      content: 'hello',
      lang: 'ja',
      room_tags: ['tag-a'],
    });

    expect(audioRef.currentTime).to.equal(0);
    expect(audioRef.playCalls).to.equal(1);
    expect(spoken).to.have.lengthOf(1);
    expect(inserted._id).to.equal('p1');

    win.speechSynthesis = originalSpeech;
    global.SpeechSynthesisUtterance = originalUtterance;
  });

  it('POST_CREATE は通知音の再生拒否後も投稿を追加して失敗を通知する', async () => {
    const socket = createSocket();
    const playbackErrors = [];
    let inserted = null;
    const ctx = {
      infra: {},
      room: { tags: ['tag-a'] },
      dialogs: { sound: { tags: ['tag-a'] } },
      timeline: { filters: [] },
      ui: { localSpeech: false },
      $refs: {
        newAudio: {
          currentTime: 5,
          play: () => Promise.reject(new Error('autoplay blocked')),
        },
      },
      $store: { getters: { speechSpeed: 1 } },
      handleNotificationAudioError: () => playbackErrors.push('error'),
      doesDataMatchConditions: () => false,
      insertNewToFiltersHead: (post) => {
        inserted = post;
      },
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.POST_CREATE({
      _id: 'p1',
      content: 'hello',
      lang: 'ja',
      room_tags: ['tag-a'],
    });
    await Promise.resolve();

    expect(inserted._id).to.equal('p1');
    expect(playbackErrors).to.deep.equal(['error']);
  });

  it('POST_CREATEとREPLY_CREATEは同じ通知音音声要素を再利用する', async () => {
    const socket = createSocket();
    const playbackTargets = [];
    const audioRef = {
      currentTime: 0,
      play() {
        playbackTargets.push(this);
        return Promise.resolve();
      },
    };
    const ctx = {
      infra: {},
      room: { tags: ['tag-a'], roomNotification: false },
      dialogs: { sound: { tags: ['tag-a'] } },
      timeline: { filters: [] },
      ui: { localSpeech: false },
      $refs: { newAudio: audioRef },
      $store: { getters: { speechSpeed: 1, userId: 'u1', guestId: null } },
      doesDataMatchConditions: () => false,
      insertNewToFiltersHead: () => {},
      reconcilePostInFilters: () => {},
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.POST_CREATE({
      _id: 'p1',
      content: 'post',
      lang: 'ja',
      room_tags: ['tag-a'],
    });
    socket.handlers.REPLY_CREATE({
      _id: 'p1',
      user: { _id: 'u1' },
      replies: [{ _id: 'r1', user: { _id: 'u2' }, content: 'reply', lang: 'ja', room_tags: ['tag-a'] }],
    });
    await Promise.resolve();

    expect(playbackTargets).to.deep.equal([audioRef, audioRef]);
  });

  it('REPLY_CREATE は通知カードを条件なし列へ配信する', () => {
    const socket = createSocket();
    let reconcileCalled = false;
    let ensured = false;
    const ctx = {
      infra: {},
      room: { tags: [], roomNotification: true },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [{ conditions: null, posts: [] }] },
      ui: { localSpeech: false },
      $refs: {},
      $store: { getters: { userId: 'u1', guestId: null } },
      ensurePostsArray: () => {
        ensured = true;
      },
      isSameParentNotification: () => false,
      reconcilePostInFilters: () => {
        reconcileCalled = true;
      },
      doesDataMatchConditions: () => false,
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.REPLY_CREATE({
      _id: 'p1',
      user: { _id: 'u1' },
      replies: [{ _id: 'r1', user: { _id: 'u2' }, content: 'reply', lang: 'ja' }],
    });

    expect(reconcileCalled).to.equal(true);
    expect(ensured).to.equal(true);
    expect(ctx.timeline.filters[0].posts).to.have.lengthOf(1);
    expect(ctx.timeline.filters[0].posts[0].replyNotification._id).to.equal('r1');
  });

  it('REPLY_UPDATE は notify_all 付きなら通知カードを条件なし列へ配信する', () => {
    const socket = createSocket();
    let reconcileCalled = false;
    let ensured = false;
    const ctx = {
      infra: {},
      room: { tags: [], roomNotification: true },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [{ conditions: null, posts: [] }] },
      ui: { localSpeech: false },
      $refs: {},
      $store: { getters: { userId: 'u1', guestId: null } },
      ensurePostsArray: () => {
        ensured = true;
      },
      isSameParentNotification: () => false,
      reconcilePostInFilters: () => {
        reconcileCalled = true;
      },
      doesDataMatchConditions: () => false,
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.REPLY_UPDATE({
      _id: 'p1',
      user: { _id: 'u1' },
      replies: [
        {
          _id: 'r1',
          user: { _id: 'u2' },
          content: 'reply',
          lang: 'ja',
          notify_all: true,
          notification_event_id: 'event-1',
        },
      ],
    });

    expect(reconcileCalled).to.equal(true);
    expect(ensured).to.equal(true);
    expect(ctx.timeline.filters[0].posts).to.have.lengthOf(1);
    expect(ctx.timeline.filters[0].posts[0].replyNotification._id).to.equal('r1');
    expect(ctx.timeline.filters[0].posts[0]._id).to.equal('p1:reply-notification:event-1');
  });

  it('REPLY_UPDATE は同じ通知イベントの再受信を除外し別の通知付き編集を追加する', () => {
    const socket = createSocket();
    const ctx = {
      infra: {},
      room: { tags: [], roomNotification: true },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [{ conditions: null, posts: [] }] },
      ui: { localSpeech: false },
      $refs: {},
      $store: { getters: { userId: 'u1', guestId: null } },
      ensurePostsArray: () => {},
      isSameParentNotification: () => false,
      reconcilePostInFilters: () => {},
      doesDataMatchConditions: () => false,
    };
    const buildPost = (eventId) => ({
      _id: 'p1',
      user: { _id: 'u1' },
      replies: [
        {
          _id: 'r1',
          user: { _id: 'u2' },
          content: 'reply',
          lang: 'ja',
          notify_all: true,
          notification_event_id: eventId,
        },
      ],
    });

    bindSocketHandlers(socket, ctx);
    socket.handlers.REPLY_UPDATE(buildPost('event-1'));
    socket.handlers.REPLY_UPDATE(buildPost('event-1'));
    socket.handlers.REPLY_UPDATE(buildPost('event-2'));

    expect(ctx.timeline.filters[0].posts).to.have.lengthOf(2);
    expect(ctx.timeline.filters[0].posts.map((post) => post._id)).to.deep.equal([
      'p1:reply-notification:event-2',
      'p1:reply-notification:event-1',
    ]);
  });

  it('REPLY_UPDATE の明示通知は親投稿が画面内に見えていても追加する', () => {
    const socket = createSocket();
    const timeline = document.createElement('div');
    const container = document.createElement('div');
    const parentPost = document.createElement('article');
    timeline.id = 'timeline-inner-0';
    container.className = 'timeline-content';
    parentPost.id = 'timeline_p1';
    container.getBoundingClientRect = () => ({ top: 0, bottom: 100 });
    parentPost.getBoundingClientRect = () => ({ top: 10, bottom: 40 });
    container.appendChild(parentPost);
    timeline.appendChild(container);
    document.body.appendChild(timeline);

    const ctx = {
      infra: {},
      room: { tags: [], roomNotification: true },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [{ conditions: null, posts: [] }] },
      ui: { localSpeech: false },
      $refs: {},
      $store: { getters: { userId: 'u1', guestId: null } },
      ensurePostsArray: () => {},
      isSameParentNotification: () => false,
      reconcilePostInFilters: () => {},
      doesDataMatchConditions: () => false,
    };

    try {
      bindSocketHandlers(socket, ctx);
      socket.handlers.REPLY_UPDATE({
        _id: 'p1',
        user: { _id: 'u1' },
        replies: [
          {
            _id: 'r1',
            user: { _id: 'u2' },
            notify_all: true,
            notification_event_id: 'event-visible-parent',
          },
        ],
      });

      expect(ctx.timeline.filters[0].posts).to.have.lengthOf(1);
    } finally {
      timeline.remove();
    }
  });

  it('REACTION_CREATE は通知カードを条件なし列へ配信する', () => {
    const socket = createSocket();
    let updateCalled = false;
    const ctx = {
      infra: {},
      room: { roomNotification: true },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [{ conditions: null, posts: [] }] },
      ui: {},
      $refs: {},
      $store: { getters: { userId: 'u1', guestId: null } },
      ensurePostsArray: () => {},
      isSameParentNotification: () => false,
      updateExistingInFilters: () => {
        updateCalled = true;
      },
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.REACTION_CREATE({
      _id: 'p1',
      user: { _id: 'u1' },
      reactions: [{ _id: 're1', user: { _id: 'u2' } }],
    });

    expect(updateCalled).to.equal(true);
    expect(ctx.timeline.filters[0].posts).to.have.lengthOf(1);
    expect(ctx.timeline.filters[0].posts[0].reactionNotification._id).to.equal('re1');
  });

  it('REPLY_CREATE は通知オフならカードを追加しない', () => {
    const socket = createSocket();
    let reconcileCalled = false;
    let ensured = false;
    const ctx = {
      infra: {},
      room: { tags: [], roomNotification: false },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [{ conditions: null, posts: [] }] },
      ui: { localSpeech: false },
      $refs: {},
      $store: { getters: { userId: 'u1', guestId: null } },
      ensurePostsArray: () => {
        ensured = true;
      },
      isSameParentNotification: () => false,
      reconcilePostInFilters: () => {
        reconcileCalled = true;
      },
      doesDataMatchConditions: () => false,
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.REPLY_CREATE({
      _id: 'p1',
      user: { _id: 'u1' },
      replies: [{ _id: 'r1', user: { _id: 'u2' }, content: 'reply', lang: 'ja' }],
    });

    expect(reconcileCalled).to.equal(true);
    expect(ensured).to.equal(false);
    expect(ctx.timeline.filters[0].posts).to.have.lengthOf(0);
  });

  it('REACTION_CREATE は自分以外の投稿なら通知しない', () => {
    const socket = createSocket();
    let updateCalled = false;
    let ensured = false;
    const ctx = {
      infra: {},
      room: { roomNotification: true },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [{ conditions: null, posts: [] }] },
      ui: {},
      $refs: {},
      $store: { getters: { userId: 'u1', guestId: null } },
      ensurePostsArray: () => {
        ensured = true;
      },
      isSameParentNotification: () => false,
      updateExistingInFilters: () => {
        updateCalled = true;
      },
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.REACTION_CREATE({
      _id: 'p1',
      user: { _id: 'u2' },
      reactions: [{ _id: 're1', user: { _id: 'u3' } }],
    });

    expect(updateCalled).to.equal(true);
    expect(ensured).to.equal(false);
    expect(ctx.timeline.filters[0].posts).to.have.lengthOf(0);
  });

  it('条件への所属が変わるイベントは reconcilePostInFilters を呼ぶ', () => {
    const socket = createSocket();
    const calls = [];
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $store: { getters: { speechSpeed: 1 } },
      doesDataMatchConditions: () => false,
      reconcilePostInFilters: (post) => {
        calls.push(post);
      },
    };

    bindSocketHandlers(socket, ctx);

    const post = {
      _id: 'p1',
      supplementaries: [{ _id: 's1', content: 'supp', lang: 'ja' }],
      replies: [{ _id: 'r1', supplementaries: [] }],
    };
    const supplement = { _id: 's2', content: 'reply-supp', lang: 'ja' };

    const events = [
      ['POST_UPDATE', [post]],
      ['SUPPLEMENT_CREATE', [post]],
      ['SUPPLEMENT_UPDATE', [post]],
      ['SUPPLEMENT_DELETE', [post]],
      ['REPLY_UPDATE', [post]],
      ['REPLY_DELETE', [post]],
      ['REPLY_SUPPLEMENT_CREATE', [post, supplement]],
      ['REPLY_SUPPLEMENT_UPDATE', [post]],
      ['REPLY_SUPPLEMENT_DELETE', [post]],
      ['TAG_UPDATE', [post]],
    ];

    events.forEach(([event, args]) => {
      socket.handlers[event](...args);
    });

    expect(calls).to.have.lengthOf(events.length);
  });

  it('リアクション系イベントは updateExistingInFilters を呼ぶ', () => {
    const socket = createSocket();
    const calls = [];
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      updateExistingInFilters: (post) => {
        calls.push(post);
      },
    };
    const post = { _id: 'p1', reactions: [{ _id: 're1' }] };

    bindSocketHandlers(socket, ctx);

    const events = [
      ['REACTION_DELETE', [post]],
      ['SUPPLEMENT_REACTION_CREATE', [post]],
      ['REPLY_REACTION_CREATE', [post]],
      ['REPLY_SUPPLEMENT_REACTION_CREATE', [post]],
    ];

    events.forEach(([event, args]) => {
      socket.handlers[event](...args);
    });

    expect(calls).to.have.lengthOf(events.length);
  });

  it('POST_DELETE は removeFromFilters を呼ぶ', () => {
    const socket = createSocket();
    let removedId = null;
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      removeFromFilters: (id) => {
        removedId = id;
      },
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.POST_DELETE({ _id: 'p9' });

    expect(removedId).to.equal('p9');
  });

  it('ROOM_STATUS_UPDATE はステータスと翻訳対象言語を更新する', () => {
    const socket = createSocket();
    let targetLangUpdateCount = 0;
    const ctx = {
      infra: {},
      room: { status: null },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      setTargetLangs: () => {
        targetLangUpdateCount += 1;
      },
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.ROOM_STATUS_UPDATE('open');

    expect(ctx.room.status).to.equal('open');
    expect(targetLangUpdateCount).to.equal(1);
  });

  it('RECEIVE_COMPLETE_DELETE_ROOM_MEMBER は削除処理を呼ぶ', () => {
    const socket = createSocket();
    let deleted = false;
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      deleteRoomMember: () => {
        deleted = true;
      },
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.RECEIVE_COMPLETE_DELETE_ROOM_MEMBER();

    expect(deleted).to.equal(true);
  });

  it('USER_ROLE_UPDATED はユーザロールを更新し、現在ルームの権限を再取得する', async () => {
    const socket = createSocket();
    const dispatchCalls = [];
    let refreshContext = null;
    const ctx = {
      infra: {},
      room: { isAdmin: false, isFloorEditor: true, isFloorMember: false, isRoomMember: false },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $store: {
        getters: { userIsLogin: true, floorId: 'floor-1', roomId: 'room-1' },
        dispatch: (type, payload) => dispatchCalls.push({ type, payload }),
      },
    };

    bindSocketHandlers(socket, ctx, {
      refreshRoomRole: (receivedContext) => {
        refreshContext = receivedContext;
        return Promise.resolve('Author');
      },
    });
    socket.handlers.USER_ROLE_UPDATED({ role: 'Author' });
    await Promise.resolve();

    expect(dispatchCalls).to.deep.equal([
      { type: 'doUpdateUserRole', payload: { role: 'Author' } },
      { type: 'doUpdateRoomRole', payload: { role: null } },
    ]);
    expect(ctx.room.isFloorEditor).to.equal(false);
    expect(refreshContext).to.equal(ctx);
  });

  it('USER_ROLE_UPDATED は不正なロール通知を無視する', () => {
    const socket = createSocket();
    const dispatchCalls = [];
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $store: { getters: {}, dispatch: (type, payload) => dispatchCalls.push({ type, payload }) },
    };

    bindSocketHandlers(socket, ctx, { refreshRoomRole: () => Promise.resolve() });
    socket.handlers.USER_ROLE_UPDATED({});

    expect(dispatchCalls).to.deep.equal([]);
  });

  it('errorイベントでエラー状態にし、一定時間後に接続エラーの帯を表示する', () => {
    const socket = createSocket();
    const consoleSpy = stubConsoleError();
    const timers = [];
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false },
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
    };

    try {
      bindSocketHandlers(socket, ctx, {
        schedule: (cb) => {
          timers.push(cb);
          return timers.length - 1;
        },
        cancel: (id) => {
          timers[id] = null;
        },
        addVisibilityListener: () => {},
        removeVisibilityListener: () => {},
        isDocumentHidden: () => false,
        statusVisibleDelayMs: 1,
      });
      socket.handlers.error();

      expect(ctx.infra.isSocketConnect).to.equal(false);
      expect(ctx.infra.socketStatus).to.equal('error');
      expect(ctx.infra.socketStatusVisible).to.equal(false);
      expect(timers).to.have.lengthOf(1);
      timers[0]();
      expect(ctx.infra.socketStatusVisible).to.equal(true);
      expect(consoleSpy.calls).to.have.lengthOf(1);
      expect(consoleSpy.calls[0][0]).to.equal('socket error');
    } finally {
      consoleSpy.restore();
    }
  });

  it('connect_error はステータスを connect_error に更新し、遅延後に黄帯を表示する', () => {
    const socket = createSocket();
    const consoleSpy = stubConsoleError();
    const timers = [];
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false },
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
    };

    try {
      bindSocketHandlers(socket, ctx, {
        schedule: (cb) => {
          timers.push(cb);
          return timers.length - 1;
        },
        cancel: (id) => {
          timers[id] = null;
        },
        addVisibilityListener: () => {},
        removeVisibilityListener: () => {},
        isDocumentHidden: () => false,
        statusVisibleDelayMs: 1,
      });
      socket.handlers.connect_error();

      expect(ctx.infra.isSocketConnect).to.equal(false);
      expect(ctx.infra.socketStatus).to.equal('connect_error');
      expect(ctx.infra.socketStatusVisible).to.equal(false);
      expect(timers).to.have.lengthOf(1);
      timers[0]();
      expect(ctx.infra.socketStatusVisible).to.equal(true);
      expect(consoleSpy.calls).to.have.lengthOf(1);
      expect(consoleSpy.calls[0][0]).to.equal('socket connect error');
    } finally {
      consoleSpy.restore();
    }
  });

  it('黄帯表示中に connect_error が再発しても黄帯を消さない', () => {
    const socket = createSocket();
    const consoleSpy = stubConsoleError();
    const timers = [];
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false },
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
    };

    try {
      bindSocketHandlers(socket, ctx, {
        schedule: (cb) => {
          timers.push(cb);
          return timers.length - 1;
        },
        cancel: (id) => {
          timers[id] = null;
        },
        addVisibilityListener: () => {},
        removeVisibilityListener: () => {},
        isDocumentHidden: () => false,
        statusVisibleDelayMs: 1,
      });

      socket.handlers.connect_error();
      expect(timers).to.have.lengthOf(1);
      timers[0]();
      expect(ctx.infra.socketStatusVisible).to.equal(true);

      socket.handlers.connect_error();
      expect(ctx.infra.socketStatusVisible).to.equal(true);
      expect(timers).to.have.lengthOf(1);
      expect(consoleSpy.calls).to.have.lengthOf(2);
    } finally {
      consoleSpy.restore();
    }
  });

  it('黄帯表示待機中に connect_error が再発しても表示タイマーを増やさない', () => {
    const socket = createSocket();
    const consoleSpy = stubConsoleError();
    const timers = [];
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false },
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
    };

    try {
      bindSocketHandlers(socket, ctx, {
        schedule: (cb) => {
          timers.push(cb);
          return timers.length - 1;
        },
        cancel: (id) => {
          timers[id] = null;
        },
        addVisibilityListener: () => {},
        removeVisibilityListener: () => {},
        isDocumentHidden: () => false,
        statusVisibleDelayMs: 1,
      });

      socket.handlers.connect_error();
      expect(ctx.infra.socketStatusVisible).to.equal(false);
      expect(timers).to.have.lengthOf(1);

      socket.handlers.connect_error();
      expect(ctx.infra.socketStatusVisible).to.equal(false);
      expect(timers).to.have.lengthOf(1);

      timers[0]();
      expect(ctx.infra.socketStatusVisible).to.equal(true);
      expect(consoleSpy.calls).to.have.lengthOf(2);
    } finally {
      consoleSpy.restore();
    }
  });

  it('disconnect はステータスを切断に更新し、遅延後に黄帯を表示して room.status をクリアする', () => {
    const socket = createSocket();
    const timers = [];
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false },
      room: { status: 'active' },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
    };

    bindSocketHandlers(socket, ctx, {
      schedule: (cb) => {
        timers.push(cb);
        return timers.length - 1;
      },
      cancel: (id) => {
        timers[id] = null;
      },
      addVisibilityListener: () => {},
      removeVisibilityListener: () => {},
      isDocumentHidden: () => false,
      statusVisibleDelayMs: 1,
    });
    socket.handlers.disconnect();

    expect(ctx.infra.isSocketConnect).to.equal(false);
    expect(ctx.infra.socketStatus).to.equal('disconnected');
    expect(ctx.infra.socketStatusVisible).to.equal(false);
    expect(timers).to.have.lengthOf(1);
    timers[0]();
    expect(ctx.infra.socketStatusVisible).to.equal(true);
    expect(ctx.room.status).to.equal(null);
  });

  it('hidden 中は黄帯表示を抑制し、可視復帰後に未接続なら再接続する', () => {
    const socket = createSocket();
    const timers = [];
    let hidden = true;
    let reconnectCount = 0;
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false },
      room: { status: 'active' },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
      requestSocketReconnect: () => {
        if (ctx.infra.socketRecoveryPending) return Promise.resolve(null);
        reconnectCount += 1;
        ctx.infra.socketRecoveryPending = true;
        ctx.infra.socketStatus = 'connecting';
        ctx.infra.socketStatusVisible = false;
        return Promise.resolve(null);
      },
    };

    bindSocketHandlers(socket, ctx, {
      schedule: (cb) => {
        timers.push(cb);
        return timers.length - 1;
      },
      cancel: (id) => {
        timers[id] = null;
      },
      addVisibilityListener: () => {},
      removeVisibilityListener: () => {},
      isDocumentHidden: () => hidden,
      statusVisibleDelayMs: 1,
    });

    socket.handlers.disconnect();
    expect(ctx.infra.socketStatusVisible).to.equal(false);
    expect(timers).to.have.lengthOf(0);

    hidden = false;
    ctx.infra.socketVisibilityChangeHandler();
    ctx.infra.socketVisibilityChangeHandler();
    expect(reconnectCount).to.equal(1);
    expect(ctx.infra.socketRecoveryPending).to.equal(true);
    expect(timers).to.have.lengthOf(0);
    expect(ctx.infra.socketStatusVisible).to.equal(false);
  });

  it('pageshow と online は未接続時だけ再接続し、連続イベントによる多重接続を防ぐ', () => {
    const socket = createSocket();
    const consoleSpy = stubConsoleError();
    const windowHandlers = {};
    const timers = [];
    let reconnectCount = 0;
    const ctx = {
      infra: { isSocketConnect: false, socketStatus: 'disconnected', socketStatusVisible: true, socket },
      room: { status: null },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
      requestSocketReconnect: () => {
        if (ctx.infra.socketRecoveryPending) return Promise.resolve(null);
        reconnectCount += 1;
        ctx.infra.socketRecoveryPending = true;
        ctx.infra.socketStatus = 'connecting';
        ctx.infra.socketStatusVisible = false;
        return Promise.resolve(null);
      },
    };

    bindSocketHandlers(socket, ctx, {
      addVisibilityListener: () => {},
      removeVisibilityListener: () => {},
      addWindowListener: (event, handler) => {
        windowHandlers[event] = handler;
      },
      removeWindowListener: () => {},
      isDocumentHidden: () => false,
      schedule: (cb) => {
        timers.push(cb);
        return timers.length - 1;
      },
      cancel: (id) => {
        timers[id] = null;
      },
    });

    try {
      windowHandlers.pageshow();
      windowHandlers.online();

      expect(reconnectCount).to.equal(1);
      expect(ctx.infra.socketStatusVisible).to.equal(false);

      socket.handlers.connect_error();
      windowHandlers.online();

      expect(reconnectCount).to.equal(2);
      expect(ctx.infra.socketStatus).to.equal('connecting');
      expect(ctx.infra.socketRecoveryPending).to.equal(true);
    } finally {
      consoleSpy.restore();
    }
  });

  it('表示中の通信切断は新しい接続で自動復旧する', () => {
    const socket = createSocket();
    const timers = [];
    let reconnectCount = 0;
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false, socket },
      room: { status: 'active' },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
      requestSocketReconnect: () => {
        reconnectCount += 1;
        ctx.infra.socketRecoveryPending = true;
        ctx.infra.socketStatus = 'connecting';
        return Promise.resolve(null);
      },
    };

    bindSocketHandlers(socket, ctx, {
      schedule: (cb) => {
        timers.push(cb);
        return timers.length - 1;
      },
      cancel: (id) => {
        timers[id] = null;
      },
      addVisibilityListener: () => {},
      removeVisibilityListener: () => {},
      addWindowListener: () => {},
      removeWindowListener: () => {},
      isDocumentHidden: () => false,
    });

    socket.handlers.disconnect('transport close');

    expect(reconnectCount).to.equal(1);
    expect(ctx.infra.socketStatus).to.equal('connecting');
    expect(ctx.infra.socketRecoveryPending).to.equal(true);
    expect(ctx.room.status).to.equal(null);
    expect(timers).to.have.lengthOf(0);
  });

  it('サーバによる強制切断時は自動再接続しない', () => {
    const socket = createSocket();
    const timers = [];
    let reconnectCount = 0;
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false, socket },
      room: { status: 'active' },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
      requestSocketReconnect: () => {
        reconnectCount += 1;
        return Promise.resolve(null);
      },
    };

    bindSocketHandlers(socket, ctx, {
      schedule: (cb) => {
        timers.push(cb);
        return timers.length - 1;
      },
      cancel: (id) => {
        timers[id] = null;
      },
      addVisibilityListener: () => {},
      removeVisibilityListener: () => {},
      addWindowListener: () => {},
      removeWindowListener: () => {},
      isDocumentHidden: () => false,
    });

    socket.handlers.disconnect('io server disconnect');

    expect(reconnectCount).to.equal(0);
    expect(ctx.infra.socketStatus).to.equal('disconnected');
    expect(ctx.room.status).to.equal(null);
    expect(timers).to.have.lengthOf(1);
  });

  it('pageshow は接続済みの場合に再接続しない', () => {
    const socket = { ...createSocket(), connected: true };
    const windowHandlers = {};
    let reconnectCount = 0;
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: true, socket },
      room: { status: 'active' },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
      requestSocketReconnect: () => {
        reconnectCount += 1;
        return Promise.resolve(null);
      },
    };

    bindSocketHandlers(socket, ctx, {
      addVisibilityListener: () => {},
      removeVisibilityListener: () => {},
      addWindowListener: (event, handler) => {
        windowHandlers[event] = handler;
      },
      removeWindowListener: () => {},
      isDocumentHidden: () => false,
    });

    windowHandlers.pageshow();

    expect(reconnectCount).to.equal(0);
    expect(ctx.infra.socketStatusVisible).to.equal(false);
  });

  it('旧ソケットの disconnect は現行ソケットが切り替わっている場合に無視する', () => {
    const socket = createSocket();
    const timers = [];
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false, socket },
      room: { status: 'active' },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
    };

    bindSocketHandlers(socket, ctx, {
      schedule: (cb) => {
        timers.push(cb);
        return timers.length - 1;
      },
      cancel: () => {},
      addVisibilityListener: () => {},
      removeVisibilityListener: () => {},
      isDocumentHidden: () => false,
      statusVisibleDelayMs: 1,
    });

    ctx.infra.socket = createSocket();
    socket.handlers.disconnect();

    expect(ctx.infra.isSocketConnect).to.equal(true);
    expect(ctx.infra.socketStatus).to.equal('connected');
    expect(ctx.room.status).to.equal('active');
    expect(timers).to.have.lengthOf(0);
  });

  it('終了時に表示状態のリスナーを解除し、接続エラー表示のタイマーを止める', () => {
    const socket = createSocket();
    const timers = [];
    let hidden = false;
    let visibilityHandler = null;
    const removeCalls = [];
    const windowHandlers = {};
    const removeWindowCalls = [];
    const ctx = {
      infra: { isSocketConnect: true, socketStatus: 'connected', socketStatusVisible: false },
      room: { status: 'active' },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
    };

    const cleanup = bindSocketHandlers(socket, ctx, {
      schedule: (cb) => {
        timers.push(cb);
        return timers.length - 1;
      },
      cancel: (id) => {
        timers[id] = null;
      },
      addVisibilityListener: (handler) => {
        visibilityHandler = handler;
      },
      removeVisibilityListener: (handler) => {
        removeCalls.push(handler);
      },
      addWindowListener: (event, handler) => {
        windowHandlers[event] = handler;
      },
      removeWindowListener: (event, handler) => {
        removeWindowCalls.push({ event, handler });
      },
      isDocumentHidden: () => hidden,
      statusVisibleDelayMs: 1,
    });

    socket.handlers.disconnect();
    expect(timers).to.have.lengthOf(1);
    expect(ctx.infra.socketStatusTimerId).to.equal(0);
    expect(ctx.infra.socketStatusVisible).to.equal(false);

    cleanup();
    expect(ctx.infra.socketStatusTimerId).to.equal(null);
    expect(ctx.infra.socketStatusVisible).to.equal(false);
    expect(ctx.infra.socketVisibilityChangeHandler).to.equal(null);
    expect(removeCalls).to.deep.equal([visibilityHandler]);
    expect(removeWindowCalls).to.deep.equal([
      { event: 'pageshow', handler: windowHandlers.pageshow },
      { event: 'online', handler: windowHandlers.online },
    ]);
    expect(socket.offCalls.length).to.be.greaterThan(0);
    expect(socket.handlers.disconnect).to.equal(undefined);

    hidden = false;
    if (typeof socket.handlers.disconnect === 'function') {
      socket.handlers.disconnect();
    }
    expect(timers).to.have.lengthOf(1);
  });

  it('再接続準備の後処理はSocketハンドラだけを外してブラウザ復帰リスナーを保持する', () => {
    const socket = createSocket();
    const removeVisibilityCalls = [];
    const removeWindowCalls = [];
    const ctx = {
      infra: { isSocketConnect: false, socketStatus: 'disconnected', socketStatusVisible: false, socket },
      room: { status: null },
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => key,
      requestSocketReconnect: () => Promise.resolve(null),
    };

    const cleanup = bindSocketHandlers(socket, ctx, {
      addVisibilityListener: () => {},
      removeVisibilityListener: (handler) => removeVisibilityCalls.push(handler),
      addWindowListener: () => {},
      removeWindowListener: (event, handler) => removeWindowCalls.push({ event, handler }),
      isDocumentHidden: () => false,
    });
    const visibilityHandler = ctx.infra.socketVisibilityChangeHandler;
    const pageShowHandler = ctx.infra.socketPageShowHandler;
    const onlineHandler = ctx.infra.socketOnlineHandler;

    cleanup({ preserveRecoveryListeners: true });

    expect(socket.handlers.disconnect).to.equal(undefined);
    expect(ctx.infra.socketVisibilityChangeHandler).to.equal(visibilityHandler);
    expect(ctx.infra.socketPageShowHandler).to.equal(pageShowHandler);
    expect(ctx.infra.socketOnlineHandler).to.equal(onlineHandler);
    expect(removeVisibilityCalls).to.deep.equal([]);
    expect(removeWindowCalls).to.deep.equal([]);
  });

  it('SESSION_REVOKED はログアウト完了後にログイン画面へ遷移する', async () => {
    const socket = createSocket();
    const dispatchCalls = [];
    const pushCalls = [];
    let resolveLogout;
    const logoutPromise = new Promise((resolve) => {
      resolveLogout = resolve;
    });
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: (payload) => pushCalls.push(payload) },
      $store: {
        getters: {},
        dispatch: (type, payload) => {
          dispatchCalls.push({ type, payload });
          return type === 'doLogout' ? logoutPromise : undefined;
        },
      },
      $t: (key) => key,
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.SESSION_REVOKED();

    expect(dispatchCalls.map((call) => call.type)).to.deep.equal(['doUpdateErrorMessage', 'doLogout']);
    expect(dispatchCalls[0].payload.message).to.equal('セッションが無効になりました。再度ログインしてください');
    expect(pushCalls).to.have.lengthOf(0);

    resolveLogout();
    await logoutPromise;
    await Promise.resolve();
    await Promise.resolve();

    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });

  it('SESSION_REVOKED はログアウトや画面遷移に失敗しても例外を送出しない', async () => {
    const socket = createSocket();
    const dispatchCalls = [];
    const pushCalls = [];
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: {
        push: (payload) => {
          pushCalls.push(payload);
          return Promise.reject(new Error('navigation failed'));
        },
      },
      $store: {
        getters: {},
        dispatch: (type, payload) => {
          dispatchCalls.push({ type, payload });
          if (type === 'doLogout') throw new Error('logout failed');
          return undefined;
        },
      },
      $t: (key) => key,
    };

    bindSocketHandlers(socket, ctx);

    expect(() => socket.handlers.SESSION_REVOKED()).not.to.throw();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(dispatchCalls.map((call) => call.type)).to.deep.equal(['doUpdateErrorMessage', 'doLogout']);
    expect(pushCalls).to.deep.equal([{ name: 'Login' }]);
  });

  it('KICKED_USER はエラー通知と遷移を行う', () => {
    const socket = createSocket();
    const dispatchCalls = [];
    const pushCalls = [];
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: (payload) => pushCalls.push(payload) },
      $store: { getters: {}, dispatch: (type, payload) => dispatchCalls.push({ type, payload }) },
      $t: (key) => key,
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.KICKED_USER();

    expect(dispatchCalls[0].type).to.equal('doUpdateErrorMessage');
    expect(pushCalls[0]).to.deep.equal({ name: 'Floor' });
  });

  it('TRANSLATION_ERRORは技術詳細を出さず翻訳済みalertを表示する', () => {
    const socket = createSocket();
    const snackbarCalls = [];
    const ctx = {
      infra: {},
      room: {},
      dialogs: { sound: { tags: [] } },
      timeline: { filters: [] },
      ui: {},
      $refs: {},
      $router: { push: () => {} },
      $store: { getters: {}, dispatch: () => {} },
      $t: (key) => `translated:${key}`,
      setSnackbar: (...args) => snackbarCalls.push(args),
    };

    bindSocketHandlers(socket, ctx);
    socket.handlers.TRANSLATION_ERROR({ failedLanguages: ['en'] });

    expect(snackbarCalls).to.deep.equal([
      ['translated:一部の言語への翻訳に失敗しました', 'alert'],
    ]);
  });
});
