// メール送信に成功する経路は、account-lifecycle.e2e.jsで受信まで検証する。
const { getBaseUrl } = require('../../helpers/login');
const { clickExactAccountSubmit } = require('../../helpers/account-submit');

const openSendResetPage = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/user/sendresetpasswordlink`;
  browser.url(url).waitForElementVisible('#mail', 10000);
};

module.exports = {
  '@tags': ['mail-capture-enabled'],
  'パスワード再設定リンクの送信前に入力を検証する': (browser) => {
    openSendResetPage(browser);

    const invalidMail = 'invalid-mail';
    browser.setValue('#mail', invalidMail);
    clickExactAccountSubmit(browser, {
      expectedInputs: [{ selector: '#mail', value: invalidMail }],
      submitSelector: '[data-testid="account-submit"]',
      label: 'パスワード再設定の入力検証',
    });
    browser.waitForElementVisible('[role="alert"]', 5000);

    browser.end();
  },
};
