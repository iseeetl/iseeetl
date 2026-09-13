const {
  findOptionalElement,
  getBaseUrl,
  loginToTimeline,
  navigateToApp,
  requireEnv,
} = require('../../helpers/login');
const {
  logoutIfPossible,
  openTimeline,
  waitForTimelineReady,
} = require('../../helpers/guest-helpers');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { runEditorFlowWithPreparedFloorRoom } = require('../../helpers/editor-flow');

const openAppMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu"]', 10000);
};

const closeAppMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-close"]', 10000)
    .click('[data-testid="app-menu-close"]')
    .pause(300);
};

const assertAdminMenuVisible = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-floor-management"]', 10000)
    .waitForElementVisible('[data-testid="app-menu-room-management"]', 10000)
    .waitForElementVisible('[data-testid="app-menu-user-management"]', 10000)
    .waitForElementVisible('[data-testid="app-menu-floor-tag-management"]', 10000);
};

const assertAdminMenuHidden = (browser) => {
  browser
    .waitForElementNotPresent('[data-testid="app-menu-floor-management"]', 10000)
    .waitForElementNotPresent('[data-testid="app-menu-room-management"]', 10000)
    .waitForElementNotPresent('[data-testid="app-menu-user-management"]', 10000)
    .waitForElementNotPresent('[data-testid="app-menu-floor-tag-management"]', 10000);
};

const assertTimelineControlsVisible = (browser) => {
  browser
    .waitForElementVisible('[data-testid="timeline-post-button"]', 10000)
    .waitForElementVisible('[data-testid="timeline-sound-tag-button"]', 10000)
    .waitForElementVisible('[data-testid="timeline-speech-toggle-button"]', 10000);
};

const waitForGuestSurface = (browser, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      return {
        hasTimeline: !!document.querySelector('.timeline-page'),
        hasMenuButton: !!document.querySelector('[data-testid="app-menu-button"]'),
        hasLoginForm: !!document.querySelector('#mail'),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.hasTimeline || state.hasMenuButton || state.hasLoginForm) {
        browser.assert.ok(true, 'ゲスト画面を確認しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ゲスト画面を確認できませんでした。');
        return;
      }
      browser.pause(500, () => waitForGuestSurface(browser, attempt + 1));
    }
  );
};

const clearGuestSession = (browser) => {
  const baseUrl = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, baseUrl)
    .deleteCookies()
    .execute(
      function () {
        try {
          localStorage.removeItem('iseeetl_store');
          localStorage.removeItem('persist:root');
          sessionStorage.clear();
        } catch (_) {
          return { ok: false };
        }
        return { ok: true };
      },
      [],
      () => {}
    );
};

module.exports = {
  '管理者の権限に応じた操作ができる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(
      browser,
      'RolePermissionsAdmin',
      ({ floorId, roomId, finish }) => {
        openTimeline(browser, floorId, roomId);
        waitForTimelineReady(browser);
        assertTimelineControlsVisible(browser);
        openAppMenu(browser);
        assertAdminMenuVisible(browser);
        closeAppMenu(browser);
        finish();
      }
    );
  },

  '一般ユーザの権限に応じた操作ができる': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');
    runEditorFlowWithPreparedFloorRoom(browser, 'RolePermissionsUser', ({ floorId, roomId, finish }) => {
      loginToTimeline(browser, { mail, password, floorId, roomId, waitForConnected: false });
      assertTimelineControlsVisible(browser);

      openAppMenu(browser);
      assertAdminMenuHidden(browser);
      browser.waitForElementVisible('[data-testid="app-menu-profile"]', 10000);
      closeAppMenu(browser);
      finish();
    });
  },

  'ゲストの権限に応じた操作ができる': (browser) => {
    runEditorFlowWithPreparedFloorRoom(browser, 'RolePermissionsGuest', ({ floorId, roomId, finish }) => {
      const baseUrl = getBaseUrl(browser);
      const timelineUrl = `${baseUrl.replace(/\/$/, '')}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(
        roomId
      )}`;

      logoutIfPossible(browser);
      clearGuestSession(browser);
      navigateToApp(browser, timelineUrl);
      waitForGuestSurface(browser);

      findOptionalElement(browser, '#mail', (loginResult) => {
        if (loginResult.status === 0) {
          browser.assert.ok(true, 'ゲストがログインフォームへ移動しました。');
          finish();
          return;
        }

        findOptionalElement(browser, '[data-testid="app-menu-button"]', (menuResult) => {
          if (menuResult.status !== 0) {
            browser.assert.ok(false, 'ゲストのテストに失敗しました。アプリメニューが見つかりません。');
            finish();
            return;
          }

          openAppMenu(browser);
          browser.waitForElementVisible('[data-testid="app-menu-login"]', 10000);
          assertAdminMenuHidden(browser);
          closeAppMenu(browser);
          finish();
        });
      });
    });
  },
};
