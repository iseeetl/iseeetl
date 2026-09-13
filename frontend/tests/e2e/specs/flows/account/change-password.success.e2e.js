// 固定アカウントを変更するため、単独で実行し、直前にE2E用DBを初期化する。
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');
const {
  openProfileFromMenu,
} = require('../../helpers/profile-helpers');
const { clickExactAccountSubmit } = require('../../helpers/account-submit');

const openChangePassword = (browser) => {
  openProfileFromMenu(browser);
  browser.waitForElementVisible('.password-change-button', 10000).click('.password-change-button');
  browser.waitForElementVisible('#old-password', 10000);
};

const submitChangePassword = (browser, oldPassword, newPassword) => {
  browser
    .clearValue('#old-password')
    .setValue('#old-password', oldPassword)
    .clearValue('#new-password')
    .setValue('#new-password', newPassword)
    .clearValue('#confirm-password')
    .setValue('#confirm-password', newPassword);
  clickExactAccountSubmit(browser, {
    expectedInputs: [
      { selector: '#old-password', value: oldPassword },
      { selector: '#new-password', value: newPassword },
      { selector: '#confirm-password', value: newPassword },
    ],
    submitSelector: '[data-testid="account-submit"]',
    label: 'パスワード変更',
  });
};

const waitForPasswordChangeSuccess = (browser, onReady, attempt = 0) => {
  browser.execute(function () {
    const raw = localStorage.getItem('iseeetl_store');
    const user = raw ? JSON.parse(raw).user : {};
    return window.location.pathname === '/login' && !user?.isLogin && !user?.token;
  }, [], (result) => {
    if (result.value === true || attempt >= 40) {
      browser.assert.ok(result.value === true, 'パスワード変更後にセッションを解除し、ログイン画面へ戻ります。');
      if (result.value === true) onReady();
      else browser.end();
      return;
    }
    browser.pause(250, () => waitForPasswordChangeSuccess(browser, onReady, attempt + 1));
  });
};

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'パスワード変更後に自動ログアウトし、新しいパスワードでログインできる': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');
    const stamp = String(Date.now()).slice(-8);
    const nextPassword = `E2E${stamp}aA`;
    const base = getBaseUrl(browser).replace(/\/$/, '');

    loginByForm(browser, { mail, password });
    waitForUserRole(browser, 'Author');

    openChangePassword(browser);
    submitChangePassword(browser, password, nextPassword);

    waitForPasswordChangeSuccess(browser, () => {
      navigateToApp(browser, `${base}/login`);
      loginByForm(browser, { mail, password: nextPassword });
      waitForUserRole(browser, 'Author');
      browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
      browser.end();
    });
  },
};
