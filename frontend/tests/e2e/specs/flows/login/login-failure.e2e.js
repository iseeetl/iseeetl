const { buildLoginUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');
const { clickExactAccountSubmit } = require('../../helpers/account-submit');

const getInvalidPassword = () => process.env.E2E_INVALID_PASSWORD || 'invalid000';

const getLoginDiagnostics = (browser, callback) => {
  browser.execute(
    function () {
      const getText = (selector) => {
        const node = document.querySelector(selector);
        return node ? node.textContent.trim() : '';
      };
      return {
        url: window.location.href,
        snackbar: getText('[data-testid="app-snackbar"] span'),
        alert: getText('.screen-reader-only[role="alert"]'),
        timelineVisible: !!document.querySelector('.timeline-page'),
        mailPresent: !!document.querySelector('#mail'),
      };
    },
    [],
    (result) => {
      callback(result && result.value ? result.value : {});
    }
  );
};

const waitForLoginFailureMessage = (browser, attempt = 0) => {
  const maxAttempts = 10;
  getLoginDiagnostics(browser, (state) => {
    if (state.snackbar || state.alert) {
      browser.assert.ok(true, 'ログイン失敗のエラーメッセージが表示されています。');
      return;
    }
    if (state.timelineVisible) {
      browser.assert.ok(false, `想定に反してログインが成功しました: ${JSON.stringify(state)}`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `ログイン失敗のメッセージが見つかりません: ${JSON.stringify(state)}`);
      return;
    }
    browser.pause(1000, () => waitForLoginFailureMessage(browser, attempt + 1));
  });
};

const waitForLoginButtonEnabled = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const button = document.querySelector('[data-testid="login-submit"]');
      return { present: !!button, disabled: button ? button.hasAttribute('disabled') : null };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.present && state.disabled === false) {
        browser.assert.ok(true, 'ログインボタンが有効です。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ログインボタンが有効になりませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForLoginButtonEnabled(browser, attempt + 1));
    }
  );
};

module.exports = {
  'ログイン失敗時はエラーを表示してログイン画面にとどまる': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const invalidPassword = getInvalidPassword();
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Login Failure Floor ${stamp}`;
    const roomTitle = `E2E Login Failure Room ${stamp}`;

    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      const loginUrl = buildLoginUrl(browser, state.floorId, state.roomId);
      navigateToApp(browser, loginUrl)
        .waitForElementVisible('#mail', 10000)
        .setValue('#mail', mail)
        .setValue('#password', invalidPassword)
        .waitForElementVisible('[data-testid="login-submit"]', 10000)
        .perform(() => {
          assertAccessibilityIntegrity(browser, {
            rootSelector: '#app_container',
            label: 'ログインフォーム',
            checkControlNames: true,
          });
          waitForLoginButtonEnabled(browser);
        });
      clickExactAccountSubmit(browser, {
        expectedInputs: [
          { selector: '#mail', value: mail },
          { selector: '#password', value: invalidPassword },
        ],
        submitSelector: '[data-testid="login-submit"]',
        label: 'ログイン失敗',
      });
      browser
        .perform(() => {
          waitForLoginFailureMessage(browser);
        })
        .waitForElementVisible('#mail', 10000)
        .waitForElementNotPresent('.timeline-page', 3000);
    });

    browser.end();
  },
};
