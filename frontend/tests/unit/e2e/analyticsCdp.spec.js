import { EventEmitter } from 'node:events';

import { expect, vi } from 'vitest';

import {
  E2E_ANALYTICS_MEASUREMENT_ID,
  E2E_GOOGLE_TAG_URL,
  FETCH_PATTERNS,
  captureCookiePolicyLinkState,
  captureCookiePolicyLocationState,
  captureDataLayerState,
  classifyAnalyticsConfigRequest,
  classifyAnalyticsIdentityRequest,
  classifyAnalyticsRequest,
  createDataLayerCheckpoint,
  finalizeAnalyticsCdpGuardWithBrowserClose,
  installAnalyticsCdpGuard,
  isAnalyticsConfigRequest,
  isAnalyticsIdentityRequest,
  readSafeDataLayerSummary,
  readSafeNetworkSummary,
  respondToPausedRequest,
  validateAnalyticsBrowserCloseSummary,
  waitForAnalyticsDataLayer,
} from '../../e2e/specs/helpers/analytics-cdp';

const PAGE = Object.freeze({
  page_group: 'login',
  page_location: 'http://localhost:3100/login',
  page_title: 'login',
});
const EMPTY_RESOURCE = Object.freeze({
  floor_id: null,
  floor_title: null,
  room_id: null,
  room_title: null,
});
const FLOOR_OBJECT_ID = '507f1f77bcf86cd799439011';
const ROOM_OBJECT_ID = '507f191e810c19729de860ea';
const FIXED_CONFIG = Object.freeze({
  send_page_view: false,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_domain: 'none',
  cookie_path: '/',
});
const config = (identity, overrides = {}) => [
  'config',
  E2E_ANALYTICS_MEASUREMENT_ID,
  { ...FIXED_CONFIG, ...PAGE, ...EMPTY_RESOURCE, ...identity, ...overrides },
];
const updatedConfig = (identity, overrides = {}) =>
  config(identity, { update: true, ...overrides });
const pageView = (visitorType = 'guest', overrides = {}) => [
  'event',
  'page_view',
  { ...PAGE, ...EMPTY_RESOURCE, visitor_type: visitorType, ...overrides },
];
const pageExit = (visitorType = 'guest', overrides = {}) => [
  'event',
  'iseeetl_page_exit',
  { ...PAGE, ...EMPTY_RESOURCE, visitor_type: visitorType, ...overrides },
];
const roomListPage = Object.freeze({
  page_group: 'room_list',
  page_location: `http://localhost:3100/floor/${FLOOR_OBJECT_ID}`,
  page_title: 'room_list',
});
const roomListResource = Object.freeze({
  floor_id: FLOOR_OBJECT_ID,
  floor_title: 'Floor A',
  room_id: null,
  room_title: null,
});
const timelinePage = Object.freeze({
  page_group: 'timeline',
  page_location:
    `http://localhost:3100/floor/${FLOOR_OBJECT_ID}/room/${ROOM_OBJECT_ID}`,
  page_title: 'timeline',
});
const timelineResource = Object.freeze({
  floor_id: FLOOR_OBJECT_ID,
  floor_title: 'Floor A',
  room_id: ROOM_OBJECT_ID,
  room_title: 'Room A',
});
const browserFor = (connection) => ({
  launchUrl: 'http://localhost:3100',
  driver: { createCDPConnection: vi.fn(async () => connection) },
});
const emitCdp = (socket, payload) => {
  socket.emit('message', Buffer.from(JSON.stringify(payload)));
};

