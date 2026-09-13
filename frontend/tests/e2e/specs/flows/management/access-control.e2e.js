const { getBaseUrl, buildLoginUrl, requireEnv, navigateToApp } = require('../../helpers/login');
const { clickExactAccountSubmit } = require('../../helpers/account-submit');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');

const MANAGEMENT_ROUTES = [
  { path: '/management/floortag' },
  { path: '/management/categorytag' },
  { path: '/management/ai-analysis-settings' },
  { path: '/management/roomtag' },
  { path: '/management/floor' },
  { path: '/management/post' },
  { path: '/management/spam' },
  { path: '/management/user' },
  { path: '/management/timeline' },
  { path: '/management/floormember' },
  { path: '/management/roommember' },
  { path: '/management/room' },
  { path: '/management/quicktext' },
];

const buildManagementUrl = (browser, path) => {
  const base = getBaseUrl(browser);
  return `${base.replace(/\/$/, '')}${path}`;
};

const waitForLoginState = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      return {
        isLogin: !!document.querySelector('[data-testid="app-menu-button"]') && !document.querySelector('#mail'),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { isLogin: false };
      if (state.isLogin) {
        browser.assert.ok(true, 'ログイン状態を確認しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ログイン状態を確認できませんでした。');
        return;
      }
      browser.pause(500, () => waitForLoginState(browser, attempt + 1));
    }
  );
};

const loginAsUser = (browser, { mail, password, floorId, roomId }) => {
  const loginUrl = buildLoginUrl(browser, floorId, roomId);
  navigateToApp(browser, loginUrl)
    .waitForElementVisible('#mail', 10000)
    .setValue('#mail', mail)
    .setValue('#password', password)
    .waitForElementVisible('[data-testid="login-submit"]', 10000);
  clickExactAccountSubmit(browser, {
    expectedInputs: [
      { selector: '#mail', value: mail },
      { selector: '#password', value: password },
    ],
    submitSelector: '[data-testid="login-submit"]',
    label: '管理画面のアクセス制御を検証するためにログイン',
  });
  waitForLoginState(browser);
};

const waitForPath = (browser, expected, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      return window.location.pathname || '';
    },
    [],
    (result) => {
      const current = result && result.value ? result.value : '';
      if (current === expected) {
        browser.assert.ok(true, `パスが一致しました: ${current}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `パスが一致しません: ${current}`);
        return;
      }
      browser.pause(300, () => waitForPath(browser, expected, attempt + 1));
    }
  );
};

const waitForLoginRedirect = (browser) => {
  browser.waitForElementVisible('#mail', 10000);
  waitForPath(browser, '/login');
};

const waitForManagementView = (browser, path) => {
  browser.waitForElementNotPresent('#mail', 10000);
  waitForPath(browser, path);
  browser.waitForElementVisible('.view h1.view-title', 10000);
};

module.exports = {
  '管理者以外は管理画面へアクセスできない': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Access Control User Floor ${stamp}`;
    const roomTitle = `E2E Access Control User Room ${stamp}`;
    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
      logoutAfter: true,
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, '管理画面のアクセス制御（管理者以外）: フロアIDまたはルームIDを取得できませんでした。');
        finish();
        return;
      }
      loginAsUser(browser, { mail, password, floorId: state.floorId, roomId: state.roomId });

      const firstRoute = MANAGEMENT_ROUTES[0];
      navigateToApp(browser, buildManagementUrl(browser, firstRoute.path));
      waitForLoginRedirect(browser);

      MANAGEMENT_ROUTES.slice(1).forEach((route) => {
        navigateToApp(browser, buildManagementUrl(browser, route.path));
        waitForLoginRedirect(browser);
      });

      finish();
    });
  },

  '管理者は管理画面へアクセスできる': (browser) => {
    const mail = requireEnv('E2E_ADMIN_MAIL');
    const password = requireEnv('E2E_ADMIN_PASSWORD');
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Access Control Admin Floor ${stamp}`;
    const roomTitle = `E2E Access Control Admin Room ${stamp}`;
    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
      logoutAfter: true,
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, '管理画面のアクセス制御（管理者）: フロアIDまたはルームIDを取得できませんでした。');
        finish();
        return;
      }

      loginAsUser(browser, { mail, password, floorId: state.floorId, roomId: state.roomId });
      MANAGEMENT_ROUTES.forEach((route) => {
        const url = buildManagementUrl(browser, route.path);
        navigateToApp(browser, url);
        waitForManagementView(browser, route.path);
      });

      finish();
    });
  },
};
