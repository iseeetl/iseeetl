const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { clearBrowserSession, waitForPath } = require('../../helpers/auth-security');

const verifyLoginRedirect = (browser, path) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  clearBrowserSession(browser);
  navigateToApp(browser, `${base}${path}`).waitForElementVisible('#mail', 10000);
  waitForPath(browser, '/login');
};

module.exports = {
  '認証が必要なアカウント画面ではログインを求める': (browser) => {
    verifyLoginRedirect(browser, '/changepassword');
    browser.end();
  },
};