describe('アクセス解析E2Eの外部通信制御', () => {
  it('既知のダミーMeasurement IDだけをモック対象にする', () => {
    expect(classifyAnalyticsRequest(E2E_GOOGLE_TAG_URL)).to.equal('dummy-tag');
    expect(
      classifyAnalyticsRequest(
        `https://www.googletagmanager.com/gtag/js?id=${E2E_ANALYTICS_MEASUREMENT_ID}&extra=1`
      )
    ).to.equal('unexpected-tag');
    expect(
      classifyAnalyticsRequest('https://www.googletagmanager.com/gtag/js?id=G-OTHER123')
    ).to.equal('unexpected-tag');
    expect(
      classifyAnalyticsRequest(
        `http://www.googletagmanager.com/gtag/js?id=${E2E_ANALYTICS_MEASUREMENT_ID}`
      )
    ).to.equal('unexpected-tag');
    expect(
      classifyAnalyticsRequest(
        `https://user@www.googletagmanager.com/gtag/js?id=${E2E_ANALYTICS_MEASUREMENT_ID}`
      )
    ).to.equal('unexpected-tag');
    expect(
      classifyAnalyticsRequest(
        `https://www.googletagmanager.com:444/gtag/js?id=${E2E_ANALYTICS_MEASUREMENT_ID}`
      )
    ).to.equal('unexpected-tag');
    expect(classifyAnalyticsRequest(`${E2E_GOOGLE_TAG_URL}&`)).to.equal('unexpected-tag');
  });

  it.each([
    'https://www.google-analytics.com/g/collect?v=2',
    'https://analytics.google.com/g/collect?v=2',
    'https://region1.google-analytics.com/g/collect?v=2',
  ])('GA4 collection host/pathだけをcollectionとして分類する: %s', (url) => {
    expect(classifyAnalyticsRequest(url)).to.equal('collection');
  });

  it.each([
    'https://fonts.googleapis.com/css2?family=Noto+Sans',
    'https://fonts.gstatic.com/s/example.woff2',
    'https://accounts.google.com/gsi/client',
    'https://www.google-analytics.com/analytics.js',
    'https://example.invalid/g/collect',
  ])('Google Fonts／GSI等をGA4通信判定へ含めない: %s', (url) => {
    expect(classifyAnalyticsRequest(url)).to.equal('unrelated');
  });

  it('ダミーの計測タグには空のJSを返し、不正なタグと計測送信をブラウザ内で遮断する', async () => {
    const send = vi.fn(async () => ({ result: {} }));
    const connection = { send };
    const state = {
      dummyTagRequestCount: 0,
      unexpectedTagRequestCount: 0,
      collectionRequestCount: 0,
    };

    await expect(
      respondToPausedRequest(connection, state, { requestId: 'tag', url: E2E_GOOGLE_TAG_URL })
    ).resolves.to.equal('dummy-tag');
    await expect(
      respondToPausedRequest(connection, state, {
        requestId: 'wrong-tag',
        url: 'https://www.googletagmanager.com/gtag/js?id=G-OTHER123',
      })
    ).resolves.to.equal('unexpected-tag');
    await expect(
      respondToPausedRequest(connection, state, {
        requestId: 'collect',
        url: 'https://www.google-analytics.com/g/collect?v=2',
      })
    ).resolves.to.equal('collection');

    expect(send.mock.calls.map(([method]) => method)).to.deep.equal([
      'Fetch.fulfillRequest',
      'Fetch.failRequest',
      'Fetch.failRequest',
    ]);
    expect(send.mock.calls[0][1]).to.include({
      requestId: 'tag',
      responseCode: 200,
      body: '',
    });
    expect(readSafeNetworkSummary(state)).to.include({
      dummyTagRequestCount: 1,
      unexpectedTagRequestCount: 1,
      collectionRequestCount: 1,
    });
  });

  it('IdentityはGETの固定パスだけを許可し、クエリ・メソッド違いを異常件数へ分離する', () => {
    const origin = 'http://localhost:3100';
    expect(
      classifyAnalyticsIdentityRequest(`${origin}/api/analytics/identity`, 'GET', origin)
    ).to.equal('identity');
    expect(
      classifyAnalyticsIdentityRequest(
        `${origin}/api/analytics/identity?token=hidden`,
        'GET',
        origin
      )
    ).to.equal('unexpected-identity');
    expect(
      classifyAnalyticsIdentityRequest(`${origin}/api/analytics/identity`, 'POST', origin)
    ).to.equal('unexpected-identity');
    expect(
      classifyAnalyticsIdentityRequest(
        'http://localhost:5100/api/analytics/identity',
        'GET',
        origin
      )
    ).to.equal('unrelated');
    expect(isAnalyticsIdentityRequest(`${origin}/api/analytics/identity`, origin)).to.equal(true);
  });

  it('ConfigはGETの固定パスだけを許可し、クエリ・メソッド違いを異常件数へ分離する', () => {
    const origin = 'http://localhost:3100';
    expect(
      classifyAnalyticsConfigRequest(`${origin}/api/analytics/config`, 'GET', origin)
    ).to.equal('config');
    expect(
      classifyAnalyticsConfigRequest(`${origin}/api/analytics/config?measurement_id=hidden`, 'GET', origin)
    ).to.equal('unexpected-config');
    expect(
      classifyAnalyticsConfigRequest(`${origin}/api/analytics/config`, 'POST', origin)
    ).to.equal('unexpected-config');
    expect(
      classifyAnalyticsConfigRequest('http://localhost:5100/api/analytics/config', 'GET', origin)
    ).to.equal('unrelated');
    expect(isAnalyticsConfigRequest(`${origin}/api/analytics/config`, origin)).to.equal(true);
  });

  it('画面遷移前に対象通信だけを捕捉し、繰り返し停止でき、結果は件数だけを公開する', async () => {
    const socket = new EventEmitter();
    const send = vi.fn(async () => ({ result: {} }));
    const connection = { _wsConnection: socket, send };
    const guard = await installAnalyticsCdpGuard(browserFor(connection));

    expect(send.mock.calls).to.deep.equal([
      ['Network.enable', {}],
      ['Fetch.enable', { patterns: FETCH_PATTERNS }],
    ]);
    emitCdp(socket, {
      method: 'Fetch.requestPaused',
      params: { requestId: 'tag', request: { url: E2E_GOOGLE_TAG_URL } },
    });
    emitCdp(socket, {
      method: 'Network.requestWillBeSent',
      params: {
        request: { method: 'GET', url: 'http://localhost:3100/api/analytics/config' },
      },
    });
    emitCdp(socket, {
      method: 'Network.requestWillBeSent',
      params: {
        request: {
          method: 'GET',
          url: 'http://localhost:3100/api/analytics/config?unexpected=1',
        },
      },
    });
    emitCdp(socket, {
      method: 'Network.requestWillBeSent',
      params: {
        request: { method: 'GET', url: 'http://localhost:3100/api/analytics/identity' },
      },
    });
    emitCdp(socket, {
      method: 'Network.requestWillBeSent',
      params: {
        request: {
          method: 'GET',
          url: 'http://localhost:3100/api/analytics/identity?unexpected=1',
        },
      },
    });

    await vi.waitFor(() => expect(guard.summary().pendingRequestCount).to.equal(0));
    expect(guard.summary()).to.include({
      dummyTagRequestCount: 1,
      configRequestCount: 1,
      unexpectedConfigRequestCount: 1,
      identityRequestCount: 1,
      unexpectedIdentityRequestCount: 1,
      listenerAttached: true,
      stopped: false,
    });
    expect(Object.keys(guard.summary())).not.to.include.members(['url', 'query', 'body']);

    const firstStop = guard.stop();
    const secondStop = guard.stop();
    expect(secondStop).to.equal(firstStop);
    await firstStop;
    expect(send.mock.calls.slice(-2)).to.deep.equal([
      ['Fetch.disable', {}],
      ['Network.disable', {}],
    ]);
    expect(guard.summary()).to.include({
      listenerAttached: false,
      pendingRequestCount: 0,
      stopped: true,
      teardownErrorCount: 0,
    });
  });

  it('通信捕捉の初期化に失敗しても開始済みの機能とリスナーを片付ける', async () => {
    const socket = new EventEmitter();
    const send = vi.fn(async (method) => {
      if (method === 'Fetch.enable') throw new Error('private driver failure');
      return { result: {} };
    });
    const connection = { _wsConnection: socket, send };

    await expect(installAnalyticsCdpGuard(browserFor(connection))).rejects.to.throw(
      '有効にできませんでした'
    );
    expect(send.mock.calls.map(([method]) => method)).to.deep.equal([
      'Network.enable',
      'Fetch.enable',
      'Network.disable',
    ]);
    expect(socket.listenerCount('message')).to.equal(0);
    expect(socket.listenerCount('error')).to.equal(0);
    expect(socket.listenerCount('close')).to.equal(0);
  });

  it('停止エラーを通知しつつ、残りの機能停止とリスナー解除を最後まで行う', async () => {
    const socket = new EventEmitter();
    const send = vi.fn(async (method) => {
      if (method === 'Fetch.disable') throw new Error('private driver failure');
      return { result: {} };
    });
    const guard = await installAnalyticsCdpGuard(
      browserFor({ _wsConnection: socket, send })
    );

    await expect(guard.stop()).rejects.to.throw('安全に停止できませんでした');
    expect(send.mock.calls.slice(-2).map(([method]) => method)).to.deep.equal([
      'Fetch.disable',
      'Network.disable',
    ]);
    expect(guard.summary()).to.include({
      teardownErrorCount: 1,
      listenerAttached: false,
      stopped: true,
    });
  });

  it('停止中の保留リクエストを完了してからFetchとNetworkを順に停止する', async () => {
    const socket = new EventEmitter();
    let releaseFulfill;
    const fulfillPending = new Promise((resolve) => {
      releaseFulfill = resolve;
    });
    const send = vi.fn(async (method) => {
      if (method === 'Fetch.fulfillRequest') return fulfillPending;
      return { result: {} };
    });
    const guard = await installAnalyticsCdpGuard(
      browserFor({ _wsConnection: socket, send })
    );
    emitCdp(socket, {
      method: 'Fetch.requestPaused',
      params: { requestId: 'tag', request: { url: E2E_GOOGLE_TAG_URL } },
    });
    await vi.waitFor(() => expect(guard.summary().pendingRequestCount).to.equal(1));

    const stopping = guard.stop();
    await Promise.resolve();
    expect(send.mock.calls.map(([method]) => method)).not.to.include('Fetch.disable');
    releaseFulfill({ result: {} });
    await stopping;

    expect(send.mock.calls.map(([method]) => method)).to.deep.equal([
      'Network.enable',
      'Fetch.enable',
      'Fetch.fulfillRequest',
      'Fetch.disable',
      'Network.disable',
    ]);
    expect(guard.summary().pendingRequestCount).to.equal(0);
  });

  it('Fetchの停止待ちに届いた保留リクエストもNetwork停止前に完了する', async () => {
    const socket = new EventEmitter();
    let releaseDisable;
    let releaseFulfill;
    const disablePending = new Promise((resolve) => {
      releaseDisable = resolve;
    });
    const fulfillPending = new Promise((resolve) => {
      releaseFulfill = resolve;
    });
    const send = vi.fn(async (method) => {
      if (method === 'Fetch.disable') return disablePending;
      if (method === 'Fetch.fulfillRequest') return fulfillPending;
      return { result: {} };
    });
    const guard = await installAnalyticsCdpGuard(
      browserFor({ _wsConnection: socket, send })
    );

    const stopping = guard.stop();
    await vi.waitFor(() =>
      expect(send.mock.calls.map(([method]) => method)).to.include('Fetch.disable')
    );
    emitCdp(socket, {
      method: 'Fetch.requestPaused',
      params: { requestId: 'during-stop', request: { url: E2E_GOOGLE_TAG_URL } },
    });
    await vi.waitFor(() => expect(guard.summary().pendingRequestCount).to.equal(1));
    releaseDisable({ result: {} });
    await Promise.resolve();
    expect(send.mock.calls.map(([method]) => method)).not.to.include('Network.disable');
    releaseFulfill({ result: {} });
    await stopping;

    expect(send.mock.calls.map(([method]) => method)).to.deep.equal([
      'Network.enable',
      'Fetch.enable',
      'Fetch.disable',
      'Fetch.fulfillRequest',
      'Network.disable',
    ]);
    expect(guard.summary()).to.include({
      pendingRequestCount: 0,
      listenerAttached: false,
      stopped: true,
    });
  });

  it('CDP接続のエラーと切断を内容を含めない異常件数として記録する', async () => {
    const socket = new EventEmitter();
    const send = vi.fn(async () => ({ result: {} }));
    const guard = await installAnalyticsCdpGuard(
      browserFor({ _wsConnection: socket, send })
    );

    socket.emit('error', new Error('private socket failure'));
    socket.emit('close');
    expect(guard.summary().connectionErrorCount).to.equal(2);
    await guard.stop();
  });

  it('Cookieポリシーのリンクはオリジン・パス・クエリが一致し、ハッシュがない場合だけ許可する', () => {
    const origin = window.location.origin;
    document.body.innerHTML = '<a data-testid="cookie-link">Cookie</a>';
    const link = document.querySelector('[data-testid="cookie-link"]');
    link.getClientRects = () => [{}];

    link.href = `${origin}/cookie`;
    expect(
      captureCookiePolicyLinkState('[data-testid="cookie-link"]', origin, '', '')
    ).to.deep.equal({
      exactlyOneVisible: true,
      sameOrigin: true,
      noCredentials: true,
      cookiePath: true,
      noHash: true,
      allowedQueryOnly: true,
      roomContextMatches: true,
    });

    link.href = `${origin}/cookie?floor_id=floor-1&room_id=room-1`;
    const context = captureCookiePolicyLinkState(
      '[data-testid="cookie-link"]',
      origin,
      'floor-1',
      'room-1'
    );
    expect(context.allowedQueryOnly).to.equal(true);
    expect(context.roomContextMatches).to.equal(true);

    link.href = `${origin}/cookie?floor_id=floor-1`;
    const missingRoom = captureCookiePolicyLinkState(
      '[data-testid="cookie-link"]',
      origin,
      'floor-1',
      'room-1'
    );
    expect(missingRoom.allowedQueryOnly).to.equal(false);
    expect(missingRoom.roomContextMatches).to.equal(false);

    link.href = `${origin}/cookie?floor_id=floor-1&room_id=wrong-room`;
    expect(
      captureCookiePolicyLinkState(
        '[data-testid="cookie-link"]',
        origin,
        'floor-1',
        'room-1'
      ).roomContextMatches
    ).to.equal(false);

    link.href = `${origin}/cookie?floor_id=floor-1&room_id=room-1&extra=1`;
    expect(
      captureCookiePolicyLinkState(
        '[data-testid="cookie-link"]',
        origin,
        'floor-1',
        'room-1'
      ).allowedQueryOnly
    ).to.equal(false);
    link.href = `${origin}/cookie?floor_id=floor-1&floor_id=floor-1&room_id=room-1`;
    expect(
      captureCookiePolicyLinkState(
        '[data-testid="cookie-link"]',
        origin,
        'floor-1',
        'room-1'
      ).allowedQueryOnly
    ).to.equal(false);
    link.href = `${origin}/cookie?floor_id=floor-1&room_id=room-1#unsafe`;
    expect(
      captureCookiePolicyLinkState(
        '[data-testid="cookie-link"]',
        origin,
        'floor-1',
        'room-1'
      ).noHash
    ).to.equal(false);
    link.href = 'https://example.invalid/cookie';
    expect(
      captureCookiePolicyLinkState('[data-testid="cookie-link"]', origin, '', '').sameOrigin
    ).to.equal(false);
    link.href = `${origin}/cookie`;
    expect(
      captureCookiePolicyLinkState(
        '[data-testid="cookie-link"]',
        'https://example.invalid',
        '',
        ''
      ).sameOrigin
    ).to.equal(false);
    document.body.innerHTML = '';
  });

  it('Cookieポリシーの表示先は同一オリジンの固定パスで、クエリとハッシュがない場合だけ許可する', () => {
    const originalLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const origin = window.location.origin;
    try {
      window.history.replaceState({}, '', '/cookie');
      expect(captureCookiePolicyLocationState(origin)).to.deep.equal({
        sameOrigin: true,
        noCredentials: true,
        cookiePath: true,
        noQuery: true,
        noHash: true,
      });
      expect(captureCookiePolicyLocationState('https://example.invalid').sameOrigin).to.equal(false);
      window.history.replaceState({}, '', '/cookie?extra=1#unsafe');
      const unsafe = captureCookiePolicyLocationState(origin);
      expect(unsafe.noQuery).to.equal(false);
      expect(unsafe.noHash).to.equal(false);
    } finally {
      window.history.replaceState({}, '', originalLocation || '/');
    }
  });

  it('ブラウザを閉じるまで通信制御を維持し、終了後に件数を確定する', async () => {
    const socket = new EventEmitter();
    const send = vi.fn(async () => ({ result: {} }));
    const browser = browserFor({ _wsConnection: socket, send });
    browser.end = vi.fn((callback) => {
      socket.emit('close');
      callback();
    });
    const guard = await installAnalyticsCdpGuard(browser);

    await expect(
      new Promise((resolve, reject) => {
        finalizeAnalyticsCdpGuardWithBrowserClose(
          browser,
          guard,
          { dummyTagRequestCount: 0, identityRequestCount: 0 },
          'Unitテストのブラウザ終了',
          (error) => (error ? reject(error) : resolve())
        );
      })
    ).resolves.to.equal(undefined);

    expect(send.mock.calls.map(([method]) => method)).to.deep.equal([
      'Network.enable',
      'Fetch.enable',
    ]);
    expect(browser.end).toHaveBeenCalledTimes(1);
    expect(guard.summary()).to.include({
      browserClosePrepared: true,
      browserCloseObserved: true,
      unexpectedCloseCount: 0,
      pendingRequestAtCloseCount: 0,
      connectionErrorCount: 0,
      listenerAttached: false,
      stopped: true,
    });
  });

  it('ブラウザ終了時に未完了の処理が残っていれば集計不一致として失敗にする', async () => {
    const socket = new EventEmitter();
    let releaseFulfill;
    const fulfillPending = new Promise((resolve) => {
      releaseFulfill = resolve;
    });
    const send = vi.fn(async (method) => {
      if (method === 'Fetch.fulfillRequest') return fulfillPending;
      return { result: {} };
    });
    const guard = await installAnalyticsCdpGuard(
      browserFor({ _wsConnection: socket, send })
    );
    await guard.prepareForBrowserClose();
    emitCdp(socket, {
      method: 'Fetch.requestPaused',
      params: { requestId: 'at-close', request: { url: E2E_GOOGLE_TAG_URL } },
    });
    await vi.waitFor(() => expect(guard.summary().pendingRequestCount).to.equal(1));

    socket.emit('close');
    await guard.waitForBrowserClose();
    const validation = validateAnalyticsBrowserCloseSummary(guard.summary(), {
      dummyTagRequestCount: 1,
      identityRequestCount: 0,
    });
    expect(validation.ok).to.equal(false);
    expect(validation.mismatchedFields).to.include('pendingRequestAtCloseCount');
    releaseFulfill({ result: {} });
    await vi.waitFor(() => expect(guard.summary().pendingRequestCount).to.equal(0));
  });

  it('準備前の予期しない切断と、終了を確認できないタイムアウトを拒否する', async () => {
    const unexpectedSocket = new EventEmitter();
    const unexpectedGuard = await installAnalyticsCdpGuard(
      browserFor({
        _wsConnection: unexpectedSocket,
        send: vi.fn(async () => ({ result: {} })),
      })
    );
    unexpectedSocket.emit('close');
    await expect(unexpectedGuard.prepareForBrowserClose()).rejects.to.throw('準備できません');
    expect(unexpectedGuard.summary()).to.include({
      browserCloseObserved: true,
      unexpectedCloseCount: 1,
      connectionErrorCount: 1,
    });

    const timeoutSocket = new EventEmitter();
    const timeoutGuard = await installAnalyticsCdpGuard(
      browserFor({
        _wsConnection: timeoutSocket,
        send: vi.fn(async () => ({ result: {} })),
      })
    );
    await timeoutGuard.prepareForBrowserClose();
    await expect(timeoutGuard.waitForBrowserClose(5)).rejects.to.throw('確認できませんでした');
    expect(timeoutGuard.summary()).to.include({
      browserCloseTimeoutCount: 1,
      browserCloseObserved: false,
      listenerAttached: false,
      stopped: true,
    });
  });
});

