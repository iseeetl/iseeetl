// 実際のGoogle Analyticsには接続せず、ダミータグとブラウザ内のdataLayerを検証する。
const {
  assertAnalyticsNetworkSummary,
  assertAnalyticsTagState,
  assertNoAnalyticsDataLayerDelta,
  createDataLayerCheckpoint,
  finalizeAnalyticsCdpGuardWithBrowserClose,
  installAnalyticsCdpGuard,
  waitForAnalyticsDataLayer,
} = require('../../helpers/analytics-cdp');
const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { logoutIfPossible } = require('../../helpers/guest-helpers');
const { loginByForm } = require('../../helpers/session-helpers');
const { closeProfileDialog, openProfileFromMenu } = require('../../helpers/profile-helpers');

const HELP_ROUTE_CONTENT_SELECTOR =
  '#app_content > .view > .view-content > [data-testid="help-content"]';
const clearConfig = (pageGroup, visitorType, { update = true, userId } = {}) => ({
  update,
  resourceState: 'clear',
  parameters: {
    page_group: pageGroup,
    visitor_type: visitorType,
    ...(userId === undefined ? {} : { user_id: userId }),
  },
});

const state = {
  guard: null,
  expectedNetwork: {
    dummyTagRequestCount: 0,
    configRequestCount: 0,
    identityRequestCount: 0,
  },
};

const checkpoint = createDataLayerCheckpoint();

