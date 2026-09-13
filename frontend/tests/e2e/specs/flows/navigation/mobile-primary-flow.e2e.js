const { requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const {
  clickFirstVisible,
  closeSoundCautionIfVisible,
  openFloorList,
  waitForDialogClosed,
  waitForTimelineReady,
} = require('../../helpers/guest-helpers');

const MOBILE_WIDTH = 390;
const MOBILE_HEIGHT = 844;
const DESKTOP_WIDTH = 1280;
const DESKTOP_HEIGHT = 900;

const assertMobileViewport = (browser) => {
  browser.execute(
    function () {
      return {
        width: window.innerWidth,
        mobileItems: Array.from(document.querySelectorAll('.mobile-item')).filter((node) => node.offsetParent !== null)
          .length,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { width: 0, mobileItems: 0 };
      browser.assert.ok(state.width <= 896, `モバイル表示の幅を${state.width}pxに設定しました。`);
    }
  );
};

const waitForMenuState = (browser, expectedOpen, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const menu = document.querySelector('[data-testid="app-menu"]');
      const button = document.querySelector('[data-testid="app-menu-button"]');
      return {
        ariaHidden: menu ? menu.getAttribute('aria-hidden') : null,
        expanded: button ? button.getAttribute('aria-expanded') : null,
        visible: !!(menu && (menu.offsetParent || menu.getClientRects().length)),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      const open = state.expanded === 'true' && state.ariaHidden !== 'true' && state.visible;
      const closed = state.expanded === 'false' && !state.visible;
      if ((expectedOpen && open) || (!expectedOpen && closed)) {
        browser.assert.ok(true, `モバイル幅でアプリメニューの状態が${expectedOpen ? '開いている状態' : '閉じた状態'}です。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `アプリメニューの状態が一致しません: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(300, () => waitForMenuState(browser, expectedOpen, attempt + 1));
    }
  );
};

const clickFloorByTitle = (browser, title) => {
  browser.execute(
    function (targetTitle) {
      const titleNode = Array.from(document.querySelectorAll('h2.floor-title')).find(
        (node) => node.textContent && node.textContent.trim() === targetTitle
      );
      const link = titleNode ? titleNode.closest('a') : null;
      if (!link) return { clicked: false, reason: 'floor-link-not-found' };
      link.click();
      return { clicked: true };
    },
    [title],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'unknown' };
      browser.assert.ok(state.clicked, `モバイル表示でフロアのリンクをクリックしました: ${state.reason || title}`);
    }
  );
};

const clickRoomByTitle = (browser, title) => {
  browser.execute(
    function (targetTitle) {
      const titleNode = Array.from(document.querySelectorAll('h2.room-title')).find(
        (node) => node.textContent && node.textContent.trim() === targetTitle
      );
      if (!titleNode) return { clicked: false, reason: 'room-title-not-found' };
      titleNode.click();
      return { clicked: true };
    },
    [title],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'unknown' };
      browser.assert.ok(state.clicked, `モバイル表示でルームのリンクをクリックしました: ${state.reason || title}`);
    }
  );
};

const waitForRoomList = (browser, floorId, roomTitle, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function (expectedFloorId, expectedRoomTitle) {
      const roomTitleNodes = Array.from(document.querySelectorAll('h2.room-title'));
      return {
        path: window.location.pathname,
        roomFound: roomTitleNodes.some((node) => node.textContent && node.textContent.trim() === expectedRoomTitle),
        expectedPath: `/floor/${expectedFloorId}`,
      };
    },
    [floorId, roomTitle],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.path === state.expectedPath && state.roomFound) {
        browser.assert.ok(true, 'モバイル表示で準備したルーム一覧へ移動しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `モバイル表示のルーム一覧が確定しませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForRoomList(browser, floorId, roomTitle, attempt + 1));
    }
  );
};

const waitForTimelinePath = (browser, floorId, roomId, roomTitle, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function (expectedFloorId, expectedRoomId, expectedRoomTitle) {
      const title = document.querySelector('#timeline-room-title');
      return {
        path: window.location.pathname,
        expectedPath: `/floor/${expectedFloorId}/room/${expectedRoomId}`,
        roomTitle: title && title.textContent ? title.textContent.trim() : '',
        expectedRoomTitle,
      };
    },
    [floorId, roomId, roomTitle],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.path === state.expectedPath && state.roomTitle === state.expectedRoomTitle) {
        browser.assert.ok(true, 'モバイル表示で準備したタイムラインへ移動しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `モバイル表示のタイムラインが確定しませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForTimelinePath(browser, floorId, roomId, roomTitle, attempt + 1));
    }
  );
};

module.exports = {
  'スマートフォンでアプリメニュー・フロア・ルーム・タイムラインと各ダイアログを操作できる': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Mobile Floor ${stamp}`;
    const roomTitle = `E2E Mobile Room ${stamp}`;
    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
      logoutAfter: false,
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'モバイル表示の基本操作用のテストデータを取得できませんでした。');
        browser.end();
        return;
      }

      closeSoundCautionIfVisible(browser);
      browser.resizeWindow(MOBILE_WIDTH, MOBILE_HEIGHT);
      openFloorList(browser);
      assertMobileViewport(browser);

      browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000).click('[data-testid="app-menu-button"]');
      waitForMenuState(browser, true);
      browser.click('[data-testid="app-menu-close"]');
      waitForMenuState(browser, false);

      clickFloorByTitle(browser, floorTitle);
      waitForRoomList(browser, state.floorId, roomTitle);
      clickRoomByTitle(browser, roomTitle);
      browser.waitForElementVisible('.timeline-page', 20000);
      waitForTimelinePath(browser, state.floorId, state.roomId, roomTitle);
      waitForTimelineReady(browser);

      browser
        .waitForElementVisible('[data-testid="timeline-room-info-button"]', 10000)
        .click('[data-testid="timeline-room-info-button"]')
        .waitForElementVisible('[data-testid="dialog-room-info"]', 10000);
      clickFirstVisible(browser, '[data-testid="dialog-room-info-close-mobile"]', 'モバイル表示のルーム情報を閉じる');
      waitForDialogClosed(browser, '[data-testid="dialog-room-info"]', 'モバイル表示のルーム情報');

      browser
        .waitForElementVisible('[data-testid="timeline-setting-button"]', 10000)
        .click('[data-testid="timeline-setting-button"]')
        .waitForElementVisible('[data-testid="dialog-timeline-setting"]', 10000)
        .waitForElementVisible('[data-testid="dialog-timeline-setting-cancel-mobile"]', 10000)
        .click('[data-testid="dialog-timeline-setting-cancel-mobile"]');
      waitForDialogClosed(browser, '[data-testid="dialog-timeline-setting"]', 'モバイル表示のタイムライン設定');

      browser.resizeWindow(DESKTOP_WIDTH, DESKTOP_HEIGHT);
      browser.end();
    });
  },
};
