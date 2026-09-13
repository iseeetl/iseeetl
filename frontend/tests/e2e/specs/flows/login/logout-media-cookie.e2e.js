const { requireEnv } = require('../../helpers/login');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { loginByForm } = require('../../helpers/session-helpers');
const { clickSingleVisible } = require('../../helpers/dialog-focus');

let connection;
const block = (browser, urls) => browser.perform(async () => {
  const result = await connection.send('Network.setBlockedURLs', { urls });
  if (result?.error) throw new Error('ログアウトの通信検証を準備できませんでした。');
});

module.exports = {
  before(browser, done) {
    browser.driver.createCDPConnection('page').then(async (cdp) => {
      connection = cdp;
      const result = await connection.send('Network.enable', {});
      if (result?.error) throw new Error('CDPを有効にできませんでした。');
    }).then(() => done(), () => done(new Error('ログアウトの通信テストを準備できませんでした。')));
  },
  after(browser, done) {
    Promise.resolve().then(async () => {
      if (connection) {
        const result = await connection.send('Network.setBlockedURLs', { urls: [] });
        if (result?.error) throw new Error('CDPの後片付けに失敗しました。');
      }
    }).then(() => { clearBrowserSession(browser); browser.end(done); }, () => browser.end(() => done(new Error('ログアウトの通信検証の後片付けに失敗しました。'))));
  },
  'ゲスト通信が失敗してもユーザCookieを残さず、ログアウト失敗は再試行できる': (browser) => {
    clearBrowserSession(browser);
    loginByForm(browser, { mail: requireEnv('E2E_USER_MAIL'), password: requireEnv('E2E_USER_PASSWORD') });
    // WebDriverでは現在のパスのCookieしか取得できないため、CDPで/mediaを指定する。
    browser.perform(async () => {
      const result = await connection.send('Network.getCookies', { urls: ['http://localhost:3100/media/'] });
      const cookies = result?.result?.cookies || result?.cookies;
      browser.assert.ok(Array.isArray(cookies) && cookies.some(({ name }) => name === 'iseeetl_media_user'), 'ログイン時にユーザのメディア用Cookieが発行されました。');
    });
    block(browser, ['*://localhost:3100/api/auth/logout', '*://localhost:3100/api/guest/*']);
    clickSingleVisible(browser, '[data-testid="app-menu-button"]', 'メニューを開く');
    browser.waitForElementVisible('[data-testid="app-menu-logout"]', 10000);
    clickSingleVisible(browser, '[data-testid="app-menu-logout"]', '障害中にログアウトを試行');
    browser.waitForElementVisible('[data-testid="app-menu"] [role="alert"]', 10000);
    browser.assert.visible('[data-testid="app-menu-logout"]', '完了を確認できないログアウトは再試行できます。');
    block(browser, ['*://localhost:3100/api/guest/*']);
    clickSingleVisible(browser, '[data-testid="app-menu-logout"]', 'ゲスト認証が引き続き利用できない状態でログアウトを再試行');
    browser.waitForElementNotPresent('[data-testid="app-menu-logout"]', 10000);
    browser.perform(async () => {
      const result = await connection.send('Network.getCookies', { urls: ['http://localhost:3100/media/'] });
      const cookies = result?.result?.cookies || result?.cookies;
      browser.assert.ok(Array.isArray(cookies) && !cookies.some(({ name }) => name === 'iseeetl_media_user'), 'ログアウト成功時に、ゲスト認証の状態にかかわらずHttpOnly Cookieを削除しました。');
    });
    browser.execute(function () {
      const user = JSON.parse(localStorage.getItem('iseeetl_store') || '{}').user || {};
      return { loggedIn: user.isLogin === true, hasToken: Boolean(user.token) };
    }, [], (result) => {
      browser.assert.equal(result.value.loggedIn, false, 'ローカルのログイン状態を解除しました。');
      browser.assert.equal(result.value.hasToken, false, 'ローカルのユーザトークンを削除しました。');
    });
  },
};
