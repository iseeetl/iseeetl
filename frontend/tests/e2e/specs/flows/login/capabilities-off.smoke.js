const {
  assertAnalyticsNetworkSummary,
  assertAnalyticsTagState,
  assertNoAnalyticsDataLayer,
  captureCookiePolicyLinkState,
  captureCookiePolicyLocationState,
  finalizeAnalyticsCdpGuardWithBrowserClose,
  installAnalyticsCdpGuard,
} = require('../../helpers/analytics-cdp');
const { getBaseUrl } = require('../../helpers/login');
const {
  clickFirstVisible,
  loginByForm,
  logoutIfPossible,
  openFloorList,
  openGuestTimeline,
} = require('../../helpers/guest-helpers');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');

const capabilitySelectors = [
  '.help-capability--mail-delivery',
  '.help-capability--oauth-any',
  '.help-capability--google-login',
  '.help-capability--line-login',
  '.help-capability--google-translate',
  '.help-capability--openai-analysis',
];
const HELP_ROUTE_BODY_SELECTOR =
  '#app_content > .view > .view-content > [data-testid="help-content"] [data-testid="help-content-body"]';
const HELP_ROUTE_ERROR_SELECTOR =
  '#app_content > .view > .view-content > [data-testid="help-content"] [data-testid="help-content-error"]';
const state = {
  guard: null,
  expectedNetwork: {
    dummyTagRequestCount: 0,
    configRequestCount: 0,
    identityRequestCount: 0,
  },
};

const assertCookiePolicyLink = (
  browser,
  selector,
  { label, expectedOrigin, expectedFloorId = '', expectedRoomId = '' }
) => {
  browser.execute(
    captureCookiePolicyLinkState,
    [selector, expectedOrigin, expectedFloorId, expectedRoomId],
    (result) => {
      const linkState = result?.value || {};
      browser.assert.ok(
        linkState.exactlyOneVisible &&
          linkState.sameOrigin &&
          linkState.noCredentials &&
          linkState.cookiePath &&
          linkState.noHash &&
          linkState.allowedQueryOnly &&
          linkState.roomContextMatches,
        `${label}: 表示中のCookieポリシーリンクが同一オリジンに1件あり、想定したルームのクエリだけを含みます。`
      );
    }
  );
};

const assertCurrentCookiePolicyPath = (browser, expectedOrigin, label) => {
  browser.execute(
    captureCookiePolicyLocationState,
    [expectedOrigin],
    (result) => {
      const locationState = result?.value || {};
      browser.assert.equal(
        locationState.sameOrigin &&
          locationState.noCredentials &&
          locationState.cookiePath &&
          locationState.noQuery &&
          locationState.noHash,
        true,
        `${label}: 同一オリジンのCookieポリシーへ、余分な情報を含まないURLで移動しました。`
      );
    }
  );
};

