const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');
const {
  openProfileFromMenu,
  waitForSnackbar,
  clickExactProfileSave,
} = require('../../helpers/profile-helpers');

const waitForUsername = (browser, expected, attempt = 0, onReady) => {
  const maxAttempts = 20;
  browser.getValue('#username', (result) => {
    const current = result && typeof result.value === 'string' ? result.value : '';
    const ready = expected === null ? current.length > 0 : current === expected;

    if (ready) {
      browser.assert.ok(true, expected === null ? 'プロフィールのユーザ名を読み込みました。' : 'プロフィールのユーザ名が保存されています。');
      if (onReady) onReady(current);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(
        false,
        expected === null
          ? 'プロフィールのユーザ名を読み込めませんでした。'
          : 'プロフィールのユーザ名が保存されていません。'
      );
      return;
    }
    browser.pause(300, () => waitForUsername(browser, expected, attempt + 1, onReady));
  });
};

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'プロフィールでユーザ名を変更できる': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');
    const stamp = String(Date.now()).slice(-8);
    const nextName = `E2E Author ${stamp}`;
    const base = getBaseUrl(browser).replace(/\/$/, '');

    loginByForm(browser, { mail, password });
    waitForUserRole(browser, 'Author');
    openProfileFromMenu(browser);

    waitForUsername(browser, null, 0, () => {
      browser.clearValue('#username').setValue('#username', nextName);
      clickExactProfileSave(browser, {
        expectedControls: [{ selector: '#username', value: nextName }],
        label: 'プロフィールのユーザ名の更新',
      });
      waitForSnackbar(browser);
      browser.waitForElementNotPresent('#username', 10000);
      navigateToApp(browser, `${base}/`).waitForElementVisible('[data-testid="app-menu-button"]', 10000);
      openProfileFromMenu(browser);
      waitForUsername(browser, nextName, 0, () => browser.end());
    });
  },
};
