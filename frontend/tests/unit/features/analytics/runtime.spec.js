import { expect } from 'vitest';
import {
  GOOGLE_TAG_BASE_URL,
  GOOGLE_TAG_LOAD_TIMEOUT_MS,
  GOOGLE_TAG_SCRIPT_ID,
  createAnalyticsRuntime,
  loadGoogleTagScript,
  normalizeAnalyticsConfigResponse,
} from '@/features/analytics/runtime';

const measurementId = 'G-UNITTEST01';
const registeredUserId = `ga1_${'a'.repeat(64)}`;
const FLOOR_ID = '507F1F77BCF86CD799439011';
const ROOM_ID = '507f191e810c19729de860ea';
const TIMELINE_PAGE_LOCATION =
  `https://app.example.invalid/floor/${FLOOR_ID.toLowerCase()}/room/${ROOM_ID}`;
const fixedNow = new Date('2026-08-10T00:00:00.000Z');
const pageParameters = Object.freeze({
  page_group: 'floor_list',
  page_location: 'https://app.example.invalid/',
  page_title: 'floor_list',
});
const emptyResourceContext = Object.freeze({
  floor_id: null,
  floor_title: null,
  room_id: null,
  room_title: null,
});

const normalizeCommands = (windowObject) =>
  (windowObject.dataLayer || []).map((command) => Array.from(command));

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createHarness = ({
  windowObject = {},
  documentObject = {},
  loadGoogleTag = vi.fn().mockResolvedValue(true),
  configured = true,
} = {}) => {
  let identity = null;
  const runtime = createAnalyticsRuntime({
    windowObject,
    documentObject,
    loadGoogleTag,
    now: () => fixedNow,
    getIdentity: () => identity,
  });
  if (configured) runtime.configure({ measurementId });
  return {
    windowObject,
    documentObject,
    loadGoogleTag,
    setIdentity: (nextIdentity) => {
      identity = nextIdentity;
    },
    runtime,
  };
};

const findCommands = (windowObject, name) =>
  normalizeCommands(windowObject).filter(([commandName]) => commandName === name);

describe('アクセス解析の公開設定', () => {
  it('バックエンドの応答形式を検証し、妥当なMeasurement IDだけを受け付ける', () => {
    expect(normalizeAnalyticsConfigResponse({ data: { measurement_id: measurementId } })).to.deep.equal({
      measurementId,
    });
  });

  it.each([
    [undefined, 'responseなし'],
    [{ data: {} }, 'fieldなし'],
    [{ data: { measurement_id: 123 } }, '数値ID'],
    [{ data: { measurement_id: { toString: () => measurementId } } }, 'object ID'],
    [{ data: { measurement_id: ` ${measurementId}` } }, 'trimされていないID'],
    [{ data: { measurement_id: 'invalid' } }, 'ID不正'],
    [{ data: { measurement_id: measurementId, secret: 'must-not-pass' } }, '余分なfield'],
  ])('不正な公開設定を拒否する: %s (%s)', (response) => {
    expect(() => normalizeAnalyticsConfigResponse(response)).to.throw(
      'analytics config response is invalid'
    );
  });
});