module.exports = {
  '@tags': ['core-all-off'],

  before(browser, done) {
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
      '機能無効時のアナリティクス検証の終了時の通信確認',
      done
    );
  },

  '無効な外部サービスのヘルプを表示しない': (browser) => {
    const baseUrl = getBaseUrl(browser).replace(/\/$/, '');
    const applicationOrigin = new URL(baseUrl).origin;
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    if (!editorMail || !editorPassword) {
      browser.assert.ok(false, '機能無効時のE2Eには、Git管理されたフロア編集ユーザのアカウントが必要です。');
      return;
    }

    browser
      .url(`${baseUrl}/help`)
      .assert.urlContains('/help')
      .waitForElementVisible(HELP_ROUTE_BODY_SELECTOR, 10000)
      .waitForElementVisible(`${HELP_ROUTE_BODY_SELECTOR} .help-topic`, 10000)
      .assert.not.elementPresent(HELP_ROUTE_ERROR_SELECTOR);

    capabilitySelectors.forEach((selector) => {
      browser.assert.not.elementPresent(selector);
    });
    assertNoAnalyticsDataLayer(browser, '機能無効時のヘルプ');

    browser
      .url(`${baseUrl}/login`)
      .waitForElementVisible('#mail', 10000)
      .waitForElementVisible('[data-testid="login-consent-notice"]', 10000)
      .waitForElementVisible('[data-testid="login-consent-terms-link"]', 10000)
      .waitForElementVisible('[data-testid="login-consent-privacy-link"]', 10000)
      .waitForElementVisible('[data-testid="login-cookie-policy-link"]', 10000)
      .assert.not.elementPresent('.oauth-block')
      .assert.not.elementPresent('.line-login-btn')
      .assert.not.elementPresent('[data-testid="analytics-preference-control"]')
      .assert.not.elementPresent('[data-testid="analytics-consent-banner"]')
      .assert.not.elementPresent('input[name="analytics-consent"]');
    assertCookiePolicyLink(browser, '[data-testid="login-cookie-policy-link"]', {
      label: 'ログイン画面の共通Cookieポリシーリンク',
      expectedOrigin: applicationOrigin,
    });
    assertNoAnalyticsDataLayer(browser, '機能無効時のログイン画面');

    browser
      .url(`${baseUrl}/register`)
      .waitForElementVisible('#app_container', 10000)
      .waitForElementVisible('#mail', 10000)
      .assert.urlEquals(`${baseUrl}/login`)
      .assert.not.elementPresent('[data-testid="register-cookie-policy-link"]');
    assertNoAnalyticsDataLayer(browser, '機能無効時の登録画面の非表示');

    browser
      .url(`${baseUrl}/cookie`)
      .waitForElementVisible('.view-content', 10000)
      .waitForElementVisible(
        '.view-content a[href^="https://policies.google.com/technologies/partner-sites"]',
        10000
      )
      .assert.not.elementPresent('[data-testid="analytics-preference-control"]');
    assertAnalyticsTagState(browser, false);
    assertNoAnalyticsDataLayer(browser, '機能無効時のCookieポリシー');

    loginByForm(browser, { mail: editorMail, password: editorPassword });
    browser
      .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
      .click('[data-testid="app-menu-button"]')
      .waitForElementVisible('[data-testid="app-menu"]', 10000)
      .waitForElementVisible('[data-testid="app-menu-cookie-policy"]', 10000);
    assertCookiePolicyLink(browser, '[data-testid="app-menu-cookie-policy"]', {
      label: 'アプリメニューのCookieポリシーリンク',
      expectedOrigin: applicationOrigin,
    });
    browser
      .click('[data-testid="app-menu-cookie-policy"]')
      .waitForElementVisible(
        '.view-content a[href^="https://policies.google.com/technologies/partner-sites"]',
        10000
      );
    assertCurrentCookiePolicyPath(browser, applicationOrigin, 'アプリメニューのCookieポリシーリンクをクリック');
    openFloorList(browser);
    browser.waitForElementVisible('[data-testid="floor-list-create-button"]', 10000);
    clickFirstVisible(browser, '[data-testid="floor-list-create-button"]', 'フロアのダイアログを開く');
    browser
      .waitForElementVisible('#edit_floor_dialog_title', 10000)
      .assert.not.elementPresent('[data-testid="analytics-resource-notice"]');
    clickFirstVisible(browser, '[data-testid="base-edit-dialog-cancel"]', 'フロアのダイアログを閉じる');
    browser.waitForElementNotVisible('#edit_floor_dialog_title', 10000);
    logoutIfPossible(browser);
    assertNoAnalyticsDataLayer(browser, '機能無効時のログイン後の画面');

    const stamp = String(Date.now()).slice(-6);
    const roomState = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle: `E2E Capability Off Floor ${stamp}`,
      roomTitle: `E2E Capability Off Room ${stamp}`,
      targetLangs: [],
    });
    browser.perform(() => {
      if (!roomState.floorId || !roomState.roomId) {
        browser.assert.ok(false, '機能無効時のゲスト用テストデータのIDを取得できませんでした。');
        return;
      }
      openGuestTimeline(browser, roomState.floorId, roomState.roomId);
    });
    clickFirstVisible(browser, '[data-testid="timeline-post-button"]', 'ゲストの利用ルールを開く');
    browser
      .waitForElementVisible('[data-testid="dialog-guest-rules"]', 10000)
      .waitForElementVisible('[data-testid="guest-rules-cookie-policy-link"]', 10000);
    browser.perform(() => {
      assertCookiePolicyLink(browser, '[data-testid="guest-rules-cookie-policy-link"]', {
        label: 'ゲストの利用ルールのCookieポリシーリンク',
        expectedOrigin: applicationOrigin,
        expectedFloorId: roomState.floorId,
        expectedRoomId: roomState.roomId,
      });
    });
    assertAnalyticsTagState(browser, false);
    assertNoAnalyticsDataLayer(browser, '機能無効時のゲストの利用ルール');
    assertAnalyticsNetworkSummary(
      browser,
      state.guard,
      {
        dummyTagRequestCount: 0,
        unexpectedTagRequestCount: 0,
        collectionRequestCount: 0,
        configRequestCount: 0,
        unexpectedConfigRequestCount: 0,
        identityRequestCount: 0,
        unexpectedIdentityRequestCount: 0,
        handlerErrorCount: 0,
        connectionErrorCount: 0,
      },
      '機能無効時のアナリティクス通信確認'
    );
  },
};
