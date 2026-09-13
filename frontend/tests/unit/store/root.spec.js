import { expect, vi } from 'vitest';
import root from '@/store/root';
import authApi from '@/api/auth';

const createState = () => JSON.parse(JSON.stringify(root.state));
const createLocalStorageMock = () => {
  let store = {};
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

if (typeof global !== 'undefined' && !global.localStorage) {
  const mock = createLocalStorageMock();
  global.localStorage = mock;
  if (typeof window !== 'undefined' && !window.localStorage) {
    window.localStorage = mock;
  }
}

let logoutSpy;
beforeEach(() => { logoutSpy = vi.spyOn(authApi, 'logout').mockResolvedValue({ status: 204 }); });

describe('ストアのユーザ情報と設定管理', () => {
  afterEach(() => {
    localStorage.removeItem('iseeetl_store');
  });

  it('setLoginUser はユーザ状態を更新する', () => {
    const state = createState();
    root.mutations.setLoginUser(state, {
      id: 'user-1',
      role: 'Administrator',
      name: 'User',
      lang: 'ja',
      imageName: 'img.png',
      token: 'token',
      eyeFriendlyMode: true,
      pushEnabled: true,
      replyPushEnabled: false,
      repliedPostPushEnabled: false,
    });

    expect(state.user.id).to.equal('user-1');
    expect(state.user.role).to.equal('Administrator');
    expect(state.user.isLogin).to.equal(true);
    expect(state.user.replyPushEnabled).to.equal(false);
  });

  it('setUserToken はログイン中ユーザのJWTだけを更新する', () => {
    const state = createState();
    state.user.isLogin = true;
    state.user.token = 'old-token';

    root.mutations.setUserToken(state, 'new-token');

    expect(state.user.token).to.equal('new-token');
    expect(state.user.isLogin).to.equal(true);
  });

  it('doUpdateUserToken はsetUserTokenをコミットする', () => {
    const calls = [];
    root.actions.doUpdateUserToken({ commit: (type, payload) => calls.push({ type, payload }) }, 'new-token');
    expect(calls).to.deep.equal([{ type: 'setUserToken', payload: 'new-token' }]);
  });

  it('setUserRoleとdoUpdateUserRoleはログイン状態を維持してロールだけを更新する', () => {
    const state = createState();
    state.user.isLogin = true;
    state.user.role = 'Editor';
    root.mutations.setUserRole(state, { role: 'Author' });

    expect(state.user.role).to.equal('Author');
    expect(state.user.isLogin).to.equal(true);

    const calls = [];
    root.actions.doUpdateUserRole({ commit: (type, payload) => calls.push({ type, payload }) }, { role: 'developer' });
    expect(calls).to.deep.equal([{ type: 'setUserRole', payload: { role: 'developer' } }]);
  });

  it('setUserIdentityとdoUpdateUserIdentityは表示用の本人情報だけを更新する', () => {
    const state = createState();
    state.user.name = 'Old';
    state.user.imageName = 'old.png';
    state.user.lang = 'ja';

    root.mutations.setUserIdentity(state, { name: 'New', imageName: null });

    expect(state.user.name).to.equal('New');
    expect(state.user.imageName).to.equal(null);
    expect(state.user.lang).to.equal('ja');

    const calls = [];
    root.actions.doUpdateUserIdentity(
      { commit: (type, payload) => calls.push({ type, payload }) },
      { name: 'Next', imageName: 'next.png' }
    );
    expect(calls).to.deep.equal([
      { type: 'setUserIdentity', payload: { name: 'Next', imageName: 'next.png' } },
    ]);
  });

  it('setProfile はプロフィール情報を更新する', () => {
    const state = createState();
    root.mutations.setProfile(state, {
      name: 'New',
      imageName: 'img.png',
      lang: 'en',
      eyeFriendlyMode: true,
      pushEnabled: true,
      replyPushEnabled: false,
      repliedPostPushEnabled: false,
    });

    expect(state.user.name).to.equal('New');
    expect(state.user.imageName).to.equal('img.png');
    expect(state.user.lang).to.equal('en');
    expect(state.user.eyeFriendlyMode).to.equal(true);
    expect(state.user.pushEnabled).to.equal(true);
    expect(state.user.replyPushEnabled).to.equal(false);
    expect(state.user.repliedPostPushEnabled).to.equal(false);
  });

  it('本人の表示名と画像は最新プロフィールを優先し、他ユーザは取得済み情報を維持する', () => {
    const state = createState();
    state.user.id = 'user-1';
    state.user.isLogin = true;
    state.user.name = '最新の名前';
    state.user.imageName = null;

    const ownSnapshot = { _id: 'user-1', username: '以前の名前', image_name: 'old.png' };
    const otherSnapshot = { _id: 'user-2', username: '別ユーザ', image_name: 'other.png' };

    expect(root.getters.resolveUserDisplayName(state)(ownSnapshot)).to.equal('最新の名前');
    expect(root.getters.resolveUserDisplayImageName(state)(ownSnapshot)).to.equal(null);
    expect(root.getters.resolveUserDisplayName(state)(otherSnapshot)).to.equal('別ユーザ');
    expect(root.getters.resolveUserDisplayImageName(state)(otherSnapshot)).to.equal('other.png');
  });

  it('未ログイン時はIDが一致しても取得済みユーザ情報を表示する', () => {
    const state = createState();
    state.user.id = 'user-1';
    state.user.isLogin = false;
    state.user.name = '保存値';
    state.user.imageName = 'saved.png';
    const snapshot = { _id: 'user-1', username: '取得値', image_name: 'fetched.png' };

    expect(root.getters.resolveUserDisplayName(state)(snapshot)).to.equal('取得値');
    expect(root.getters.resolveUserDisplayImageName(state)(snapshot)).to.equal('fetched.png');
  });

  it('setGuestUser はゲスト情報を設定する', () => {
    const state = createState();
    root.mutations.setGuestUser(state, {
      guest_id: 'guest-1',
      guest_name: 'Guest',
      lang: 'ja',
      guest_token: 'token-guest',
    });

    expect(state.user.guestId).to.equal('guest-1');
    expect(state.user.guestName).to.equal('Guest');
    expect(state.user.lang).to.equal('ja');
    expect(state.user.guestToken).to.equal('token-guest');
  });

  it('setGuestUser は guest_token が無い場合に既存値を維持する', () => {
    const state = createState();
    state.user.guestToken = 'token-keep';

    root.mutations.setGuestUser(state, {
      guest_id: 'guest-2',
      guest_name: 'Guest2',
      lang: 'en',
    });

    expect(state.user.guestId).to.equal('guest-2');
    expect(state.user.guestToken).to.equal('token-keep');
  });

  it('ログアウトはユーザ情報と保存データをクリアする', () => {
    const state = createState();
    state.user.id = 'user-1';
    state.user.isLogin = true;
    state.floor.id = 'floor-1';
    state.tag.list = ['tag-1'];
    state.tagClipboard.list = ['tag-2'];
    localStorage.setItem('iseeetl_store', JSON.stringify({ foo: 'bar' }));

    root.mutations.logout(state);

    expect(state.user.id).to.equal(null);
    expect(state.user.isLogin).to.equal(false);
    expect(state.floor.id).to.equal(null);
    expect(state.tag.list).to.deep.equal([]);
    expect(state.tagClipboard.list).to.deep.equal([]);
    expect(localStorage.getItem('iseeetl_store')).to.equal(null);
  });

  it('setTagClipboardList はタグコピー状態を更新する', () => {
    const state = createState();
    root.mutations.setTagClipboardList(state, { list: ['tag-1'] });

    expect(root.getters.tagClipboardList(state)).to.deep.equal(['tag-1']);
  });

  it('setTagClipboardList は配列以外なら空にする', () => {
    const state = createState();
    state.tagClipboard.list = ['tag-1'];

    root.mutations.setTagClipboardList(state, { list: null });

    expect(state.tagClipboard.list).to.deep.equal([]);
  });

  it('setFilters はroomId単位で追加/削除する', () => {
    const state = createState();
    root.mutations.setFilters(state, { roomId: 'room-1', filters: [{ conditions: null }] });
    expect(state.filters['room-1']).to.deep.equal([{ conditions: null }]);

    root.mutations.setFilters(state, { roomId: 'room-1', filters: [] });
    expect(state.filters['room-1']).to.equal(undefined);
  });

  it('バージョンがない旧形式の保存データでは型が正しい既知の項目だけを復元する', () => {
    const state = createState();
    const stored = {
      user: {
        id: 'user-9',
        role: 'Administrator',
        name: 'User',
        lang: 'ja',
        isLogin: true,
        token: 'token',
      },
      floor: { id: 'floor-9', title: 'Floor', targetLangs: ['ja'] },
      room: { id: 'room-9', title: 'Room', memberOnly: true, role: 'Member' },
      tag: { list: ['tag-1'] },
      tagClipboard: { list: ['copied-tag'] },
      setting: { speechSpeed: 2, displayName: false, displayAISupplement: false },
      error: { message: 'error' },
    };
    localStorage.setItem('iseeetl_store', JSON.stringify(stored));

    root.mutations.loadState(state);

    expect(state.user.id).to.equal('user-9');
    expect(state.user.isLogin).to.equal(true);
    expect(state.floor.title).to.equal('Floor');
    expect(state.room.memberOnly).to.equal(true);
    expect(state.tag.list).to.deep.equal(['tag-1']);
    expect(state.tagClipboard.list).to.deep.equal([]);
    expect(state.setting.speechSpeed).to.equal(2);
    expect(state.setting).not.to.have.property('displayAISupplement');
    expect(state.error.message).to.equal('error');
  });

  it('保存領域の取得・解析・保存に失敗しても例外を外へ返さない', () => {
    const state = createState();
    localStorage.setItem('iseeetl_store', '{bad json');

    root.mutations.loadState(state);

    const originalGetItem = localStorage.getItem;
    localStorage.getItem = () => {
      throw new Error('get failed');
    };
    try {
      root.mutations.loadState(state);
    } finally {
      localStorage.getItem = originalGetItem;
    }

    let subscriber = null;
    root.plugins[0]({
      subscribe: (fn) => {
        subscriber = fn;
      },
    });
    const originalSetItem = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('set failed');
    };
    try {
      subscriber({ type: 'setFloorId' }, state);
    } finally {
      localStorage.setItem = originalSetItem;
    }

    expect(state.user.id).to.equal(null);
    expect(state.floor.id).to.equal(null);
  });

  it('loadState は不完全なユーザ識別情報を復元せず非認証項目を保持する', () => {
    const state = createState();
    state.user.lang = 'ja';
    state.floor.title = 'keep';

    localStorage.setItem('iseeetl_store', JSON.stringify({ user: { id: 'user-1' } }));

    root.mutations.loadState(state);

    expect(state.user.id).to.equal(null);
    expect(state.user.token).to.equal(null);
    expect(state.user.isLogin).to.equal(false);
    expect(state.user.lang).to.equal('ja');
    expect(state.floor.title).to.equal('keep');
  });

  it('saveState はversion 1の許可リストだけを保存してloadStateで復元する', () => {
    const plugin = root.plugins[0];
    let subscriber = null;
    plugin({
      subscribe: (fn) => {
        subscriber = fn;
      },
    });

    const state = createState();
    state.user.guestToken = 'guest-token';
    Object.assign(state.user, {
      id: 'user-1',
      role: 'Author',
      name: 'User',
      token: 'user-token',
      isLogin: true,
      guestId: null,
      guestName: null,
    });
    state.guestCache.guestToken = 'guest-cache-token';
    state.tagClipboard.list = ['copied-tag'];
    state.floor.id = 'floor-1';
    state.message.politeMessage = 'runtime-message';
    state.inertAppContainer = true;
    state.unknownRuntime = true;
    state.filters = { 'room-1': [{ id: undefined, size: undefined, conditions: null }] };

    subscriber({ type: 'setFloorId' }, state);

    const stored = JSON.parse(localStorage.getItem('iseeetl_store'));
    expect(stored.schemaVersion).to.equal(1);
    expect(stored.user).to.not.have.property('guestToken');
    expect(stored.guestCache).to.not.have.property('guestToken');
    expect(stored).to.not.have.property('capabilities');
    expect(stored).to.not.have.property('tagClipboard');
    expect(stored).to.not.have.property('message');
    expect(stored).to.not.have.property('inertAppContainer');
    expect(stored).to.not.have.property('unknownRuntime');
    expect(stored.user.token).to.equal('user-token');
    expect(stored.floor.id).to.equal('floor-1');
    expect(stored.filters).to.deep.equal({ 'room-1': [{ conditions: null }] });

    const restored = createState();
    root.mutations.loadState(restored);
    expect(restored.user.id).to.equal('user-1');
    expect(restored.user.token).to.equal('user-token');
    expect(restored.user.isLogin).to.equal(true);
    expect(restored.floor.id).to.equal('floor-1');
    expect(restored.filters).to.deep.equal({ 'room-1': [{ conditions: null }] });
  });

  it('未知のバージョンや通常のオブジェクト以外の保存データは全体を無視する', () => {
    for (const stored of [
      { schemaVersion: 2, user: { id: 'unknown', isLogin: false } },
      { schemaVersion: '1', user: { id: 'string-version', isLogin: false } },
      null,
      [],
    ]) {
      const state = createState();
      state.floor.title = 'keep';
      localStorage.setItem('iseeetl_store', JSON.stringify(stored));

      root.mutations.loadState(state);

      expect(state.user.id).to.equal(null);
      expect(state.floor.title).to.equal('keep');
    }
  });

  it('loadState は不正グループと型を無視しstring配列の正しい要素だけを復元する', () => {
    const state = createState();
    state.floor.title = 'keep';
    localStorage.setItem(
      'iseeetl_store',
      JSON.stringify({
        schemaVersion: 1,
        user: null,
        floor: { id: 42, title: false, targetLangs: ['ja', 1, 'en'] },
        room: [],
        tag: { list: ['tag-1', null, 'tag-2'] },
        setting: { speechSpeed: 'fast', displayName: 'yes', animationSpeed: 'slow' },
      })
    );

    root.mutations.loadState(state);

    expect(state.floor.id).to.equal(null);
    expect(state.floor.title).to.equal('keep');
    expect(state.floor.targetLangs).to.deep.equal(['ja', 'en']);
    expect(state.tag.list).to.deep.equal(['tag-1', 'tag-2']);
    expect(state.setting.speechSpeed).to.equal(1);
    expect(state.setting.displayName).to.equal(true);
    expect(state.setting.animationSpeed).to.equal('slow');
  });

  it('未ログインの保存データではユーザ認証情報を捨て、ゲスト情報だけを復元する', () => {
    const state = createState();
    localStorage.setItem(
      'iseeetl_store',
      JSON.stringify({
        schemaVersion: 1,
        user: {
          id: 'stale-user',
          role: 'Author',
          token: 'stale-token',
          isLogin: false,
          guestId: 'guest-1',
          guestName: 'Guest',
          lang: 'en',
        },
      })
    );

    root.mutations.loadState(state);

    expect(state.user.id).to.equal(null);
    expect(state.user.role).to.equal(null);
    expect(state.user.token).to.equal(null);
    expect(state.user.isLogin).to.equal(false);
    expect(state.user.guestId).to.equal('guest-1');
    expect(state.user.guestName).to.equal('Guest');
    expect(state.user.lang).to.equal('en');
  });

  it('loadState はfiltersとguestSoundTagsの不正エントリだけを捨てる', () => {
    const state = createState();
    localStorage.setItem(
      'iseeetl_store',
      JSON.stringify({
        schemaVersion: 1,
        filters: {
          'room-1': [
            { id: 'valid', size: 2, conditions: null, speech: true },
            { id: 'bad-size', size: '2', conditions: null },
            { id: 'bad-tags', conditions: { tags: ['tag', 1] } },
            { id: 'valid-conditions', conditions: { tags: ['tag'], displayOrder: [{ key: 'createdAt' }] } },
          ],
          '': [{ conditions: null }],
          'room-2': 'not-array',
        },
        guestSoundTags: [
          { roomId: 'room-1', soundTags: ['sound-1'] },
          { roomId: '', soundTags: [] },
          { roomId: 'room-2', soundTags: ['sound-2', 2] },
        ],
      })
    );

    root.mutations.loadState(state);

    expect(state.filters).to.deep.equal({
      'room-1': [
        { id: 'valid', size: 2, conditions: null, speech: true },
        { id: 'valid-conditions', conditions: { tags: ['tag'], displayOrder: [{ key: 'createdAt' }] } },
      ],
    });
    expect(state.guestSoundTags).to.deep.equal([{ roomId: 'room-1', soundTags: ['sound-1'] }]);
  });

  it('saveState はログアウトの場合に保存しない', () => {
    const plugin = root.plugins[0];
    let subscriber = null;
    plugin({
      subscribe: (fn) => {
        subscriber = fn;
      },
    });

    localStorage.setItem('iseeetl_store', JSON.stringify({ keep: true }));
    subscriber({ type: 'logout' }, createState());

    const stored = JSON.parse(localStorage.getItem('iseeetl_store'));
    expect(stored.keep).to.equal(true);
  });

  it('保存領域の削除に失敗してもメモリ上の状態を初期化し、ゲスト認証を確保する', async () => {
    const state = createState();
    Object.assign(state.user, { id: 'user-1', role: 'Author', token: 'token', isLogin: true });
    const originalRemoveItem = localStorage.removeItem;
    const originalOneSignal = window.OneSignal;
    const calls = [];
    localStorage.removeItem = () => {
      throw new Error('remove failed');
    };
    window.OneSignal = { logout: () => Promise.resolve() };

    try {
      await root.actions.doLogout({
        rootState: state,
        getters: { userIsLogin: true },
        commit: (type, payload) => root.mutations[type](state, payload),
        dispatch: (type) => {
          calls.push(type);
          return Promise.resolve();
        },
      });
    } finally {
      localStorage.removeItem = originalRemoveItem;
      window.OneSignal = originalOneSignal;
    }

    expect(state.user.id).to.equal(null);
    expect(state.user.isLogin).to.equal(false);
    expect(calls).to.deep.equal(['doEnsureGuestAuth']);
  });

  it('setTimeLineSetting は設定をまとめて更新する', () => {
    const state = createState();
    root.mutations.setTimeLineSetting(state, {
      speechSpeed: 2,
      displayName: false,
      displayDate: false,
      displayTag: false,
      displaySupplement: false,
      displayActionButton: false,
      enableTextAnimation: false,
      animationSpeed: 'fast',
      displayUserKickButton: false,
    });

    expect(state.setting.speechSpeed).to.equal(2);
    expect(state.setting.displayName).to.equal(false);
    expect(state.setting.enableTextAnimation).to.equal(false);
    expect(state.setting.animationSpeed).to.equal('fast');
    expect(state.setting.displayUserKickButton).to.equal(false);
  });

  it('状態更新アクションは対応するミューテーションへ値を渡す', () => {
    const calls = [];
    const commit = (type, payload) => calls.push({ type, payload });

    const cases = [
      ['doUpdateFloorId', 'setFloorId', { id: 'f1' }],
      ['doUpdateRoomId', 'setRoomId', { id: 'r1' }],
      ['doUpdateTagList', 'setTagList', { list: ['t1'] }],
      ['doSetTagClipboardList', 'setTagClipboardList', { list: ['t2'] }],
      ['doUpdateErrorMessage', 'setErrorMessage', { message: 'err' }],
      ['doSetFilters', 'setFilters', { roomId: 'r1', filters: [] }],
      ['doSetTempRoomId', 'setTempRoomId', { tempRoomId: 'r2' }],
      ['doSetInertAppContainer', 'setInertAppContainer', true],
    ];

    cases.forEach(([action, mutation, payload]) => {
      root.actions[action]({ commit }, payload);
      expect(calls[calls.length - 1]).to.deep.equal({ type: mutation, payload });
    });
  });

  it('setInertAppContainer は値を反映する', () => {
    const state = createState();
    root.mutations.setInertAppContainer(state, true);
    expect(state.inertAppContainer).to.equal(true);
  });

  it('doLogout はOneSignal失敗時もログアウトをコミットする', async () => {
    const prev = window.OneSignal;
    let committed = null;
    window.OneSignal = {
      logout: () => {
        throw new Error('fail');
      },
    };

    await root.actions.doLogout({
      commit: (type) => {
        committed = type;
      },
      dispatch: () => Promise.resolve(),
    });

    window.OneSignal = prev;

    expect(committed).to.equal('logout');
  });

  it('doLogout は成功時に doEnsureGuestAuth を呼ぶ', async () => {
    const prev = window.OneSignal;
    const calls = [];
    window.OneSignal = {
      logout: () => Promise.resolve(),
    };

    await root.actions.doLogout({
      commit: (type) => calls.push(type),
      dispatch: (type) => {
        calls.push(type);
        return Promise.resolve();
      },
    });

    window.OneSignal = prev;

    expect(calls).to.deep.equal(['logout', 'doEnsureGuestAuth']);
  });

  it('doLogout はOneSignal待機中の再ログインを維持して現在識別情報を再確認する', async () => {
    const previousOneSignal = window.OneSignal;
    const state = createState();
    const deferred = (() => {
      let resolve;
      const promise = new Promise((resolvePromise) => {
        resolve = resolvePromise;
      });
      return { promise, resolve };
    })();
    const calls = [];
    Object.assign(state.user, {
      id: 'user-a',
      role: 'Author',
      name: 'User A',
      token: 'token-a',
      isLogin: true,
      guestId: null,
      guestName: null,
      guestToken: null,
    });
    const getters = {};
    Object.defineProperty(getters, 'userIsLogin', { get: () => state.user.isLogin });
    window.OneSignal = { logout: vi.fn(() => deferred.promise) };

    try {
      const request = root.actions.doLogout({
        rootState: state,
        getters,
        commit: (type, payload) => {
          calls.push(type);
          root.mutations[type](state, payload);
        },
        dispatch: (type) => {
          calls.push(type);
          return Promise.resolve();
        },
      });
      await vi.waitFor(() => expect(window.OneSignal.logout).toHaveBeenCalled());
      root.mutations.setLoginUser(state, {
        id: 'user-b',
        role: 'Editor',
        name: 'User B',
        lang: 'ja',
        imageName: null,
        token: 'token-b',
        eyeFriendlyMode: false,
        pushEnabled: false,
        replyPushEnabled: true,
        repliedPostPushEnabled: true,
      });
      deferred.resolve();

      expect(await request).to.equal(null);
      expect(state.user.isLogin).to.equal(true);
      expect(state.user.id).to.equal('user-b');
      expect(calls).to.deep.equal(['doEnsureOneSignalIdentity']);
    } finally {
      window.OneSignal = previousOneSignal;
    }
  });

  it('doEnsureOneSignalIdentity はログイン中ユーザをHMAC External IDへ関連付ける', async () => {
    const originalFetchPushIdentity = authApi.fetchPushIdentity;
    const originalOneSignal = window.OneSignal;
    const originalOneSignalDeferred = window.OneSignalDeferred;
    const originalOneSignalInitPromise = window.__iseeetlOneSignalInitPromise;
    const loginCalls = [];
    authApi.fetchPushIdentity = () => Promise.resolve({ data: { onesignal_external_id: 'osv1_hmac-user-1' } });
    window.OneSignal = {
      initialized: true,
      login: (...args) => {
        loginCalls.push(args);
        return Promise.resolve();
      },
    };
    window.__iseeetlOneSignalInitPromise = Promise.resolve();
    window.OneSignalDeferred = {
      push: (callback) => callback(window.OneSignal),
    };

    try {
      const result = await root.actions.doEnsureOneSignalIdentity({
        getters: { userIsLogin: true, oneSignalPushAvailable: true },
      });
      await Promise.resolve();

      expect(result).to.equal('osv1_hmac-user-1');
      expect(loginCalls).to.deep.equal([['osv1_hmac-user-1']]);
    } finally {
      authApi.fetchPushIdentity = originalFetchPushIdentity;
      window.OneSignal = originalOneSignal;
      window.OneSignalDeferred = originalOneSignalDeferred;
      window.__iseeetlOneSignalInitPromise = originalOneSignalInitPromise;
    }
  });

  it('doEnsureOneSignalIdentity は未ログインなら通知ID APIを呼ばない', async () => {
    const originalFetchPushIdentity = authApi.fetchPushIdentity;
    let fetchCount = 0;
    authApi.fetchPushIdentity = () => {
      fetchCount += 1;
      return Promise.resolve({ data: {} });
    };

    try {
      const result = await root.actions.doEnsureOneSignalIdentity({
        getters: { userIsLogin: false, oneSignalPushAvailable: true },
      });

      expect(result).to.equal(null);
      expect(fetchCount).to.equal(0);
    } finally {
      authApi.fetchPushIdentity = originalFetchPushIdentity;
    }
  });

  it('doEnsureOneSignalIdentity はOneSignal無効なら通知ID APIを呼ばない', async () => {
    const originalFetchPushIdentity = authApi.fetchPushIdentity;
    let fetchCount = 0;
    authApi.fetchPushIdentity = () => {
      fetchCount += 1;
      return Promise.resolve({ data: {} });
    };

    try {
      const result = await root.actions.doEnsureOneSignalIdentity({
        getters: { userIsLogin: true, oneSignalPushAvailable: false },
      });

      expect(result).to.equal(null);
      expect(fetchCount).to.equal(0);
    } finally {
      authApi.fetchPushIdentity = originalFetchPushIdentity;
    }
  });

  it('doShowSnackbar は既定でstatusを使う', () => {
    let committed = null;
    let payload = null;
    root.actions.doShowSnackbar(
      {
        commit: (type, data) => {
          committed = type;
          payload = data;
        },
      },
      { message: 'hello' }
    );

    expect(committed).to.equal('setSnackbar');
    expect(payload).to.deep.equal({ message: 'hello', role: 'status' });
  });

  it('hideSnackbar は表示中のメッセージをクリアする', () => {
    const state = createState();
    root.mutations.setSnackbar(state, { message: 'warn', role: 'alert' });

    root.mutations.hideSnackbar(state);

    expect(state.message.snackbarVisible).to.equal(false);
    expect(state.message.snackbarMessage).to.equal('');
    expect(state.message.assertiveMessage).to.equal('');
    expect(state.message.politeMessage).to.equal('');
  });
  it('Cookie失効後はゲスト取得に失敗してもログアウトを完了する', async () => {
    const calls = [];
    logoutSpy.mockImplementationOnce(async () => { calls.push('cookie'); });
    await expect(root.actions.doLogout({
      commit: (type) => calls.push(type),
      dispatch: async () => { calls.push('guest'); throw new Error('guest unavailable'); },
    })).resolves.toBeUndefined();
    expect(calls).toEqual(['cookie', 'logout', 'guest']);
  });

  it('Cookie失効APIが失敗した場合は完了扱いせず、再試行までログイン状態を維持する', async () => {
    logoutSpy.mockRejectedValueOnce(new Error('offline'));
    const commit = vi.fn();
    const dispatch = vi.fn();
    await expect(root.actions.doLogout({ commit, dispatch })).rejects.toThrow('offline');
    expect(commit).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

});
