import { expect } from 'vitest';
import apiClient, {
  withAuth,
  normalizeApiError,
  formatApiErrorMessage,
  appendApiErrorMessage,
  buildBasePath,
  buildRequestConfig,
  isAuthenticationUnauthorized,
} from '@/api/apiClient';
import store from '@/store';
import { resetApiApplicationStore, setApiApplicationStore } from '@/api/apiStoreAdapter';

const createDeferred = () => {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('APIクライアントの共通処理', () => {
  it('withAuthはBearerトークンを付与する', () => {
    const base = { headers: { 'x-test': '1' } };
    const result = withAuth('token', base);

    expect(result).to.deep.equal({
      headers: {
        'x-test': '1',
        authorization: 'Bearer token',
      },
    });
  });

  it('withAuthは既存のBearerトークンを維持する', () => {
    const result = withAuth('Bearer token');
    expect(result).to.deep.equal({ headers: { authorization: 'Bearer token' } });
  });

  it('normalizeApiErrorは応答からエラー情報を取り出す', () => {
    const err = {
      response: {
        status: 400,
        data: {
          error: {
            code: 'INVALID',
            message: 'bad',
            requestId: 'req-1',
            details: { field: 'x' },
          },
        },
      },
    };

    expect(normalizeApiError(err)).to.deep.equal({
      status: 400,
      code: 'INVALID',
      message: 'bad',
      requestId: 'req-1',
      details: { field: 'x' },
    });
  });

  it('エラー情報がない場合は応答の文字列をエラーメッセージに使う', () => {
    const err = {
      response: {
        status: 500,
        data: 'oops',
        statusText: 'Internal Server Error',
      },
    };

    const normalized = normalizeApiError(err);
    expect(normalized.status).to.equal(500);
    expect(normalized.message).to.equal('oops');
  });

  it('未知のエラーコードではサーバのメッセージをそのまま表示しない', () => {
    const err = {
      response: {
        status: 400,
        data: {
          error: {
            code: 'ERR_CODE',
            message: 'bad',
            requestId: 'req-2',
          },
        },
      },
    };

    const res = formatApiErrorMessage(err, { translate: (msg) => `${msg}_t` });
    expect(res.displayMessage).to.equal('処理に失敗しました_t');
  });

  it('メッセージの翻訳に失敗しても共通エラーメッセージを返す', () => {
    const err = {
      response: {
        data: {
          error: {
            message: 'bad',
          },
        },
      },
    };

    const res = formatApiErrorMessage(err, {
      translate: () => {
        throw new Error('boom');
      },
    });
    expect(res.displayMessage).to.equal('処理に失敗しました');
  });

  it('基本メッセージに表示用のエラーメッセージを添える', () => {
    const err = {
      response: {
        data: {
          error: {
            message: 'bad',
          },
        },
      },
    };

    const message = appendApiErrorMessage('Base', err, { wrapper: 'paren' });
    expect(message).to.equal('Base（処理に失敗しました）');
  });

  it('表示用のエラー情報がなければ基本メッセージだけを返す', () => {
    const err = {};
    const message = appendApiErrorMessage('Base', err);
    expect(message).to.equal('Base');
  });

  it('エラーコードを翻訳キーへ変換し、サーバの技術的なメッセージを隠す', () => {
    const error = {
      response: {
        status: 500,
        data: { error: { code: 'FILE_RENAME_ERROR', message: 'rename error.' } },
      },
    };
    const result = formatApiErrorMessage(error, { translate: (key) => `translated:${key}` });

    expect(result.displayMessage).to.equal('translated:処理に失敗しました');
    expect(result.displayMessage).not.to.contain('rename error');
  });

  it('エラーコードに対応する具体的な翻訳キーを使う', () => {
    const error = {
      response: {
        status: 409,
        data: { error: { code: 'USER_EMAIL_ALREADY_USED', message: 'raw backend message' } },
      },
    };

    expect(formatApiErrorMessage(error).displayMessage).to.equal(
      'このメールアドレスは既に登録されています。'
    );
  });

  it('CONFLICTの理由を利用者向けのメッセージへ変換する', () => {
    const error = {
      response: {
        status: 409,
        data: {
          error: {
            code: 'CONFLICT',
            message: 'CONFLICT',
            details: {
              reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
              resource_type: 'floor-tag',
            },
          },
        },
      },
    };

    expect(
      appendApiErrorMessage('フロアタグの削除に失敗しました', error, {
        wrapper: 'paren',
      })
    ).to.equal(
      'フロアタグの削除に失敗しました（有効なAI解析設定で使用されているため削除できません。先に関連するAI解析設定を削除してください）'
    );
  });

  it('理由がないCONFLICTには共通メッセージを使う', () => {
    const error = {
      response: {
        status: 409,
        data: { error: { code: 'CONFLICT', message: 'raw backend message' } },
      },
    };

    expect(formatApiErrorMessage(error).displayMessage).to.equal('処理に失敗しました');
  });

  it('HTTP 409以外は既知の競合理由でも共通メッセージを使う', () => {
    const error = {
      response: {
        status: 400,
        data: {
          error: {
            code: 'CONFLICT',
            details: {
              reason: 'ACTIVE_AI_ANALYSIS_REFERENCE',
              resource_type: 'floor-tag',
            },
          },
        },
      },
    };

    expect(formatApiErrorMessage(error).displayMessage).to.equal('処理に失敗しました');
  });

  it('buildRequestConfigは基本設定と追加オプションを統合する', () => {
    const onUploadProgress = () => {};
    const result = buildRequestConfig(
      { onUploadProgress, responseType: 'blob', withCredentials: true },
      { headers: { 'content-type': 'multipart/form-data' } }
    );

    expect(result).to.deep.equal({
      headers: { 'content-type': 'multipart/form-data' },
      onUploadProgress,
      responseType: 'blob',
      withCredentials: true,
    });
  });

  it('buildRequestConfigはオプションがなければ空のオブジェクトを返す', () => {
    expect(buildRequestConfig()).to.deep.equal({});
  });

  it('buildBasePathは管理用パスと末尾のスラッシュを付ける', () => {
    expect(buildBasePath('/api/floor')).to.equal('/api/floor/');
    expect(buildBasePath('/api/floor/', { management: true })).to.equal('/api/floor/management/');
  });

  it('isAuthenticationUnauthorized は認証切れと権限不足を区別する', () => {
    expect(
      isAuthenticationUnauthorized({
        response: { status: 401, data: { error: { code: 'TOKEN_EXPIRED' } } },
      })
    ).to.equal(true);
    expect(
      isAuthenticationUnauthorized({
        response: { status: 401, data: { error: { code: 'INVALID_PERMISSION' } } },
      })
    ).to.equal(false);
    expect(isAuthenticationUnauthorized({ response: { status: 401 } })).to.equal(true);
  });
});

describe('APIクライアントのリクエスト・応答処理', () => {
  let originalDispatch;
  let originalUser;

  beforeEach(() => {
    originalDispatch = store.dispatch;
    originalUser = { ...store.state.user };
  });

  afterEach(() => {
    resetApiApplicationStore();
    store.dispatch = originalDispatch;
    Object.assign(store.state.user, originalUser);
  });

  it('リクエスト送信時はトークンとゲストトークンを付与する', () => {
    const handler = apiClient.interceptors.request.handlers[0].fulfilled;
    store.state.user.token = 'token-1';
    store.state.user.isLogin = false;
    store.state.user.guestToken = 'guest-1';

    const config = handler({ url: '/api', headers: {} });

    expect(config.headers.authorization).to.equal('Bearer token-1');
    expect(config.headers['X-Guest-Token']).to.equal('guest-1');
    expect(config._userAuthRequest).to.equal(true);
  });

  it('リクエスト送信時はアプリ生成時に指定したストアを参照する', () => {
    setApiApplicationStore({
      getters: {
        userToken: 'injected-token',
        userIsLogin: true,
        guestToken: null,
      },
      dispatch: () => Promise.resolve(),
    });
    const handler = apiClient.interceptors.request.handlers[0].fulfilled;

    const config = handler({ url: '/api', headers: {} });

    expect(config.headers.authorization).to.equal('Bearer injected-token');
    expect(config._userAuthRequest).to.equal(true);
  });

  it('リクエスト送信時は既存の認証ヘッダを優先する', () => {
    const handler = apiClient.interceptors.request.handlers[0].fulfilled;
    store.state.user.token = 'token-2';
    store.state.user.isLogin = false;
    store.state.user.guestToken = 'guest-2';

    const config = handler({ url: '/api', headers: { authorization: 'Bearer keep' } });

    expect(config.headers.authorization).to.equal('Bearer keep');
    expect(config.headers['X-Guest-Token']).to.equal('guest-2');
    expect(config._userAuthRequest).to.equal(true);
  });

  it('リクエスト送信時は既存のゲストトークンヘッダを維持する', () => {
    const handler = apiClient.interceptors.request.handlers[0].fulfilled;
    store.state.user.token = null;
    store.state.user.isLogin = false;
    store.state.user.guestToken = 'guest-keep';

    const config = handler({ url: '/api', headers: { 'X-Guest-Token': 'existing' } });

    expect(config.headers['X-Guest-Token']).to.equal('existing');
    expect(config._userAuthRequest).to.equal(false);
  });

  it('401応答時にログイン中ならログアウトし、元のエラーを返す', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    store.state.user.isLogin = true;
    store.dispatch = (type) => {
      calls.push(type);
    };

    const error = { response: { status: 401 }, config: {} };
    try {
      await handler(error);
    } catch (err) {
      expect(err.response.status).to.equal(401);
    }

    expect(calls).to.deep.equal(['doLogout']);
    expect(error.config._userLogoutHandled).to.equal(true);
  });

  it('権限不足による401応答ではログアウトしない', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    store.state.user.isLogin = true;
    store.dispatch = (type) => {
      calls.push(type);
    };
    const error = {
      response: { status: 401, data: { error: { code: 'INVALID_PERMISSION' } } },
      config: { _userAuthRequest: true },
    };

    const result = await handler(error).catch((caught) => caught);

    expect(result).to.equal(error);
    expect(calls).to.deep.equal([]);
    expect(error.config._userLogoutHandled).to.equal(undefined);
  });

  it('ゲストの権限不足ではトークンの更新もリクエストの再送も行わない', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    const originalAdapter = apiClient.defaults.adapter;
    let adapterCalls = 0;
    store.state.user.token = null;
    store.state.user.isLogin = false;
    store.state.user.guestToken = 'guest-token';
    store.dispatch = (type) => {
      calls.push(type);
      return Promise.resolve();
    };
    apiClient.defaults.adapter = () => {
      adapterCalls += 1;
      return Promise.resolve({ status: 200 });
    };
    const error = {
      response: { status: 401, data: { error: { code: 'INVALID_PERMISSION' } } },
      config: { url: '/api/roomtag', headers: {} },
    };

    try {
      const result = await handler(error).catch((caught) => caught);

      expect(result).to.equal(error);
      expect(calls).to.deep.equal([]);
      expect(adapterCalls).to.equal(0);
      expect(error.config._guestRetry).to.equal(undefined);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('401応答が同時に届いてもログアウトを1回だけ実行する', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    let resolveLogout;
    const pendingLogout = new Promise((resolve) => {
      resolveLogout = resolve;
    });
    store.state.user.isLogin = true;
    store.dispatch = (type) => {
      calls.push(type);
      return pendingLogout;
    };

    const firstError = { response: { status: 401 }, config: { _userAuthRequest: true } };
    const secondError = { response: { status: 401 }, config: { _userAuthRequest: true } };
    const first = handler(firstError).catch((error) => error);
    const second = handler(secondError).catch((error) => error);
    await Promise.resolve();

    expect(calls).to.deep.equal(['doLogout']);
    resolveLogout();
    const results = await Promise.all([first, second]);
    expect(results).to.deep.equal([firstError, secondError]);
    expect(firstError.config._userLogoutHandled).to.equal(true);
    expect(secondError.config._userLogoutHandled).to.equal(true);
  });

  it('ログアウトが失敗しても元の401エラーを返す', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const error = { response: { status: 401 }, config: { _userAuthRequest: true } };
    store.state.user.isLogin = true;
    store.dispatch = () => Promise.reject(new Error('logout failed'));

    const result = await handler(error).catch((caught) => caught);

    expect(result).to.equal(error);
    expect(error.config._userLogoutHandled).to.equal(true);
  });

  it('ログアウト後に旧JWTへの401応答が届いても、ゲストとして再試行しない', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    const error = { response: { status: 401 }, config: { _userAuthRequest: true } };
    store.state.user.isLogin = false;
    store.dispatch = (type) => {
      calls.push(type);
      return Promise.resolve();
    };

    const result = await handler(error).catch((caught) => caught);

    expect(result).to.equal(error);
    expect(calls).to.deep.equal([]);
    expect(error.config._userLogoutHandled).to.equal(true);
  });

  it('401応答時にskipGuestRefreshが指定されていれば、ゲストトークンを更新せず元のエラーを返す', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    store.state.user.isLogin = false;
    store.dispatch = (type) => {
      calls.push(type);
      return Promise.resolve();
    };

    try {
      await handler({ response: { status: 401 }, config: { skipGuestRefresh: true } });
    } catch (err) {
      expect(err.response.status).to.equal(401);
    }

    expect(calls).to.not.include('doRefreshGuestToken');
  });

  it('401応答時に_guestRetryが指定されていれば、ゲストトークンを更新せず元のエラーを返す', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    store.state.user.isLogin = false;
    store.dispatch = (type) => {
      calls.push(type);
      return Promise.resolve();
    };

    try {
      await handler({ response: { status: 401 }, config: { _guestRetry: true } });
    } catch (err) {
      expect(err.response.status).to.equal(401);
    }

    expect(calls).to.not.include('doRefreshGuestToken');
  });

  it('401応答時はゲストトークンを更新して再試行する', async () => {
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    const originalAdapter = apiClient.defaults.adapter;
    let retriedConfig = null;

    store.state.user.isLogin = false;
    store.dispatch = (type) => {
      calls.push(type);
      return Promise.resolve();
    };
    apiClient.defaults.adapter = (config) => {
      retriedConfig = config;
      return Promise.resolve({
        data: 'retry',
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      });
    };

    try {
      const result = await handler({ response: { status: 401 }, config: {} });

      expect(calls).to.include('doRefreshGuestToken');
      expect(retriedConfig._guestRetry).to.equal(true);
      expect(result.data).to.equal('retry');
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('ゲストへの401応答が同時に届いてもトークン更新を1回だけ実行する', async () => {
    const requestHandler = apiClient.interceptors.request.handlers[0].fulfilled;
    const handler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    const originalAdapter = apiClient.defaults.adapter;
    let resolveRefresh;
    const pendingRefresh = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    store.state.user.token = null;
    store.state.user.isLogin = false;
    store.dispatch = (type) => {
      calls.push(type);
      return pendingRefresh;
    };
    apiClient.defaults.adapter = (config) =>
      Promise.resolve({ data: config.url, status: 200, statusText: 'OK', headers: {}, config });

    try {
      const firstConfig = requestHandler({ url: '/first', headers: {} });
      const secondConfig = requestHandler({ url: '/second', headers: {} });
      const first = handler({ response: { status: 401 }, config: firstConfig });
      const second = handler({ response: { status: 401 }, config: secondConfig });
      await Promise.resolve();

      expect(calls).to.deep.equal(['doRefreshGuestToken']);
      resolveRefresh();
      const results = await Promise.all([first, second]);
      expect(results.map((result) => result.data)).to.deep.equal(['/first', '/second']);
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('ゲスト認証の更新中に登録ユーザへ切り替わった場合は再送しない', async () => {
    const requestHandler = apiClient.interceptors.request.handlers[0].fulfilled;
    const responseHandler = apiClient.interceptors.response.handlers[0].rejected;
    const originalAdapter = apiClient.defaults.adapter;
    const refresh = createDeferred();
    const calls = [];
    let adapterCalls = 0;
    Object.assign(store.state.user, {
      id: null,
      role: null,
      token: null,
      isLogin: false,
      guestId: 'guest-a',
      guestName: 'Guest A',
      guestToken: 'guest-token-a',
    });
    store.dispatch = (type) => {
      calls.push(type);
      return refresh.promise;
    };
    apiClient.defaults.adapter = () => {
      adapterCalls += 1;
      return Promise.resolve({ status: 200 });
    };
    const config = requestHandler({ url: '/guest-resource', headers: {} });
    const error = { response: { status: 401 }, config };

    try {
      const pending = responseHandler(error).catch((caught) => caught);
      store.commit('setLoginUser', {
        id: 'user-b',
        role: 'Author',
        name: 'User B',
        lang: 'ja',
        imageName: null,
        token: 'user-token-b',
        eyeFriendlyMode: false,
        pushEnabled: false,
        replyPushEnabled: true,
        repliedPostPushEnabled: true,
      });
      refresh.resolve({ data: {} });

      expect(await pending).to.equal(error);
      expect(calls).to.deep.equal(['doRefreshGuestToken']);
      expect(adapterCalls).to.equal(0);
      expect(store.state.user.id).to.equal('user-b');
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('認証更新中に別のゲストへ切り替わった場合は再送しない', async () => {
    const requestHandler = apiClient.interceptors.request.handlers[0].fulfilled;
    const responseHandler = apiClient.interceptors.response.handlers[0].rejected;
    const originalAdapter = apiClient.defaults.adapter;
    const refresh = createDeferred();
    let adapterCalls = 0;
    Object.assign(store.state.user, {
      id: null,
      role: null,
      token: null,
      isLogin: false,
      guestId: 'guest-a',
      guestName: 'Guest A',
      guestToken: 'guest-token-a',
    });
    store.dispatch = () => refresh.promise;
    apiClient.defaults.adapter = () => {
      adapterCalls += 1;
      return Promise.resolve({ status: 200 });
    };
    const config = requestHandler({ url: '/guest-resource', headers: {} });
    const error = { response: { status: 401 }, config };

    try {
      const pending = responseHandler(error).catch((caught) => caught);
      store.commit('setGuestUser', {
        guest_id: 'guest-b',
        guest_name: 'Guest B',
        lang: 'ja',
        guest_token: 'guest-token-b',
      });
      refresh.resolve({ data: {} });

      expect(await pending).to.equal(error);
      expect(adapterCalls).to.equal(0);
      expect(store.state.user.guestId).to.equal('guest-b');
      expect(store.state.user.guestToken).to.equal('guest-token-b');
    } finally {
      apiClient.defaults.adapter = originalAdapter;
    }
  });

  it('応答待ちに別ユーザへ切り替わった場合は旧ユーザの401応答でログアウトしない', async () => {
    const requestHandler = apiClient.interceptors.request.handlers[0].fulfilled;
    const responseHandler = apiClient.interceptors.response.handlers[0].rejected;
    const calls = [];
    store.commit('setLoginUser', {
      id: 'user-a',
      role: 'Author',
      name: 'User A',
      lang: 'ja',
      imageName: null,
      token: 'user-token-a',
      eyeFriendlyMode: false,
      pushEnabled: false,
      replyPushEnabled: true,
      repliedPostPushEnabled: true,
    });
    const config = requestHandler({ url: '/user-resource', headers: {} });
    store.dispatch = (type) => {
      calls.push(type);
      return Promise.resolve();
    };
    store.commit('setLoginUser', {
      id: 'user-b',
      role: 'Editor',
      name: 'User B',
      lang: 'ja',
      imageName: null,
      token: 'user-token-b',
      eyeFriendlyMode: false,
      pushEnabled: false,
      replyPushEnabled: true,
      repliedPostPushEnabled: true,
    });
    const error = { response: { status: 401 }, config };

    const result = await responseHandler(error).catch((caught) => caught);

    expect(result).to.equal(error);
    expect(calls).to.deep.equal([]);
    expect(error.config._userLogoutHandled).to.equal(true);
    expect(store.state.user.id).to.equal('user-b');
  });
  it('ログアウトの401応答では再ログアウトやゲスト認証の更新を行わない', async () => {
    const originalDispatch = store.dispatch;
    const calls = [];
    store.dispatch = async (type) => { calls.push(type); };
    try {
      const error = { response: { status: 401 }, config: { skipAuthRecovery: true } };
      await expect(apiClient.interceptors.response.handlers[0].rejected(error)).rejects.toBe(error);
      expect(calls).toEqual([]);
    } finally { store.dispatch = originalDispatch; }
  });

});
