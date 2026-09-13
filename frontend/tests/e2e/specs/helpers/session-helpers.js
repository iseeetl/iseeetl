const { getBaseUrl, navigateToApp } = require('./login');
const { consumeBrowserSessionReset } = require('./auth-security');
const { readSessionSummary } = require('./e2e-public-contract');

const openLogin = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const loginUrl = `${base}/login`;
  if (consumeBrowserSessionReset(browser)) browser.url(loginUrl);
  else navigateToApp(browser, loginUrl);
  browser.waitForElementVisible('#mail', 10000);
};

const waitForLoginSession = (browser, attempt = 0) => {
  const maxAttempts = 40;
  readSessionSummary(browser, (summary) => {
    const ready = Boolean(
      summary && summary.loggedIn === true && summary.credentialPresent === true && summary.role
    );
    if (ready) {
      browser.assert.ok(true, `ログイン後のセッションを確認しました: role=${summary.role}`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(
        false,
        `ログイン後のセッションを確認できませんでした: loggedIn=${summary?.loggedIn === true} credentialPresent=${
          summary?.credentialPresent === true
        } role=${summary?.role || 'unknown'}`
      );
      return;
    }
    browser.pause(500, () => waitForLoginSession(browser, attempt + 1));
  });
};

const loginByForm = (browser, { mail, password }) => {
  openLogin(browser);
  browser
    .clearValue('#mail')
    .setValue('#mail', mail)
    .clearValue('#password')
    .setValue('#password', password)
    .waitForElementVisible('[data-testid="login-submit"]', 10000)
    .click('[data-testid="login-submit"]')
    .waitForElementVisible('[data-testid="app-menu-button"]', 20000, false, (result) => {
      if (typeof result.status === 'number' && result.status !== 0) {
        browser.assert.ok(false, 'ログインが完了しませんでした。アプリメニューのボタンが表示されていません。');
      }
    });
  waitForLoginSession(browser);
};

const waitForUserRole = (browser, expectedRole, attempt = 0) => {
  const maxAttempts = 12;
  readSessionSummary(browser, (summary) => {
    const ready = Boolean(
      summary &&
        summary.loggedIn === true &&
        summary.credentialPresent === true &&
        summary.role === expectedRole
    );
    if (ready) {
      browser.assert.ok(true, `ユーザの権限を確認しました: ${expectedRole}`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `ユーザの権限が一致しません: 期待値=${expectedRole} 実際=${summary?.role || 'unknown'}`);
      return;
    }
    browser.pause(500, () => waitForUserRole(browser, expectedRole, attempt + 1));
  });
};

module.exports = {
  openLogin,
  loginByForm,
  waitForLoginSession,
  waitForUserRole,
};