describe('アクセス解析の起動・停止と送信', () => {
  it('生成直後は停止し、識別情報を設定するまでGoogle タグを読み込まない', async () => {
    const { runtime, windowObject, loadGoogleTag } = createHarness();

    expect(runtime.isPaused()).to.equal(true);
    expect(runtime.isReady()).to.equal(false);
    expect(runtime.isConfigured()).to.equal(true);
    expect(windowObject[`ga-disable-${measurementId}`]).to.equal(true);
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(false);
    expect(loadGoogleTag).not.toHaveBeenCalled();
  });

  it('許可済みの安全なページコンテキストがなければGoogle タグを読み込まない', async () => {
    const { runtime, loadGoogleTag, setIdentity } = createHarness();
    setIdentity({ visitorType: 'guest' });

    expect(await runtime.resume()).to.equal(false);
    expect(
      await runtime.resume({
        pageContext: {
          page_group: 'password_reset_form',
          page_location: 'https://app.example.invalid/user/resetpassword?token=secret',
          page_title: 'password_reset_form',
        },
      })
    ).to.equal(false);

    expect(loadGoogleTag).not.toHaveBeenCalled();
  });

  it('公開設定取得前は開始せず、妥当なIDを一度だけ構成する', async () => {
    const { runtime, loadGoogleTag, setIdentity } = createHarness({ configured: false });
    setIdentity({ visitorType: 'guest' });

    expect(runtime.isConfigured()).to.equal(false);
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(false);
    expect(runtime.configure({ measurementId: 'invalid' })).to.equal(false);
    expect(runtime.configure({ measurementId })).to.equal(true);
    expect(runtime.configure({ measurementId })).to.equal(true);
    expect(runtime.configure({ measurementId: 'G-DIFFERENT01' })).to.equal(false);
    expect(runtime.isConfigured()).to.equal(true);
    expect(runtime.isPaused()).to.equal(true);
    expect(loadGoogleTag).not.toHaveBeenCalled();
  });

  it('accessorのMeasurement IDを評価せず拒否する', () => {
    const readMeasurementId = vi.fn(() => measurementId);
    const data = {};
    Object.defineProperty(data, 'measurement_id', {
      enumerable: true,
      get: readMeasurementId,
    });

    expect(() => normalizeAnalyticsConfigResponse({ data })).to.throw(
      'analytics config response is invalid'
    );
    expect(readMeasurementId).not.toHaveBeenCalled();
  });

  it('内部disable フラグを書けなければ公開設定を構成しない', async () => {
    const loadGoogleTag = vi.fn().mockResolvedValue(true);
    const runtime = createAnalyticsRuntime({
      windowObject: new Proxy({}, {
        set: () => {
          throw new Error('blocked');
        },
      }),
      documentObject: {},
      loadGoogleTag,
      getIdentity: () => ({ visitorType: 'guest' }),
    });

    expect(runtime.configure({ measurementId })).to.equal(false);
    expect(runtime.isConfigured()).to.equal(false);
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(false);
    expect(loadGoogleTag).not.toHaveBeenCalled();
  });

  it('ゲストを有効化し、固定privacy 設定と信頼済みvisitor_typeだけを送る', async () => {
    const { runtime, windowObject, documentObject, loadGoogleTag, setIdentity } = createHarness();

    setIdentity({ visitorType: 'guest' });
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(true);

    expect(loadGoogleTag).toHaveBeenCalledOnce();
    expect(loadGoogleTag).toHaveBeenCalledWith({
      measurementId,
      source: `${GOOGLE_TAG_BASE_URL}?id=${measurementId}`,
      documentObject,
      windowObject,
    });
    expect(findCommands(windowObject, 'js')).to.deep.equal([['js', fixedNow]]);
    expect(findCommands(windowObject, 'config')).to.deep.equal([
      [
        'config',
        measurementId,
        {
          send_page_view: false,
          allow_google_signals: false,
          allow_ad_personalization_signals: false,
          cookie_domain: 'none',
          cookie_path: '/',
          ...pageParameters,
          page_referrer: '',
          ...emptyResourceContext,
          visitor_type: 'guest',
        },
      ],
    ]);
    expect(windowObject[`ga-disable-${measurementId}`]).to.equal(false);
    expect(
      runtime.track('page_view', {
        ...pageParameters,
        visitor_type: 'spoofed',
        user_id: 'must-not-pass-through',
      })
    ).to.equal(true);
    expect(findCommands(windowObject, 'event')).to.deep.equal([
      [
        'event',
        'page_view',
        {
          ...pageParameters,
          ...emptyResourceContext,
          visitor_type: 'guest',
        },
      ],
    ]);
  });

  it('画面遷移では旧ページの退出・次ページの設定・閲覧の順で送信する', async () => {
    const { runtime, windowObject, setIdentity } = createHarness();
    setIdentity({ visitorType: 'guest' });
    await runtime.resume({ pageContext: pageParameters });
    const nextPage = {
      page_group: 'register',
      page_location: 'https://app.example.invalid/register',
      page_title: 'register',
      page_referrer: pageParameters.page_location,
    };

    expect(runtime.track('iseeetl_page_exit', {
      ...pageParameters,
      engagement_time_msec: 12345,
    })).to.equal(true);
    expect(runtime.updatePageContext(nextPage)).to.equal(true);
    expect(runtime.track('page_view', nextPage)).to.equal(true);

    const commands = normalizeCommands(windowObject);
    const updatedConfigIndex = commands.findIndex(
      ([name, , parameters], index) => index > 0 && name === 'config' && parameters.page_group === 'register'
    );
    const exitEventIndex = commands.findIndex(
      ([name, eventName]) => name === 'event' && eventName === 'iseeetl_page_exit'
    );
    const pageViewEventIndex = commands.findIndex(
      ([name, eventName]) => name === 'event' && eventName === 'page_view'
    );
    expect(updatedConfigIndex).to.be.greaterThan(-1);
    expect(exitEventIndex).to.be.lessThan(updatedConfigIndex);
    expect(updatedConfigIndex).to.be.lessThan(pageViewEventIndex);
    expect(commands[exitEventIndex][2]).to.deep.equal({
      ...pageParameters,
      ...emptyResourceContext,
      visitor_type: 'guest',
    });
    expect(commands[exitEventIndex][2]).not.to.have.property('engagement_time_msec');
    expect(commands[pageViewEventIndex][2]).to.include({
      ...nextPage,
      ...emptyResourceContext,
      visitor_type: 'guest',
    });
    expect(commands[updatedConfigIndex][2]).to.include({
      ...nextPage,
      update: true,
      ...emptyResourceContext,
      visitor_type: 'guest',
    });
  });

  it('対象ページの設定を更新し、対象外のページでは4項目をnullで消去する', async () => {
    const { runtime, windowObject, setIdentity } = createHarness();
    setIdentity({ visitorType: 'guest' });
    await runtime.resume({
      pageContext: {
        page_group: 'timeline',
        page_location: TIMELINE_PAGE_LOCATION,
        page_title: 'timeline',
        floor_id: FLOOR_ID,
        floor_title: 'フロアA',
        room_id: ROOM_ID,
        room_title: 'ルームA',
      },
    });

    expect(runtime.updatePageContext(pageParameters)).to.equal(true);
    const configs = findCommands(windowObject, 'config');
    expect(configs[0][2]).to.include({
      floor_id: FLOOR_ID.toLowerCase(),
      floor_title: 'フロアA',
      room_id: ROOM_ID,
      room_title: 'ルームA',
    });
    expect(configs[0][2]).not.to.have.property('update');
    expect(configs[1][2]).to.include({ update: true, ...emptyResourceContext });
  });

  it('登録ユーザ識別情報だけをUser-IDとして設定し、イベントには混入させない', async () => {
    const { runtime, windowObject, setIdentity } = createHarness();

    setIdentity({
      visitorType: 'registered',
      userId: registeredUserId,
    });
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(true);
    expect(
      runtime.track('timeline_view', {
        floor_id: '507f1f77bcf86cd799439011',
        room_id: '507f191e810c19729de860ea',
      })
    ).to.equal(true);

    expect(findCommands(windowObject, 'config')[0][2]).to.deep.equal({
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_domain: 'none',
      cookie_path: '/',
      ...pageParameters,
      page_referrer: '',
      ...emptyResourceContext,
      visitor_type: 'registered',
      user_id: registeredUserId,
    });
    expect(findCommands(windowObject, 'event')).to.deep.equal([
      [
        'event',
        'timeline_view',
        {
          floor_id: '507f1f77bcf86cd799439011',
          room_id: '507f191e810c19729de860ea',
          visitor_type: 'registered',
        },
      ],
    ]);
  });

  it.each([
    [{ visitorType: 'guest', userId: registeredUserId }, 'guestへのUser-ID'],
    [{ visitorType: 'registered' }, 'User-IDなしregistered'],
    [{ visitorType: 'registered', userId: 'ga1_invalid' }, '形式不正User-ID'],
    [{ visitorType: 'admin' }, '未許可visitor type'],
  ])('不正な識別情報を拒否する: %s', async (identity) => {
    const { runtime, windowObject, loadGoogleTag, setIdentity } = createHarness();

    setIdentity(identity);
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(false);
    expect(runtime.isPaused()).to.equal(true);
    expect(windowObject[`ga-disable-${measurementId}`]).to.equal(true);
    expect(loadGoogleTag).not.toHaveBeenCalled();
  });

  it('一時停止中は送信せず、再開時は読込済みのタグを再利用して設定を適用する', async () => {
    const { runtime, windowObject, loadGoogleTag, setIdentity } = createHarness();
    setIdentity({ visitorType: 'guest' });
    await runtime.resume({ pageContext: pageParameters });

    expect(runtime.pause()).to.equal(true);
    expect(runtime.track('page_view', pageParameters)).to.equal(false);
    expect(runtime.isReady()).to.equal(false);
    expect(windowObject[`ga-disable-${measurementId}`]).to.equal(true);

    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(true);
    expect(loadGoogleTag).toHaveBeenCalledOnce();
    expect(findCommands(windowObject, 'js')).to.have.length(1);
    expect(findCommands(windowObject, 'config')).to.have.length(2);
    expect(findCommands(windowObject, 'config')[0][2]).not.to.have.property('update');
    expect(findCommands(windowObject, 'config')[1][2]).to.include({ update: true });
  });

  it('稼働後に内部disable フラグを再設定できなければpause失敗を返す', async () => {
    let blockDisable = false;
    const target = {};
    const windowObject = new Proxy(target, {
      set(object, key, value) {
        if (blockDisable && key === `ga-disable-${measurementId}`) {
          throw new Error('blocked');
        }
        object[key] = value;
        return true;
      },
    });
    const { runtime, setIdentity } = createHarness({ windowObject });
    setIdentity({ visitorType: 'guest' });
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(true);

    blockDisable = true;

    expect(runtime.pause()).to.equal(false);
    expect(runtime.isPaused()).to.equal(true);
    expect(runtime.isReady()).to.equal(false);
  });

  it('一時停止前に始めたタグ読込が完了しても初期化せず、次の処理世代だけを有効にする', async () => {
    const deferred = createDeferred();
    const loadGoogleTag = vi.fn(() => deferred.promise);
    const { runtime, windowObject, setIdentity } = createHarness({ loadGoogleTag });
    setIdentity({ visitorType: 'guest' });

    const firstResume = runtime.resume({ pageContext: pageParameters });
    await Promise.resolve();
    await Promise.resolve();
    expect(loadGoogleTag).toHaveBeenCalledOnce();

    runtime.pause();
    deferred.resolve(true);
    expect(await firstResume).to.equal(false);
    expect(normalizeCommands(windowObject)).to.deep.equal([]);
    expect(windowObject[`ga-disable-${measurementId}`]).to.equal(true);

    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(true);
    expect(loadGoogleTag).toHaveBeenCalledOnce();
    expect(findCommands(windowObject, 'config')).to.have.length(1);
  });

  it('終了前に始めたタグ読込の結果と、その後の操作を受け付けない', async () => {
    const deferred = createDeferred();
    const { runtime, windowObject, setIdentity } = createHarness({
      loadGoogleTag: vi.fn(() => deferred.promise),
    });
    setIdentity({ visitorType: 'guest' });

    const pendingResume = runtime.resume({ pageContext: pageParameters });
    await Promise.resolve();
    runtime.dispose();
    deferred.resolve(true);

    expect(await pendingResume).to.equal(false);
    expect(normalizeCommands(windowObject)).to.deep.equal([]);
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(false);
    expect(runtime.track('page_view', pageParameters)).to.equal(false);
  });

  it('タグ読込の失敗は例外にせず計測を止め、次の再開で再試行できる', async () => {
    const loadGoogleTag = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true);
    const { runtime, windowObject, setIdentity } = createHarness({ loadGoogleTag });
    setIdentity({ visitorType: 'guest' });

    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(false);
    expect(runtime.isPaused()).to.equal(true);
    expect(windowObject[`ga-disable-${measurementId}`]).to.equal(true);

    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(true);
    expect(loadGoogleTag).toHaveBeenCalledTimes(2);
  });

  it('dataLayerの障害を計測の呼出元へ例外として返さない', async () => {
    const { runtime, windowObject, setIdentity } = createHarness();
    setIdentity({ visitorType: 'guest' });
    await runtime.resume({ pageContext: pageParameters });
    windowObject.dataLayer = {
      push: () => {
        throw new Error('blocked');
      },
    };

    expect(() => runtime.track('page_view', pageParameters)).not.to.throw();
    expect(runtime.track('page_view', pageParameters)).to.equal(false);
  });

  it('未知イベントと許可リスト外パラメータを送らず、accessorを評価しない', async () => {
    const { runtime, windowObject, setIdentity } = createHarness();
    setIdentity({ visitorType: 'guest' });
    await runtime.resume({ pageContext: pageParameters });
    const parameters = { ...pageParameters, raw_token: 'must-not-pass-through' };
    Object.defineProperty(parameters, 'email', {
      enumerable: true,
      get: () => {
        throw new Error('アクセサを読み取ってはいけません');
      },
    });

    expect(runtime.track('unknown_event', parameters)).to.equal(false);
    expect(runtime.track('user_engagement', {
      ...pageParameters,
      engagement_time_msec: 1000,
    })).to.equal(false);
    expect(runtime.track('page_view', parameters)).to.equal(true);
    expect(findCommands(windowObject, 'event')).to.deep.equal([
      [
        'event',
        'page_view',
        { ...pageParameters, ...emptyResourceContext, visitor_type: 'guest' },
      ],
    ]);
  });

  it('ログアウト時のUser-ID解除を一度だけ積み、その後ゲストコンテキストへ移行できる', async () => {
    const { runtime, windowObject, setIdentity } = createHarness();
    setIdentity({ visitorType: 'registered', userId: registeredUserId });
    await runtime.resume({ pageContext: pageParameters });
    runtime.pause();

    expect(runtime.clearUserIdentity()).to.equal(true);
    expect(runtime.clearUserIdentity()).to.equal(false);
    expect(
      findCommands(windowObject, 'config').filter(([, , config]) => config.user_id === null)
    ).to.have.length(1);
    expect(
      findCommands(windowObject, 'config').find(([, , config]) => config.user_id === null)[2]
    ).to.include({ update: true, ...emptyResourceContext });

    setIdentity({ visitorType: 'guest' });
    expect(await runtime.resume({ pageContext: pageParameters })).to.equal(true);
    expect(runtime.track('page_view', pageParameters)).to.equal(true);
    expect(findCommands(windowObject, 'event').at(-1)[2].visitor_type).to.equal('guest');
  });

  it('実行環境ごとに識別情報・dataLayer・タグ loaderを分離する', async () => {
    const first = createHarness();
    const second = createHarness();
    first.setIdentity({ visitorType: 'registered', userId: registeredUserId });
    second.setIdentity({ visitorType: 'guest' });

    await Promise.all([
      first.runtime.resume({ pageContext: pageParameters }),
      second.runtime.resume({ pageContext: pageParameters }),
    ]);
    first.runtime.track('page_view', pageParameters);
    second.runtime.track('page_view', pageParameters);

    expect(first.windowObject.dataLayer).not.to.equal(second.windowObject.dataLayer);
    expect(findCommands(first.windowObject, 'event')[0][2].visitor_type).to.equal('registered');
    expect(findCommands(second.windowObject, 'event')[0][2].visitor_type).to.equal('guest');
    expect(first.loadGoogleTag).toHaveBeenCalledOnce();
    expect(second.loadGoogleTag).toHaveBeenCalledOnce();
  });
});

