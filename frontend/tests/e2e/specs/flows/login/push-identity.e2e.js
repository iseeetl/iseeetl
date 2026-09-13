const { getBaseUrl, requireEnv } = require('../../helpers/login');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { clickExactAccountSubmit } = require('../../helpers/account-submit');

const installOneSignalMock = (browser) => {
  browser.execute(function () {
      window.__e2eCapturedOneSignalIds = [];
      window.OneSignal = {
        login: function (externalId) {
          window.__e2eCapturedOneSignalIds.push(String(externalId || ''));
          return Promise.resolve();
        },
        logout: function () {
          return Promise.resolve();
        },
      };
      window.__iseeetlOneSignalInitPromise = Promise.resolve();
      window.OneSignalDeferred = {
        push: function (callback) {
          return callback(window.OneSignal);
        },
      };
  });
};

const verifyAuthenticatedPushIdentity = (browser, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const captured = Array.isArray(window.__e2eCapturedOneSignalIds)
        ? window.__e2eCapturedOneSignalIds.filter(Boolean)
        : [];
      return { capturedId: captured.length ? captured[captured.length - 1] : '' };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { capturedId: '' };
      if (!state.capturedId && attempt < maxAttempts) {
        browser.pause(250, () => verifyAuthenticatedPushIdentity(browser, attempt + 1));
        return;
      }
      browser.assert.ok(Boolean(state.capturedId), '認証済みの通知用識別情報を取得できます。');
      browser.assert.ok(
        /^osv1_[a-f0-9]{64}$/.test(state.capturedId || ''),
        'External IDはosv1_で始まるHMAC-SHA256形式です。'
      );
      browser.assert.ok(state.capturedId.indexOf('@') === -1, 'External IDにメールアドレスが含まれていません。');
    }
  );
};

module.exports = {
  '@tags': ['provider-onesignal'],
  'ログイン時にユーザIDを直接使わないOneSignal External IDを関連付ける': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');
    const base = getBaseUrl(browser).replace(/\/$/, '');

    clearBrowserSession(browser);
    browser
      .url(`${base}/login`)
      .waitForElementVisible('#mail', 10000);
    installOneSignalMock(browser);
    browser
      .clearValue('#mail')
      .setValue('#mail', mail)
      .clearValue('#password')
      .setValue('#password', password);
    clickExactAccountSubmit(browser, {
      expectedInputs: [
        { selector: '#mail', value: mail },
        { selector: '#password', value: password },
      ],
      submitSelector: '[data-testid="login-submit"]',
      label: '通知用識別情報の検証のためにログイン',
    });
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 20000);

    verifyAuthenticatedPushIdentity(browser);
    browser.end();
  },
};