describe('アクセス解析E2EのdataLayer送信内容と順序', () => {
  const originalDataLayer = window.dataLayer;

  afterEach(() => {
    window.dataLayer = originalDataLayer;
  });

  it('各検証段階はコマンド実行時の最新位置から確認する', () => {
    const checkpoint = createDataLayerCheckpoint();
    const performQueue = [];
    const observedStartIndices = [];
    const endIndices = [4, 7];
    const browser = {
      assert: { ok: vi.fn() },
      execute: vi.fn((_capture, [options], callback) => {
        observedStartIndices.push(options.startIndex);
        callback({ value: { ready: true, endIndex: endIndices.shift() } });
        return browser;
      }),
      perform: vi.fn((callback) => {
        performQueue.push(callback);
        return browser;
      }),
    };

    waitForAnalyticsDataLayer(browser, checkpoint, {}, '第1段階');
    waitForAnalyticsDataLayer(browser, checkpoint, {}, '第2段階');

    expect(checkpoint.index).to.equal(0);
    expect(performQueue).to.have.lengthOf(2);
    performQueue.shift()();
    expect(checkpoint.index).to.equal(4);
    performQueue.shift()();

    expect(observedStartIndices).to.deep.equal([0, 4]);
    expect(checkpoint.index).to.equal(7);
    expect(browser.assert.ok).toHaveBeenCalledTimes(2);
  });

  it('初回ゲストのpage_viewは計測ID・識別情報・件数・値をすべて検証する', () => {
    window.dataLayer = [
      ['js', new Date('2026-01-01T00:00:00Z')],
      config({ visitor_type: 'guest' }),
      updatedConfig({ visitor_type: 'guest' }),
      pageView('guest'),
    ];

    const summary = captureDataLayerState({
      startIndex: 0,
      expectedJsCount: 1,
      expectedConfigCount: 2,
      expectedIdentitySequence: ['guest'],
      historyIdentitySequence: ['guest'],
      configs: [
        {
          update: false,
          resourceState: 'clear',
          parameters: { page_group: 'login', visitor_type: 'guest' },
        },
        {
          update: true,
          resourceState: 'clear',
          parameters: { page_group: 'login', visitor_type: 'guest' },
        },
      ],
      events: [
        {
          name: 'page_view',
          count: 1,
          parameters: { page_group: 'login', ...EMPTY_RESOURCE, visitor_type: 'guest' },
        },
      ],
    });

    expect(summary.ready).to.equal(true);
    expect(summary.eventMatchCounts).to.deep.equal([1]);
    expect(summary.unexpectedMeasurementCount).to.equal(0);
    expect(summary.configCount).to.equal(2);
    expect(summary.unsafeConfigPageCount).to.equal(0);
    expect(summary.unsafeEventPageCount).to.equal(0);
    expect(summary.eventUserIdCount).to.equal(0);
    expect(summary.configResourceStates).to.deep.equal(['clear', 'clear']);
    expect(summary.configUpdateStates).to.deep.equal(['initial', 'update']);
    expect(summary.pageExitEventCount).to.equal(0);
    expect(summary.pageTransitionMismatchCount).to.equal(0);
    expect(Object.keys(readSafeDataLayerSummary(summary))).not.to.include.members([
      'userId',
      'pageLocation',
      'url',
      'query',
      'body',
    ]);
  });

  it('対象URLは退出通知・対象設定・page_viewの順に送信された場合だけ受理する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      updatedConfig({ visitor_type: 'guest' }),
      pageView('guest'),
      pageExit('guest'),
      updatedConfig(
        { visitor_type: 'guest' },
        { ...roomListPage, ...roomListResource }
      ),
      [
        'event',
        'page_view',
        { ...roomListPage, ...roomListResource, visitor_type: 'guest' },
      ],
      [
        'event',
        'iseeetl_page_exit',
        { ...roomListPage, ...roomListResource, visitor_type: 'guest' },
      ],
      updatedConfig(
        { visitor_type: 'guest' },
        { ...timelinePage, ...timelineResource }
      ),
      [
        'event',
        'page_view',
        { ...timelinePage, ...timelineResource, visitor_type: 'guest' },
      ],
    ];

    const summary = captureDataLayerState({
      startIndex: 3,
      expectedConfigCount: 2,
      expectedIdentitySequence: ['guest'],
      historyIdentitySequence: ['guest'],
      configs: [
        {
          update: true,
          resourceState: 'floor',
          parameters: { floor_title: 'Floor A' },
          patterns: { floor_id: '^[a-f0-9]{24}$' },
        },
        {
          update: true,
          resourceState: 'room',
          parameters: { floor_title: 'Floor A', room_title: 'Room A' },
          patterns: {
            floor_id: '^[a-f0-9]{24}$',
            room_id: '^[a-f0-9]{24}$',
          },
        },
      ],
      events: [
        {
          name: 'page_view',
          parameters: { ...roomListPage, ...roomListResource, visitor_type: 'guest' },
        },
        {
          name: 'page_view',
          parameters: { ...timelinePage, ...timelineResource, visitor_type: 'guest' },
        },
      ],
    });

    expect(summary.ready).to.equal(true);
    expect(summary.configResourceStates).to.deep.equal(['floor', 'room']);
    expect(summary.configUpdateStates).to.deep.equal(['update', 'update']);
    expect(summary.pageViewConfigMismatchCount).to.equal(0);
    expect(summary.pageTransitionMismatchCount).to.equal(0);
    expect(summary.pageExitEventCount).to.equal(2);
    expect(summary.configUpdateOrderViolationCount).to.equal(0);
  });

  it('2回目以降のpage_viewで旧コンテキストのexitがない遷移を拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      updatedConfig({ visitor_type: 'guest' }),
      pageView('guest'),
      updatedConfig(
        { visitor_type: 'guest' },
        { ...roomListPage, ...roomListResource }
      ),
      [
        'event',
        'page_view',
        { ...roomListPage, ...roomListResource, visitor_type: 'guest' },
      ],
    ];

    const summary = captureDataLayerState({ allowAdditionalEvents: true });
    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.pageViewConfigMismatchCount).to.equal(0);
    expect(summary.pageTransitionMismatchCount).to.equal(1);
  });

  it('exitが直前のpage_viewと異なるコンテキストなら遷移を拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      updatedConfig({ visitor_type: 'guest' }),
      pageView('guest'),
      [
        'event',
        'iseeetl_page_exit',
        { ...timelinePage, ...timelineResource, visitor_type: 'guest' },
      ],
      updatedConfig(
        { visitor_type: 'guest' },
        { ...roomListPage, ...roomListResource }
      ),
      [
        'event',
        'page_view',
        { ...roomListPage, ...roomListResource, visitor_type: 'guest' },
      ],
    ];

    const summary = captureDataLayerState({ allowAdditionalEvents: true });
    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.pageViewConfigMismatchCount).to.equal(0);
    expect(summary.pageTransitionMismatchCount).to.equal(1);
  });

  it('page_viewの後に対象設定を送る順序を拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      pageView('guest'),
      pageExit('guest'),
      [
        'event',
        'page_view',
        { ...roomListPage, ...roomListResource, visitor_type: 'guest' },
      ],
      updatedConfig(
        { visitor_type: 'guest' },
        { ...roomListPage, ...roomListResource }
      ),
    ];

    const summary = captureDataLayerState({ allowAdditionalEvents: true });
    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.pageViewConfigMismatchCount).to.equal(1);
  });

  it('手動user_engagementとengagement_time_msec付きexitを拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      ['event', 'user_engagement', { visitor_type: 'guest' }],
      pageExit('guest', { engagement_time_msec: 1000 }),
    ];

    const summary = captureDataLayerState({ allowAdditionalEvents: true });
    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.unknownAnalyticsEventCount).to.equal(1);
    expect(summary.invalidEventShapeCount).to.equal(2);
  });

  it('初回だけ対象未確定の設定を許し、対象確定後にpage_viewを送る', () => {
    window.dataLayer = [
      config(
        { visitor_type: 'guest' },
        { ...timelinePage }
      ),
      updatedConfig(
        { visitor_type: 'guest' },
        { ...timelinePage, ...timelineResource }
      ),
      [
        'event',
        'page_view',
        { ...timelinePage, ...timelineResource, visitor_type: 'guest' },
      ],
    ];

    const summary = captureDataLayerState({
      expectedJsCount: 0,
      expectedConfigCount: 2,
      expectedIdentitySequence: ['guest'],
      configs: [
        {
          update: false,
          resourceState: 'pending',
          parameters: { page_group: 'timeline', visitor_type: 'guest' },
        },
        {
          update: true,
          resourceState: 'room',
          parameters: { ...timelineResource, visitor_type: 'guest' },
        },
      ],
      events: [
        {
          name: 'page_view',
          count: 1,
          parameters: { ...timelinePage, ...timelineResource, visitor_type: 'guest' },
        },
      ],
    });

    expect(summary.ready).to.equal(true);
    expect(summary.configResourceStates).to.deep.equal(['pending', 'room']);
    expect(summary.pageViewConfigMismatchCount).to.equal(0);
    expect(summary.pageTransitionMismatchCount).to.equal(0);
    expect(summary.pageExitEventCount).to.equal(0);
  });

  it('未確定の対象にnullを先行設定した場合やpage_view後に設定がない場合は拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      updatedConfig(
        { visitor_type: 'guest' },
        { ...timelinePage }
      ),
      [
        'event',
        'page_view',
        { ...timelinePage, ...timelineResource, visitor_type: 'guest' },
      ],
      updatedConfig(
        { visitor_type: 'guest' },
        { ...timelinePage, ...timelineResource }
      ),
      updatedConfig(
        { visitor_type: 'guest' },
        { ...roomListPage, page_location: 'http://localhost:3100/floor' }
      ),
      ['event', 'page_view', {
        ...roomListPage,
        ...roomListResource,
        page_location: `${roomListPage.page_location}?secret=1`,
        visitor_type: 'guest',
      }],
    ];

    const summary = captureDataLayerState({
      startIndex: 1,
      allowAdditionalEvents: true,
    });

    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.unexpectedConfigCount).to.be.greaterThan(0);
    expect(summary.configResourceStates).to.include('invalid');
    expect(summary.pageViewConfigMismatchCount).to.be.greaterThan(0);
    expect(summary.unsafeConfigPageCount).to.equal(1);
    expect(summary.unsafeEventPageCount).to.equal(1);
  });

  it('初回以外でupdate:trueを欠く設定を拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      config({ visitor_type: 'guest' }),
    ];

    const summary = captureDataLayerState({ allowAdditionalEvents: true });
    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.configUpdateOrderViolationCount).to.equal(1);
  });

  it('重複・余分なイベントがあれば、その後に正常なイベントが来ても失敗のままにする', () => {
    window.dataLayer = [config({ visitor_type: 'guest' }), pageView(), pageView()];
    const summary = captureDataLayerState({
      expectedJsCount: 0,
      expectedConfigCount: 1,
      expectedIdentitySequence: ['guest'],
      events: [{ name: 'page_view', count: 1, parameters: { page_group: 'login' } }],
    });

    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.eventCount).to.equal(2);
    expect(summary.eventMatchCounts).to.deep.equal([1]);
    expect(summary.unexpectedEventCount).to.equal(1);
  });

  it('追加イベントを許す場合も指定イベントの到着を待って完了にする', () => {
    window.dataLayer = [
      config({ visitor_type: 'registered', user_id: `ga1_${'a'.repeat(64)}` }),
      ['event', 'timeline_content_change', {
        floor_id: 'a'.repeat(24),
        room_id: 'b'.repeat(24),
        content_type: 'post',
        action_type: 'create',
        presentation_type: 'static',
        visitor_type: 'registered',
      }],
    ];
    const expectations = {
      allowAdditionalEvents: true,
      maximumRegisteredUserIdVariants: 1,
      events: [
        {
          name: 'timeline_view',
          count: 1,
          patterns: {
            floor_id: '^[a-f0-9]{24}$',
            room_id: '^[a-f0-9]{24}$',
          },
        },
      ],
    };

    const beforeRequired = captureDataLayerState(expectations);
    expect(beforeRequired.ready).to.equal(false);
    expect(beforeRequired.irrecoverable).to.equal(false);
    expect(beforeRequired.eventMatchCounts).to.deep.equal([0]);

    window.dataLayer.push([
      'event',
      'timeline_view',
      {
        floor_id: 'a'.repeat(24),
        room_id: 'b'.repeat(24),
        visitor_type: 'registered',
      },
    ]);
    const afterRequired = captureDataLayerState(expectations);
    expect(afterRequired.ready).to.equal(true);
    expect(afterRequired.eventCount).to.equal(2);
    expect(afterRequired.eventMatchCounts).to.deep.equal([1]);
  });

  it('ゲスト・登録ユーザ・識別解除・ゲストの順序と各イベントの識別情報を検証する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      updatedConfig({ visitor_type: 'guest' }),
      pageView('guest'),
      pageExit('guest'),
      updatedConfig({ visitor_type: 'registered', user_id: `ga1_${'a'.repeat(64)}` }),
      pageView('registered'),
      pageExit('registered'),
      updatedConfig({ visitor_type: 'registered', user_id: null }),
      updatedConfig({ visitor_type: 'guest' }),
      pageView('guest'),
    ];

    const summary = captureDataLayerState({
      allowAdditionalEvents: true,
      maximumRegisteredUserIdVariants: 1,
      historyIdentitySequence: ['guest', 'registered', 'clear', 'guest'],
    });
    expect(summary.ready).to.equal(true);
    expect(summary.identityEventMismatchCount).to.equal(0);
    expect(summary.identityTransitionViolationCount).to.equal(0);
    expect(summary.registeredEventBeforeConfigCount).to.equal(0);
    expect(summary.guestEventBeforeConfigCount).to.equal(0);
    expect(summary.guestEventBeforeClearCount).to.equal(0);
    expect(summary.pageViewConfigMismatchCount).to.equal(0);
    expect(summary.pageTransitionMismatchCount).to.equal(0);
    expect(summary.pageExitEventCount).to.equal(2);
  });

  it('登録ユーザからゲストへ戻る際に識別解除とゲスト設定が先行しなければ拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'registered', user_id: `ga1_${'a'.repeat(64)}` }),
      pageView('registered'),
      pageExit('registered'),
      updatedConfig({ visitor_type: 'guest' }),
      pageView('guest'),
      updatedConfig({ visitor_type: 'registered', user_id: null }),
    ];

    const summary = captureDataLayerState({
      allowAdditionalEvents: true,
      maximumRegisteredUserIdVariants: 1,
    });
    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.identityTransitionViolationCount).to.be.greaterThan(0);
    expect(summary.guestEventBeforeClearCount).to.equal(1);
  });

  it('登録ユーザの設定より先に登録ユーザのイベントを送った場合は拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      pageView('registered'),
      updatedConfig({ visitor_type: 'registered', user_id: `ga1_${'a'.repeat(64)}` }),
    ];

    const summary = captureDataLayerState({
      allowAdditionalEvents: true,
      maximumRegisteredUserIdVariants: 1,
    });
    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.identityEventMismatchCount).to.equal(1);
    expect(summary.registeredEventBeforeConfigCount).to.equal(1);
  });

  it('誤った計測ID、元のユーザ・ゲストID、クエリ付きページ設定を違反件数に含める', () => {
    const wrongMeasurement = config(
      { visitor_type: 'guest', user_id: 'raw-guest-id' },
      { page_location: 'http://localhost:3100/login?unsafe=1' }
    );
    wrongMeasurement[1] = 'G-WRONG00000';
    window.dataLayer = [
      wrongMeasurement,
      updatedConfig({ visitor_type: 'registered', user_id: '507f1f77bcf86cd799439011' }),
    ];

    const summary = captureDataLayerState({ allowAdditionalEvents: true });
    expect(summary.ready).to.equal(false);
    expect(summary.unexpectedMeasurementCount).to.equal(1);
    expect(summary.unexpectedConfigCount).to.equal(2);
    expect(summary.invalidGuestUserIdCount).to.equal(1);
    expect(summary.invalidRegisteredUserIdCount).to.equal(1);
    expect(summary.unsafeConfigPageCount).to.equal(1);
  });

  it('イベント内のuser_id、不正なページ、未知のイベント、本文の断片を拒否する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      pageView('guest', {
        page_location: 'http://localhost:3100/login#unsafe',
        user_id: 'raw-user-id',
      }),
      ['event', 'unknown_event', { body: 'private post body' }],
    ];

    const summary = captureDataLayerState({
      allowAdditionalEvents: true,
      forbiddenFragments: ['private post body'],
    });
    expect(summary.ready).to.equal(false);
    expect(summary.eventUserIdCount).to.equal(1);
    expect(summary.unsafeEventPageCount).to.equal(1);
    expect(summary.unknownAnalyticsEventCount).to.equal(1);
    expect(summary.forbiddenFragmentCount).to.equal(1);
  });

  it('timeline_filter_tagの安全なIDと名称を受理する', () => {
    window.dataLayer = [
      config({ visitor_type: 'registered', user_id: `ga1_${'a'.repeat(64)}` }),
      [
        'event',
        'timeline_filter_tag',
        {
          ...timelineResource,
          visitor_type: 'registered',
          action_type: 'update',
          tag_id: `tag_${'c'.repeat(24)}`,
          tag_name: 'Tag A',
        },
      ],
    ];

    const summary = captureDataLayerState({
      allowAdditionalEvents: true,
      maximumRegisteredUserIdVariants: 1,
    });
    expect(summary.ready).to.equal(true);
    expect(summary.unknownAnalyticsEventCount).to.equal(0);
    expect(summary.invalidEventShapeCount).to.equal(0);
  });

  it.each([
    [
      '余分なraw User ID key',
      [
        'event',
        'timeline_view',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
          raw_user_id: '507f1f77bcf86cd799439011',
        },
      ],
    ],
    [
      'prefix付きObjectId',
      [
        'event',
        'timeline_view',
        {
          floor_id: 'floor_507f1f77bcf86cd799439011',
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
        },
      ],
    ],
    [
      'resource 4 slotを欠くpage_view',
      ['event', 'page_view', { ...PAGE, visitor_type: 'registered' }],
    ],
    [
      'Guest UUID形式の名称',
      [
        'event',
        'timeline_quick_text_use',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
          content_type: 'post',
          quick_text_id: `quick_${'c'.repeat(24)}`,
          quick_text_label: '123e4567-e89b-12d3-a456-426614174000',
        },
      ],
    ],
    [
      '英数字に隣接するGuest UUID形式の名称',
      [
        'event',
        'timeline_quick_text_use',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
          content_type: 'post',
          quick_text_id: `quick_${'c'.repeat(24)}`,
          quick_text_label: 'Guest123e4567-e89b-12d3-a456-426614174000User',
        },
      ],
    ],
    [
      '入れ子のパラメータ',
      [
        'event',
        'timeline_content_change',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
          content_type: 'post',
          action_type: { value: 'create' },
          presentation_type: 'static',
        },
      ],
    ],
    [
      '第4引数',
      [
        'event',
        'timeline_view',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
        },
        'unexpected',
      ],
    ],
    [
      'credential付きpage URL',
      pageView('registered', {
        page_location: 'http://user@localhost:3100/login',
      }),
    ],
    [
      '空文字page referrer',
      pageView('registered', { page_referrer: '' }),
    ],
    [
      '不正なsetting key/value pair',
      [
        'event',
        'timeline_filter_setting',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
          setting_key: 'filter_mode',
          setting_value: 'true',
        },
      ],
    ],
    [
      'filter tagのdelete action',
      [
        'event',
        'timeline_filter_tag',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
          action_type: 'delete',
          tag_id: `tag_${'c'.repeat(24)}`,
        },
      ],
    ],
    [
      'filter tagの不正なtag_id',
      [
        'event',
        'timeline_filter_tag',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
          action_type: 'create',
          tag_id: 'c'.repeat(24),
        },
      ],
    ],
    [
      'filter tagのunsafe tag_name',
      [
        'event',
        'timeline_filter_tag',
        {
          floor_id: 'a'.repeat(24),
          room_id: 'b'.repeat(24),
          visitor_type: 'registered',
          action_type: 'update',
          tag_id: `tag_${'c'.repeat(24)}`,
          tag_name: 'private@example.com',
        },
      ],
    ],
  ])('既知のイベントでも%sがあれば形式違反として失敗のままにする', (_label, command) => {
    window.dataLayer = [
      config({ visitor_type: 'registered', user_id: `ga1_${'a'.repeat(64)}` }),
      command,
    ];

    const summary = captureDataLayerState({
      allowAdditionalEvents: true,
      maximumRegisteredUserIdVariants: 1,
    });
    expect(summary.ready).to.equal(false);
    expect(summary.irrecoverable).to.equal(true);
    expect(summary.invalidEventShapeCount).to.equal(1);
    expect(readSafeDataLayerSummary(summary).invalidEventShapeCount).to.equal(1);
  });

  it('追加イベントを許す場合もアクセサ・Symbol・流れる付加情報を拒否する', () => {
    const accessorParameters = {
      floor_id: 'a'.repeat(24),
      room_id: 'b'.repeat(24),
      visitor_type: 'registered',
    };
    Object.defineProperty(accessorParameters, 'floor_title', {
      enumerable: true,
      get: () => 'secret',
    });
    const symbolParameters = {
      floor_id: 'a'.repeat(24),
      room_id: 'b'.repeat(24),
      visitor_type: 'registered',
    };
    symbolParameters[Symbol('secret')] = 'must-not-leak';
    const nonEnumerableParameters = {
      floor_id: 'a'.repeat(24),
      room_id: 'b'.repeat(24),
      visitor_type: 'registered',
    };
    Object.defineProperty(nonEnumerableParameters, 'body', {
      enumerable: false,
      value: 'must-not-leak',
    });
    const supplementFlow = [
      'event',
      'timeline_content_change',
      {
        floor_id: 'a'.repeat(24),
        room_id: 'b'.repeat(24),
        visitor_type: 'registered',
        content_type: 'post_supplement',
        action_type: 'create',
        presentation_type: 'flow',
      },
    ];

    [accessorParameters, symbolParameters, nonEnumerableParameters, supplementFlow[2]].forEach(
      (parameters, index) => {
      const command = index < 3 ? ['event', 'timeline_view', parameters] : supplementFlow;
      window.dataLayer = [
        config({ visitor_type: 'registered', user_id: `ga1_${'a'.repeat(64)}` }),
        command,
      ];
      const summary = captureDataLayerState({ allowAdditionalEvents: true });
      expect(summary.ready).to.equal(false);
      expect(summary.invalidEventShapeCount).to.equal(1);
      }
    );
  });

  it('履歴全体で識別情報の切替順序と登録IDの種類数の上限を検証する', () => {
    window.dataLayer = [
      config({ visitor_type: 'guest' }),
      updatedConfig({ visitor_type: 'registered', user_id: `ga1_${'a'.repeat(64)}` }),
      updatedConfig({ visitor_type: 'registered', user_id: null }),
      updatedConfig({ visitor_type: 'guest' }),
    ];
    const valid = captureDataLayerState({
      allowAdditionalEvents: true,
      expectedConfigCount: 4,
      expectedIdentitySequence: ['guest', 'registered', 'clear', 'guest'],
      historyIdentitySequence: ['guest', 'registered', 'clear', 'guest'],
    });
    expect(valid.ready).to.equal(true);
    expect(valid.registeredUserIdVariantCount).to.equal(1);

    window.dataLayer.push(
      updatedConfig({ visitor_type: 'registered', user_id: `ga1_${'b'.repeat(64)}` })
    );
    const stale = captureDataLayerState({
      allowAdditionalEvents: true,
      maximumRegisteredUserIdVariants: 1,
    });
    expect(stale.ready).to.equal(false);
    expect(stale.registeredUserIdVariantCount).to.equal(2);
  });
});