describe('Google計測タグの読込', () => {
  it('固定ID・Measurement ID・async属性でscriptを動的追加する', async () => {
    const listeners = new Map();
    const script = {
      dataset: {},
      addEventListener: vi.fn((name, handler) => listeners.set(name, handler)),
      removeEventListener: vi.fn(),
      remove: vi.fn(),
    };
    const documentObject = {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => script),
      head: { appendChild: vi.fn() },
    };
    const windowObject = {
      setTimeout: vi.fn(() => 17),
      clearTimeout: vi.fn(),
    };

    const load = loadGoogleTagScript({ measurementId, documentObject, windowObject });

    expect(documentObject.createElement).toHaveBeenCalledWith('script');
    expect(script.id).to.equal(GOOGLE_TAG_SCRIPT_ID);
    expect(script.src).to.equal(`${GOOGLE_TAG_BASE_URL}?id=${measurementId}`);
    expect(script.async).to.equal(true);
    expect(documentObject.head.appendChild).toHaveBeenCalledWith(script);
    expect(windowObject.setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      GOOGLE_TAG_LOAD_TIMEOUT_MS
    );

    listeners.get('load')();
    expect(await load).to.equal(true);
    expect(script.dataset.loaded).to.equal('true');
    expect(windowObject.clearTimeout).toHaveBeenCalledWith(17);
  });

  it.each([
    ['error', 'Google tag failed to load.'],
    ['timeout', 'Google tag load timed out.'],
  ])('%s時はscriptを除去して失敗する', async (failureType, message) => {
    const listeners = new Map();
    let timeoutHandler;
    const script = {
      dataset: {},
      addEventListener: vi.fn((name, handler) => listeners.set(name, handler)),
      removeEventListener: vi.fn(),
      remove: vi.fn(),
    };
    const documentObject = {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => script),
      head: { appendChild: vi.fn() },
    };
    const windowObject = {
      setTimeout: vi.fn((handler) => {
        timeoutHandler = handler;
        return 19;
      }),
      clearTimeout: vi.fn(),
    };
    const loading = loadGoogleTagScript({ measurementId, documentObject, windowObject });

    if (failureType === 'error') listeners.get('error')();
    else timeoutHandler();

    await expect(loading).rejects.toThrow(message);
    expect(script.remove).toHaveBeenCalledOnce();
  });

  it('既存の同一タグは再利用し、異なるMeasurement IDとの混在を拒否する', async () => {
    const sameScript = {
      src: `${GOOGLE_TAG_BASE_URL}?id=${measurementId}`,
      dataset: { loaded: 'true' },
    };
    expect(
      await loadGoogleTagScript({
        measurementId,
        documentObject: { getElementById: () => sameScript },
        windowObject: {},
      })
    ).to.equal(true);

    await expect(
      loadGoogleTagScript({
        measurementId,
        documentObject: {
          getElementById: () => ({
            src: `${GOOGLE_TAG_BASE_URL}?id=G-OTHER`,
            dataset: { loaded: 'true' },
          }),
        },
        windowObject: {},
      })
    ).rejects.toThrow('Google tag already uses a different Measurement ID.');
  });
});