module.exports = {
  '@tags': ['analytics'],

  before(browser, done) {
    checkpoint.index = 0;
    state.expectedNetwork = {
      dummyTagRequestCount: 0,
      configRequestCount: 0,
      identityRequestCount: 0,
    };
    installAnalyticsCdpGuard(browser).then(
      (guard) => {
        state.guard = guard;
        done();
      },
      () => done(new Error('アナリティクス検証用のCDP通信監視を準備できませんでした。'))
    );
  },

  after(browser, done) {
    finalizeAnalyticsCdpGuardWithBrowserClose(
      browser,
      state.guard,
      state.expectedNetwork,
      'ユーザ識別のアナリティクス検証の終了時の通信確認',
      done
    );
  },

  '計測設定の取得、ゲストと登録ユーザの識別、ページ閲覧の計測を確認する': (browser) => {
    const mail = process.env.E2E_USER_MAIL || '';
    const password = process.env.E2E_USER_PASSWORD || '';
    if (!mail || !password) {
      browser.assert.ok(false, 'アナリティクスのユーザ識別のE2Eには、Git管理された投稿者アカウントが必要です。');
      return;
    }

    const baseUrl = getBaseUrl(browser).replace(/\/$/, '');
    browser
      .url(`${baseUrl}/login?source=e2e#ignored-fragment`)
      .waitForElementVisible('#mail', 10000);
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 1,
        expectedConfigCount: 2,
        expectedIdentitySequence: ['guest'],
        historyIdentitySequence: ['guest'],
        configs: [
          clearConfig('login', 'guest', { update: false }),
          clearConfig('login', 'guest'),
        ],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: { page_group: 'login', visitor_type: 'guest' },
          },
        ],
      },
      'ゲストの初回ページビュー'
    );
    assertAnalyticsTagState(browser, true);
    state.expectedNetwork.dummyTagRequestCount = 1;
    state.expectedNetwork.configRequestCount = 1;
    assertAnalyticsNetworkSummary(
      browser,
      state.guard,
      {
        dummyTagRequestCount: 1,
        unexpectedTagRequestCount: 0,
        collectionRequestCount: 0,
        configRequestCount: 1,
        unexpectedConfigRequestCount: 0,
        identityRequestCount: 0,
        unexpectedIdentityRequestCount: 0,
        handlerErrorCount: 0,
        connectionErrorCount: 0,
      },
      'ゲストのアナリティクス通信確認'
    );

    loginByForm(browser, { mail, password });
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 2,
        expectedIdentitySequence: ['registered'],
        historyIdentitySequence: ['guest', 'registered'],
        maximumRegisteredUserIdVariants: 1,
        configs: [
          {
            update: true,
            resourceState: 'clear',
            parameters: { visitor_type: 'registered' },
          },
          clearConfig('floor_list', 'registered'),
        ],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: { page_group: 'floor_list', visitor_type: 'registered' },
          },
        ],
      },
      '登録ユーザのページビュー'
    );
    state.expectedNetwork.identityRequestCount = 1;
    assertAnalyticsNetworkSummary(
      browser,
      state.guard,
      { identityRequestCount: 1, unexpectedIdentityRequestCount: 0, collectionRequestCount: 0 },
      '登録ユーザの識別情報の要求'
    );

    openProfileFromMenu(browser);
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 1,
        expectedIdentitySequence: ['registered'],
        historyIdentitySequence: ['guest', 'registered'],
        configs: [clearConfig('profile', 'registered')],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: { page_group: 'profile', visitor_type: 'registered' },
          },
        ],
      },
      'プロフィールの仮想ページビュー'
    );
    closeProfileDialog(browser);
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 1,
        expectedIdentitySequence: ['registered'],
        historyIdentitySequence: ['guest', 'registered'],
        configs: [clearConfig('floor_list', 'registered')],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: { page_group: 'floor_list', visitor_type: 'registered' },
          },
        ],
      },
      'プロフィールの仮想ページから背景のページへの復帰'
    );

    navigateToApp(browser, `${baseUrl}/cookie`);
    browser
      .waitForElementVisible('.view-content', 10000)
      .assert.not.elementPresent('[data-testid="analytics-preference-control"]')
      .assert.not.elementPresent('[data-testid="analytics-preference-toggle"]');
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 1,
        expectedIdentitySequence: ['registered'],
        historyIdentitySequence: ['guest', 'registered'],
        configs: [clearConfig('cookie_policy', 'registered')],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: { page_group: 'cookie_policy', visitor_type: 'registered' },
          },
        ],
      },
      'Cookieポリシーのページビュー'
    );

    navigateToApp(browser, `${baseUrl}/privacy`);
    browser.waitForElementVisible('.view-content', 10000);
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 1,
        expectedIdentitySequence: ['registered'],
        historyIdentitySequence: ['guest', 'registered'],
        maximumRegisteredUserIdVariants: 1,
        configs: [clearConfig('privacy', 'registered')],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: { page_group: 'privacy', visitor_type: 'registered' },
          },
        ],
      },
      '登録ユーザのプライバシーポリシーのページビュー'
    );
    assertAnalyticsNetworkSummary(
      browser,
      state.guard,
      {
        configRequestCount: 1,
        unexpectedConfigRequestCount: 0,
        identityRequestCount: 1,
        unexpectedIdentityRequestCount: 0,
        dummyTagRequestCount: 1,
        collectionRequestCount: 0,
      },
      'バックエンド設定とユーザ識別の通信が安定していることの確認'
    );

    navigateToApp(browser, `${baseUrl}/`);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 1,
        expectedIdentitySequence: ['registered'],
        historyIdentitySequence: ['guest', 'registered'],
        configs: [clearConfig('floor_list', 'registered')],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: { page_group: 'floor_list', visitor_type: 'registered' },
          },
        ],
      },
      'ログアウト前の登録ユーザのフロアページ'
    );
    logoutIfPossible(browser);
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 2,
        expectedIdentitySequence: ['clear', 'guest'],
        historyIdentitySequence: [
          'guest',
          'registered',
          'clear',
          'guest',
        ],
        maximumRegisteredUserIdVariants: 1,
        configs: [
          clearConfig('floor_list', 'registered', { userId: null }),
          clearConfig('floor_list', 'guest'),
        ],
        events: [],
      },
      'ログアウト時にユーザ識別を解除し、ページビューを重複させずにゲストへ戻る'
    );

    navigateToApp(browser, `${baseUrl}/privacy`);
    browser.waitForElementVisible('.view-content', 10000);
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 1,
        expectedIdentitySequence: ['guest'],
        historyIdentitySequence: [
          'guest',
          'registered',
          'clear',
          'guest',
        ],
        maximumRegisteredUserIdVariants: 1,
        configs: [clearConfig('privacy', 'guest')],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: { page_group: 'privacy', visitor_type: 'guest' },
          },
        ],
      },
      'ログアウト後のゲストのページビュー'
    );

    navigateToApp(browser, `${baseUrl}/help`);
    browser
      .waitForElementPresent(HELP_ROUTE_CONTENT_SELECTOR, 10000)
      .assert.urlEquals(`${baseUrl}/help`)
      .pause(250);
    assertNoAnalyticsDataLayerDelta(browser, checkpoint, 'アナリティクスの対象ページにヘルプを含めない');
    assertAnalyticsNetworkSummary(
      browser,
      state.guard,
      {
        dummyTagRequestCount: 1,
        unexpectedTagRequestCount: 0,
        collectionRequestCount: 0,
        configRequestCount: 1,
        unexpectedConfigRequestCount: 0,
        identityRequestCount: 1,
        unexpectedIdentityRequestCount: 0,
        handlerErrorCount: 0,
        connectionErrorCount: 0,
      },
      'アナリティクス検証の最後の通信確認'
    );
  },
};
