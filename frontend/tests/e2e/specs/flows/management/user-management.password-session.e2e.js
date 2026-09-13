// 固定アカウントを変更するため、単独で実行し、直前にE2E用DBを初期化する。
const { requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const {
  openUserManagement,
  applySearch,
  waitForSearchQuery,
  openUserRowByMail,
  setDialogPassword,
  clickDialogSubmit,
  waitForDialogClosed,
} = require('../../helpers/user-management');

const readCurrentToken = (browser, onReady, onFail) => {
  browser.execute(
    function () {
      try {
        const raw = localStorage.getItem('iseeetl_store');
        const store = raw ? JSON.parse(raw) : null;
        return store && store.user && store.user.token ? String(store.user.token) : '';
      } catch (_) {
        return '';
      }
    },
    [],
    (result) => {
      const token = result && typeof result.value === 'string' ? result.value : '';
      browser.assert.ok(!!token, 'パスワード更新前に、初期データの固定の投稿者のJWTを取得しました。');
      if (token) {
        if (onReady) onReady(token);
        return;
      }
      if (onFail) onFail();
    }
  );
};

const verifyOldTokenRejected = (browser, oldToken, onReady, onFail) => {
  browser.executeAsync(
    function (token, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ status: 0, error: 'unexpected-frontend-origin' });
        return;
      }
      const origin = window.location.origin;

      fetch(`${origin}/api/user/detail`, {
        headers: { authorization: `Bearer ${token}` },
      })
        .then(function (response) {
          done({ status: response.status });
        })
        .catch(function (error) {
          done({ status: 0, error: error && error.message ? error.message : 'request-failed' });
        });
    },
    [oldToken],
    (result) => {
      const state = result && result.value ? result.value : { status: 0, error: 'no-result' };
      browser.assert.equal(state.status, 401, `パスワード更新後に古いJWTが拒否されます（${state.error || 'ok'}）。`);
      if (state.status === 401) {
        if (onReady) onReady();
        return;
      }
      if (onFail) onFail();
    }
  );
};

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'ユーザ管理でパスワードを更新すると既存のJWTが無効になる': (browser) => {
    const admin = {
      mail: requireEnv('E2E_ADMIN_MAIL'),
      password: requireEnv('E2E_ADMIN_PASSWORD'),
    };
    const author = {
      mail: requireEnv('E2E_USER_MAIL'),
      password: requireEnv('E2E_USER_PASSWORD'),
    };
    const searchTerm = author.mail.slice(0, 20);
    const temporaryPassword = `E2e!${String(Date.now()).slice(-8)}A`;
    const finish = () => browser.end();

    if (admin.mail === author.mail) {
      browser.assert.ok(false, '初期データの固定の投稿者と管理者は別のユーザである必要があります。');
      finish();
      return;
    }
    browser.assert.ok(true, '初期データの固定の投稿者と管理者は別のユーザです。');
    clearBrowserSession(browser);
    loginByForm(browser, author);
    readCurrentToken(browser, (oldToken) => {
      clearBrowserSession(browser);
      loginByForm(browser, admin);
      openUserManagement(browser);
      applySearch(browser, searchTerm);

      waitForSearchQuery(
        browser,
        searchTerm,
        () => {
          openUserRowByMail(
            browser,
            author.mail,
            () => {
              setDialogPassword(browser, temporaryPassword);
              clickDialogSubmit(
                browser,
                { mail: author.mail, password: temporaryPassword },
                () => {
                  waitForDialogClosed(
                    browser,
                    () => {
                      verifyOldTokenRejected(browser, oldToken, () => {
                        clearBrowserSession(browser);
                        loginByForm(browser, { mail: author.mail, password: temporaryPassword });
                        browser.assert.elementPresent(
                          '[data-testid="app-menu-button"]',
                          '初期データの固定の投稿者が新しいパスワードでログインできます。'
                        );
                        finish();
                      }, finish);
                    },
                    finish
                  );
                },
                finish
              );
            },
            finish
          );
        },
        finish
      );
    }, finish);
  },
};
