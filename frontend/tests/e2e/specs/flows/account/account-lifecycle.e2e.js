// 作成ユーザは次回のE2E用DB初期化で削除する。
const crypto = require('crypto');
const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { waitForConfirmDialog } = require('../../helpers/dialog-focus');
const { clickExactAccountSubmit, clickExactAccountConfirm } = require('../../helpers/account-submit');
const {
  resolveMailpitBaseUrl,
  ensureMailpitAvailable,
  clearMailpit,
  waitForMailpitLink,
} = require('../../helpers/mailpit');

const CONFIRM_DIALOG_ROOT = '[data-testid="confirm-dialog"]';
const ORIGINAL_PASSWORD = 'E2eStart1';
const RESET_PASSWORD = 'E2eReset2';

const state = {
  frontendBaseUrl: '',
  mailpitBaseUrl: '',
  mail: '',
  username: '',
  activationLink: '',
  resetLink: '',
  failed: false,
};

const buildIdentity = () => {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return {
    mail: `e2e.account.${id}@example.invalid`,
    username: `E2E Account ${id.slice(0, 6)}`,
  };
};

const runPhase = (browser, phase) => {
  browser.perform(() => {
    if (!state.failed) phase();
  });
};

const waitForLoginSuccess = (browser, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      let authenticated = false;
      try {
        const raw = localStorage.getItem('iseeetl_store');
        const store = raw ? JSON.parse(raw) : null;
        authenticated = !!(store && store.user && store.user.isLogin && store.user.token);
      } catch (_) {
        authenticated = false;
      }
      return {
        authenticated,
        onLoginPage: window.location.pathname === '/login',
      };
    },
    [],
    (result) => {
      const current = result && result.value ? result.value : { authenticated: false, onLoginPage: true };
      if (current.authenticated && !current.onLoginPage) {
        browser.assert.ok(true, `${label}: ログインしました。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${label}: ログインが完了しませんでした。`);
        return;
      }
      browser.pause(500, () => waitForLoginSuccess(browser, label, attempt + 1));
    }
  );
};

const waitForResetRequestSuccess = (browser, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const field = document.querySelector('#mail');
      const snackbar = document.querySelector('[data-testid="app-snackbar"]');
      const visible = !!(snackbar && (snackbar.offsetParent || snackbar.getClientRects().length));
      return {
        fieldCleared: !!field && field.value === '',
        snackbarVisible: visible,
      };
    },
    [],
    (result) => {
      const current = result && result.value ? result.value : {};
      if (current.fieldCleared && current.snackbarVisible) {
        browser.assert.ok(true, 'パスワード再設定メールの送信要求が成功しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'パスワード再設定メールの送信要求が完了しませんでした。');
        return;
      }
      browser.pause(500, () => waitForResetRequestSuccess(browser, attempt + 1));
    }
  );
};

const queueMailLinkLookup = (browser, { key, pathPrefix, label }) => {
  browser.perform((done) => {
    if (state.failed) {
      done();
      return;
    }
    waitForMailpitLink({
      recipient: state.mail,
      expectedOrigin: state.frontendBaseUrl,
      pathPrefix,
      baseUrl: state.mailpitBaseUrl,
    }).then(
      (link) => {
        state[key] = link;
        browser.assert.ok(true, `${label}: メールを受信しました。`);
        done();
      },
      (error) => {
        state.failed = true;
        browser.assert.ok(false, error.message);
        done();
      }
    );
  });
};

const clearBrowserSession = (browser) => {
  browser.deleteCookies().execute(function () {
    try {
      localStorage.removeItem('iseeetl_store');
      localStorage.removeItem('persist:root');
      sessionStorage.clear();
      return { ok: true };
    } catch (_) {
      return { ok: false };
    }
  });
};

