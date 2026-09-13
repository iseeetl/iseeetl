import { expect } from 'vitest';
import root from '@/store/root';
import guestApi from '@/api/guest';
import flushPromises from '../helpers/flushPromises';

const createState = () => JSON.parse(JSON.stringify(root.state));

const createGuestActionContext = (state) => {
  const getters = {};
  Object.defineProperties(getters, {
    userIsLogin: { get: () => state.user.isLogin },
    guestId: { get: () => state.user.guestId },
    guestName: { get: () => state.user.guestName },
    lang: { get: () => state.user.lang },
  });
  return {
    rootState: state,
    getters,
    commit: (type, payload) => root.mutations[type](state, payload),
  };
};

const createDeferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('ストアのゲスト認証処理', () => {
  const originals = {};

  beforeEach(() => {
    originals.bootstrap = guestApi.bootstrap;
    originals.refresh = guestApi.refresh;
  });

  afterEach(() => {
    guestApi.bootstrap = originals.bootstrap;
    guestApi.refresh = originals.refresh;
    vi.unstubAllGlobals();
  });

  it('doEnsureGuestAuth は旧式ゲストの名称と言語を維持してトークンを発行する', async () => {
    const state = createState();
    state.user.guestName = 'OldGuest';
    state.user.lang = 'en';

    const commit = (type, payload) => root.mutations[type](state, payload);
    const getters = {
      userIsLogin: false,
      guestName: state.user.guestName,
      lang: state.user.lang,
    };
    const dispatch = (type) => {
      if (type === 'doRefreshGuestToken') {
        return root.actions.doRefreshGuestToken({ commit, getters });
      }
      return Promise.resolve();
    };

    guestApi.refresh = () => Promise.reject(new Error('no refresh'));
    guestApi.bootstrap = () =>
      Promise.resolve({
        data: {
          guest_id: 'guest-new',
          guest_name: 'OldGuest',
          lang: 'en',
          guest_token: 'token-1',
        },
      });

    await root.actions.doEnsureGuestAuth({ commit, getters, dispatch });

    expect(state.user.guestId).to.equal('guest-new');
    expect(state.user.guestName).to.equal('OldGuest');
    expect(state.user.lang).to.equal('en');
    expect(state.user.guestToken).to.equal('token-1');
  });

  it('doEnsureGuestAuth は名称未設定時に保存言語のゲスト名で初期化する', async () => {
    const state = createState();
    state.user.guestName = null;
    state.user.lang = 'en';
    const commit = (type, payload) => root.mutations[type](state, payload);
    const getters = {
      userIsLogin: false,
      guestName: null,
      lang: 'en',
    };
    const dispatch = (type) => {
      if (type === 'doRefreshGuestToken') return Promise.reject(new Error('no refresh'));
      return Promise.resolve();
    };
    let bootstrapPayload = null;
    guestApi.bootstrap = (payload) => {
      bootstrapPayload = payload;
      return Promise.resolve({
        data: {
          guest_id: 'guest-localized',
          guest_name: payload.guest_name,
          lang: payload.lang,
          guest_token: 'token-localized',
        },
      });
    };

    await root.actions.doEnsureGuestAuth({ commit, getters, dispatch });

    expect(bootstrapPayload).to.deep.equal({ guest_name: 'Guest', lang: 'en' });
    expect(state.user.guestName).to.equal('Guest');
  });

  it('doEnsureGuestAuth は言語も未設定ならブラウザ言語と対応するゲスト名で初期化する', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0', languages: ['fr-FR'], language: 'fr-FR' });
    const state = createState();
    const commit = (type, payload) => root.mutations[type](state, payload);
    const getters = {
      userIsLogin: false,
      guestName: null,
      lang: null,
    };
    const dispatch = () => Promise.reject(new Error('no refresh'));
    let bootstrapPayload = null;
    guestApi.bootstrap = (payload) => {
      bootstrapPayload = payload;
      return Promise.resolve({
        data: {
          guest_id: 'guest-browser-locale',
          guest_name: payload.guest_name,
          lang: payload.lang,
          guest_token: 'token-browser-locale',
        },
      });
    };

    await root.actions.doEnsureGuestAuth({ commit, getters, dispatch });

    expect(bootstrapPayload).to.deep.equal({ guest_name: 'Invité', lang: 'fr' });
    expect(state.user.guestName).to.equal('Invité');
    expect(state.user.lang).to.equal('fr');
  });

  it('doEnsureGuestAuth はログイン済みなら何もしない', async () => {
    const result = await root.actions.doEnsureGuestAuth({
      commit: () => {
        throw new Error('commitしてはいけません');
      },
      getters: { userIsLogin: true },
      dispatch: () => {
        throw new Error('dispatchしてはいけません');
      },
    });

    expect(result).to.equal(null);
  });

  it('doRefreshGuestToken はログイン済みなら null を返す', async () => {
    guestApi.refresh = () => {
      throw new Error('呼び出してはいけません');
    };

    const result = await root.actions.doRefreshGuestToken({
      commit: () => {},
      getters: { userIsLogin: true },
    });

    expect(result).to.equal(null);
  });

  it('doRefreshGuestToken は更新成功でゲスト情報を更新する', async () => {
    const state = createState();
    const commit = (type, payload) => root.mutations[type](state, payload);
    const getters = {
      userIsLogin: false,
      guestName: 'CachedGuest',
      lang: 'fr',
    };

    guestApi.refresh = () =>
      Promise.resolve({
        data: {
          guest_id: 'guest-refresh',
          guest_name: 'ignored',
          lang: 'ignored',
          guest_token: 'token-2',
        },
      });

    const result = await root.actions.doRefreshGuestToken({ commit, getters });

    expect(result.data.guest_id).to.equal('guest-refresh');
    expect(state.user.guestId).to.equal('guest-refresh');
    expect(state.user.guestName).to.equal('CachedGuest');
    expect(state.user.lang).to.equal('fr');
    expect(state.user.guestToken).to.equal('token-2');
  });

  it('doRefreshGuestToken はゲスト変更後に届いた古い結果をコミットしない', async () => {
    const state = createState();
    state.user.guestId = 'guest-a';
    state.user.guestName = 'Guest A';
    state.user.lang = 'ja';
    state.user.guestToken = 'token-a';
    const deferred = createDeferred();
    guestApi.refresh = () => deferred.promise;
    const context = createGuestActionContext(state);

    const request = root.actions.doRefreshGuestToken(context);
    root.mutations.setGuestUser(state, {
      guest_id: 'guest-b',
      guest_name: 'Guest B',
      lang: 'ja',
      guest_token: 'token-b',
    });
    deferred.resolve({
      data: {
        guest_id: 'guest-a',
        guest_name: 'Guest A',
        lang: 'ja',
        guest_token: 'token-late',
      },
    });

    expect(await request).to.equal(null);
    expect(state.user.guestId).to.equal('guest-b');
    expect(state.user.guestToken).to.equal('token-b');
  });

  it('doRefreshGuestToken は名称がどこにも無ければ保存言語のゲスト名を使う', async () => {
    const state = createState();
    const commit = (type, payload) => root.mutations[type](state, payload);
    const getters = {
      userIsLogin: false,
      guestName: null,
      lang: 'en',
    };
    guestApi.refresh = () =>
      Promise.resolve({
        data: {
          guest_id: 'guest-default-name',
          guest_token: 'token-default-name',
        },
      });

    await root.actions.doRefreshGuestToken({ commit, getters });

    expect(state.user.guestName).to.equal('Guest');
    expect(state.user.lang).to.equal('en');
  });

  it('doRefreshGuestToken は保存言語も無ければAPIの言語でゲスト名を補う', async () => {
    const state = createState();
    const commit = (type, payload) => root.mutations[type](state, payload);
    const getters = {
      userIsLogin: false,
      guestName: null,
      lang: null,
    };
    guestApi.refresh = () =>
      Promise.resolve({
        data: {
          guest_id: 'guest-api-language',
          lang: 'en',
          guest_token: 'token-api-language',
        },
      });

    await root.actions.doRefreshGuestToken({ commit, getters });

    expect(state.user.guestName).to.equal('Guest');
    expect(state.user.lang).to.equal('en');
  });

  it('doEnsureGuestAuth は更新成功時に初期化を呼ばない', async () => {
    const state = createState();
    const commit = (type, payload) => root.mutations[type](state, payload);
    const getters = {
      userIsLogin: false,
      guestName: null,
      lang: null,
    };

    let bootstrapCalled = false;
    guestApi.refresh = () =>
      Promise.resolve({
        data: {
          guest_id: 'guest-refresh-2',
          guest_name: 'Guest',
          lang: 'ja',
          guest_token: 'token-3',
        },
      });
    guestApi.bootstrap = () => {
      bootstrapCalled = true;
      return Promise.resolve({ data: {} });
    };

    const dispatch = (type) => {
      if (type === 'doRefreshGuestToken') {
        return root.actions.doRefreshGuestToken({ commit, getters });
      }
      return Promise.resolve();
    };

    await root.actions.doEnsureGuestAuth({ commit, getters, dispatch });

    expect(bootstrapCalled).to.equal(false);
    expect(state.user.guestId).to.equal('guest-refresh-2');
  });

  it('doRecoverGuestSocketAuth は更新成功時に現在ゲストのトークンだけを更新する', async () => {
    const state = createState();
    state.user.guestId = 'guest-current';
    state.user.guestName = 'CurrentGuest';
    state.user.lang = 'fr';
    state.user.guestToken = 'token-old';
    let bootstrapCalled = false;
    guestApi.refresh = () =>
      Promise.resolve({
        data: {
          guest_id: 'guest-current',
          guest_name: 'ignored',
          lang: 'ignored',
          guest_token: 'token-new',
        },
      });
    guestApi.bootstrap = () => {
      bootstrapCalled = true;
      return Promise.resolve({ data: {} });
    };

    const result = await root.actions.doRecoverGuestSocketAuth(createGuestActionContext(state));

    expect(result).to.deep.equal({ status: 'refreshed' });
    expect(bootstrapCalled).to.equal(false);
    expect(state.user.guestId).to.equal('guest-current');
    expect(state.user.guestName).to.equal('CurrentGuest');
    expect(state.user.lang).to.equal('fr');
    expect(state.user.guestToken).to.equal('token-new');
  });

  it('doRecoverGuestSocketAuth は期限切れ401の場合だけゲストを再作成する', async () => {
    const state = createState();
    state.user.guestId = 'guest-expired';
    state.user.guestName = 'ExpiredGuest';
    state.user.lang = 'en';
    state.user.guestToken = 'token-expired';
    guestApi.refresh = () => Promise.reject({ response: { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } } } });
    guestApi.bootstrap = ({ guest_name, lang }) =>
      Promise.resolve({
        data: {
          guest_id: 'guest-new',
          guest_name,
          lang,
          guest_token: 'token-bootstrapped',
        },
      });

    const result = await root.actions.doRecoverGuestSocketAuth(createGuestActionContext(state));

    expect(result).to.deep.equal({ status: 'bootstrapped' });
    expect(state.user.guestId).to.equal('guest-new');
    expect(state.user.guestName).to.equal('ExpiredGuest');
    expect(state.user.lang).to.equal('en');
    expect(state.user.guestToken).to.equal('token-bootstrapped');
  });

  it('doRecoverGuestSocketAuth は名称未設定時に保存言語のゲスト名で再作成する', async () => {
    const state = createState();
    state.user.guestId = 'guest-without-name';
    state.user.guestName = null;
    state.user.lang = 'en';
    state.user.guestToken = 'token-expired';
    let bootstrapPayload = null;
    guestApi.refresh = () => Promise.reject({ response: { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } } } });
    guestApi.bootstrap = (payload) => {
      bootstrapPayload = payload;
      return Promise.resolve({
        data: {
          guest_id: 'guest-localized-recovery',
          guest_name: payload.guest_name,
          lang: payload.lang,
          guest_token: 'token-localized-recovery',
        },
      });
    };

    const result = await root.actions.doRecoverGuestSocketAuth(createGuestActionContext(state));

    expect(result).to.deep.equal({ status: 'bootstrapped' });
    expect(bootstrapPayload).to.deep.equal({ guest_name: 'Guest', lang: 'en' });
    expect(state.user.guestName).to.equal('Guest');
  });

  it('doRecoverGuestSocketAuth は初期化失敗時に現在のゲスト情報を維持する', async () => {
    const state = createState();
    state.user.guestId = 'guest-bootstrap-failed';
    state.user.guestName = 'PreservedGuest';
    state.user.lang = 'en';
    state.user.guestToken = 'token-preserved';
    guestApi.refresh = () => Promise.reject({ response: { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } } } });
    guestApi.bootstrap = () =>
      Promise.reject({ response: { status: 503, data: { error: { code: 'SERVICE_UNAVAILABLE' } } } });

    const result = await root.actions.doRecoverGuestSocketAuth(createGuestActionContext(state));

    expect(result).to.deep.equal({
      status: 'failed',
      error: { status: 503, code: 'SERVICE_UNAVAILABLE' },
    });
    expect(state.user.guestId).to.equal('guest-bootstrap-failed');
    expect(state.user.guestName).to.equal('PreservedGuest');
    expect(state.user.lang).to.equal('en');
    expect(state.user.guestToken).to.equal('token-preserved');
  });

  it('doRecoverGuestSocketAuth は通信障害・429・5xx・対象外401でゲスト IDを維持する', async () => {
    const errors = [
      new Error('offline'),
      { response: { status: 429, data: { error: { code: 'RATE_LIMITED' } } } },
      { response: { status: 503, data: { error: { code: 'SERVICE_UNAVAILABLE' } } } },
      { response: { status: 401, data: { error: { code: 'UNAUTHORIZED' } } } },
    ];

    for (const error of errors) {
      const state = createState();
      state.user.guestId = 'guest-preserved';
      state.user.guestName = 'PreservedGuest';
      state.user.lang = 'ja';
      state.user.guestToken = 'token-preserved';
      let bootstrapCalled = false;
      guestApi.refresh = () => Promise.reject(error);
      guestApi.bootstrap = () => {
        bootstrapCalled = true;
        return Promise.resolve({ data: {} });
      };

      const result = await root.actions.doRecoverGuestSocketAuth(createGuestActionContext(state));

      expect(result.status).to.equal('failed');
      expect(bootstrapCalled).to.equal(false);
      expect(state.user.guestId).to.equal('guest-preserved');
      expect(state.user.guestToken).to.equal('token-preserved');
    }
  });

  it('doRecoverGuestSocketAuth は同じゲストの重複要求で更新 Promiseを共有する', async () => {
    const state = createState();
    state.user.guestId = 'guest-single-flight';
    state.user.guestName = 'Guest';
    state.user.lang = 'ja';
    const deferred = createDeferred();
    let refreshCount = 0;
    guestApi.refresh = () => {
      refreshCount += 1;
      return deferred.promise;
    };
    const context = createGuestActionContext(state);

    const first = root.actions.doRecoverGuestSocketAuth(context);
    const second = root.actions.doRecoverGuestSocketAuth(context);
    expect(second).to.equal(first);
    await flushPromises();
    expect(refreshCount).to.equal(1);

    deferred.resolve({
      data: {
        guest_id: 'guest-single-flight',
        guest_token: 'token-refreshed',
      },
    });
    const results = await Promise.all([first, second]);

    expect(results).to.deep.equal([{ status: 'refreshed' }, { status: 'refreshed' }]);
    expect(state.user.guestToken).to.equal('token-refreshed');
  });

  it('同じゲストの更新から再発行までを1つの処理として共有する', async () => {
    const state = createState();
    state.user.guestId = 'guest-bootstrap-flight';
    state.user.guestName = 'Guest';
    state.user.lang = 'ja';
    const bootstrapDeferred = createDeferred();
    let bootstrapCount = 0;
    guestApi.refresh = () => Promise.reject({ response: { status: 401, data: { error: { code: 'TOKEN_INVALID' } } } });
    guestApi.bootstrap = () => {
      bootstrapCount += 1;
      return bootstrapDeferred.promise;
    };
    const context = createGuestActionContext(state);

    const first = root.actions.doRecoverGuestSocketAuth(context);
    const second = root.actions.doRecoverGuestSocketAuth(context);

    expect(second).to.equal(first);
    await flushPromises();
    expect(bootstrapCount).to.equal(1);
    bootstrapDeferred.resolve({
      data: {
        guest_id: 'guest-bootstrap-new',
        guest_name: 'Guest',
        lang: 'ja',
        guest_token: 'token-bootstrap-new',
      },
    });
    await Promise.all([first, second]);

    expect(bootstrapCount).to.equal(1);
    expect(state.user.guestId).to.equal('guest-bootstrap-new');
  });

  it('doRecoverGuestSocketAuth は認証主体変更後に届いた古い更新結果を破棄する', async () => {
    const state = createState();
    state.user.guestId = 'guest-old';
    state.user.guestName = 'OldGuest';
    state.user.lang = 'ja';
    state.user.guestToken = 'token-old';
    const deferred = createDeferred();
    guestApi.refresh = () => deferred.promise;

    const request = root.actions.doRecoverGuestSocketAuth(createGuestActionContext(state));
    root.mutations.setLoginUser(state, {
      id: 'user-1',
      role: 'Author',
      name: 'User',
      lang: 'ja',
      imageName: null,
      token: 'user-token',
      eyeFriendlyMode: false,
      pushEnabled: false,
      replyPushEnabled: true,
      repliedPostPushEnabled: true,
    });
    deferred.resolve({ data: { guest_id: 'guest-old', guest_token: 'token-late' } });

    const result = await request;

    expect(result).to.deep.equal({ status: 'stale' });
    expect(state.user.isLogin).to.equal(true);
    expect(state.user.guestId).to.equal(null);
    expect(state.user.guestToken).to.equal(null);
  });
});
