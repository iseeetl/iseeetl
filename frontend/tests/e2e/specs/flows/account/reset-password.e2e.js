// 再設定に成功する経路は、account-lifecycle.e2e.jsでメールの要求から検証する。
const { getBaseUrl } = require('../../helpers/login');

const normalizeBase = (base) => base.replace(/\/$/, '');

const buildResetUrl = (browser, token) => {
  const base = getBaseUrl(browser);
  return `${normalizeBase(base)}/user/resetpassword/${encodeURIComponent(token)}`;
};

const waitForRole = (browser, role) => {
  browser.waitForElementVisible(`.view-content [role="${role}"]`, 10000);
};

module.exports = {
  'パスワード再設定のトークンが無効ならエラーを表示する': (browser) => {
    const url = buildResetUrl(browser, 'invalid-token');

    browser.url(url).waitForElementVisible('.view', 10000);
    waitForRole(browser, 'alert');
    browser.waitForElementVisible('.view-content .text-link', 10000);
    browser.end();
  },
};