module.exports = {
  '@tags': ['mail-capture-enabled'],

  before(browser, done) {
    const identity = buildIdentity();
    state.mail = identity.mail;
    state.username = identity.username;
    state.frontendBaseUrl = new URL(getBaseUrl(browser)).origin;
    state.mailpitBaseUrl = resolveMailpitBaseUrl();

    ensureMailpitAvailable({ baseUrl: state.mailpitBaseUrl })
      .then(() => clearMailpit({ baseUrl: state.mailpitBaseUrl }))
      .then(() => done())
      .catch((error) => done(error));
  },

  after(browser, done) {
    clearMailpit({ baseUrl: state.mailpitBaseUrl }).then(
      () => done(),
      (error) => done(error)
    );
  },

  'ユーザ登録・本登録・パスワード再設定を完了する': (browser) => {
    runPhase(browser, () => {
      clearBrowserSession(browser);
      browser
        .url(`${state.frontendBaseUrl}/register`)
        .waitForElementVisible('#username', 10000)
        .clearValue('#username')
        .setValue('#username', state.username)
        .clearValue('#mail')
        .setValue('#mail', state.mail)
        .clearValue('#password')
        .setValue('#password', ORIGINAL_PASSWORD)
        .click('#terms');

      clickExactAccountSubmit(browser, {
        expectedInputs: [
          { selector: '#username', value: state.username },
          { selector: '#mail', value: state.mail },
          { selector: '#password', value: ORIGINAL_PASSWORD },
        ],
        expectedChecks: [{ selector: '#terms', checked: true }],
        submitSelector: '[data-testid="account-submit"]',
        label: 'アカウント登録',
      });

      waitForConfirmDialog(browser, CONFIRM_DIALOG_ROOT, '登録確認ダイアログ');
      clickExactAccountConfirm(browser, {
        requireNonEmptyTitle: true,
        submitSelector: '[data-testid="register-complete-login"]',
        label: '登録の確定',
      });
      browser.waitForElementVisible('#mail', 10000);
    });

    queueMailLinkLookup(browser, {
      key: 'activationLink',
      pathPrefix: '/user/activate/',
      label: 'アカウント有効化',
    });

    runPhase(browser, () => {
      browser.url(state.activationLink);
      waitForConfirmDialog(browser, CONFIRM_DIALOG_ROOT, 'アカウント有効化の確認ダイアログ');
      clickExactAccountConfirm(browser, {
        requireNonEmptyTitle: true,
        submitSelector: '[data-testid="activation-result-next"]',
        label: 'アカウント有効化の確定',
      });
      browser
        .waitForElementVisible('#mail', 10000)
        .clearValue('#mail')
        .setValue('#mail', state.mail)
        .clearValue('#password')
        .setValue('#password', ORIGINAL_PASSWORD);
      clickExactAccountSubmit(browser, {
        expectedInputs: [
          { selector: '#mail', value: state.mail },
          { selector: '#password', value: ORIGINAL_PASSWORD },
        ],
        submitSelector: '[data-testid="login-submit"]',
        label: '初期パスワードでログイン',
      });
      waitForLoginSuccess(browser, '初期パスワード');
    });

    runPhase(browser, () => {
      navigateToApp(browser, `${state.frontendBaseUrl}/user/sendresetpasswordlink`);
      browser
        .waitForElementVisible('#mail', 10000)
        .clearValue('#mail')
        .setValue('#mail', state.mail);
      clickExactAccountSubmit(browser, {
        expectedInputs: [{ selector: '#mail', value: state.mail }],
        submitSelector: '[data-testid="account-submit"]',
        label: 'パスワード再設定の要求',
      });
      waitForResetRequestSuccess(browser);
    });

    queueMailLinkLookup(browser, {
      key: 'resetLink',
      pathPrefix: '/user/resetpassword/',
      label: 'パスワード再設定',
    });

    runPhase(browser, () => {
      browser.url(state.resetLink);
      browser
        .waitForElementVisible('#password', 10000)
        .setValue('#password', RESET_PASSWORD)
        .setValue('#confirm-password', RESET_PASSWORD);
      clickExactAccountSubmit(browser, {
        expectedInputs: [
          { selector: '#password', value: RESET_PASSWORD },
          { selector: '#confirm-password', value: RESET_PASSWORD },
        ],
        submitSelector: '[data-testid="account-submit"]',
        label: 'パスワード再設定',
      });
      browser.waitForElementVisible('.view-content [role="status"]', 10000);

      clearBrowserSession(browser);
      navigateToApp(browser, `${state.frontendBaseUrl}/login`);
      browser
        .waitForElementVisible('#mail', 10000)
        .setValue('#mail', state.mail)
        .setValue('#password', RESET_PASSWORD);
      clickExactAccountSubmit(browser, {
        expectedInputs: [
          { selector: '#mail', value: state.mail },
          { selector: '#password', value: RESET_PASSWORD },
        ],
        submitSelector: '[data-testid="login-submit"]',
        label: '再設定したパスワードでログイン',
      });
      waitForLoginSuccess(browser, 'パスワード再設定');
    });

    browser.end();
  },
};
