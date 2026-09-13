const {
  getBaseUrl,
  navigateDirectToApp,
  waitForAppBootstrap,
} = require('../../helpers/login');
const {
  loginByForm,
  getFloorEditorCredentials,
  closeSoundCautionIfVisible,
  openFloorList,
  openRoomList,
  waitForUserRole,
  waitForFloorTitle,
  waitForRoomTitle,
  findFloorIdByTitle,
  findRoomIdByTitle,
  createFloor,
  createRoom,
  logout,
} = require('../../helpers/invite-ui-helpers');

const buildFloorInviteUrl = (browser, floorId, token) => {
  const base = getBaseUrl(browser);
  return `${base.replace(/\/$/, '')}/floor/${encodeURIComponent(floorId)}/invite/${encodeURIComponent(token)}`;
};

const buildRoomInviteUrl = (browser, floorId, roomId, token) => {
  const base = getBaseUrl(browser);
  return `${base.replace(/\/$/, '')}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(
    roomId
  )}/invite/${encodeURIComponent(token)}`;
};

const waitForInviteOutcome = (browser, label, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function () {
      const mail = document.querySelector('#mail');
      const errorNode = document.querySelector('.view-content .error-color');
      const link = document.querySelector('.view-content .text-link');
      return {
        path: window.location.pathname || '',
        hasLogin: !!mail,
        errorText: errorNode ? errorNode.textContent.trim() : '',
        linkHref: link ? link.getAttribute('href') || '' : '',
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.hasLogin || state.path === '/login') {
        browser.assert.ok(true, `招待からログイン画面へ移動しました${label ? ` (${label})` : ''}。`);
        return;
      }
      if (state.errorText && state.linkHref) {
        browser.assert.ok(true, `招待のエラーが表示されています${label ? ` (${label})` : ''}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `招待の結果を確認できませんでした${label ? ` (${label})` : ''}: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForInviteOutcome(browser, label, attempt + 1));
    }
  );
};

module.exports = {
  'フロア招待のトークンが無効ならエラー表示または画面遷移で通知する': (browser) => {
    const floorEditor = getFloorEditorCredentials();

    if (!floorEditor) {
      browser.assert.ok(false, '無効なフロア招待のテストをスキップします。必須の環境変数が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Invite Invalid Floor ${stamp}`;
    let floorId = '';

    loginByForm(browser, floorEditor);
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    openFloorList(browser);
    createFloor(browser, floorTitle);
    waitForFloorTitle(browser, floorTitle, true);
    findFloorIdByTitle(browser, floorTitle, (resolvedFloorId) => {
      floorId = resolvedFloorId;
    });

    logout(browser);

    browser.perform(() => {
      if (!floorId) {
        browser.assert.ok(false, 'フロアIDを取得できませんでした。');
        return;
      }
      const url = buildFloorInviteUrl(browser, floorId, 'invalid-token');
      navigateDirectToApp(browser, url);
    });
    waitForAppBootstrap(browser, '無効なフロアの招待URLを直接開いたときの初期化');
    browser.waitForElementVisible('.view', 10000);
    waitForInviteOutcome(browser, 'floor');

    browser.end();
  },

  'ルーム招待のトークンが無効ならエラー表示または画面遷移で通知する': (browser) => {
    const floorEditor = getFloorEditorCredentials();

    if (!floorEditor) {
      browser.assert.ok(false, '無効なルーム招待のテストをスキップします。必須の環境変数が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Invite Invalid Room Floor ${stamp}`;
    const roomTitle = `E2E Invite Invalid Room ${stamp}`;
    let floorId = '';
    let roomId = '';

    loginByForm(browser, floorEditor);
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    openFloorList(browser);
    createFloor(browser, floorTitle);
    waitForFloorTitle(browser, floorTitle, true);
    findFloorIdByTitle(browser, floorTitle, (resolvedFloorId) => {
      floorId = resolvedFloorId;
    });

    browser.perform(() => {
      if (!floorId) {
        browser.assert.ok(false, 'フロアIDを取得できませんでした。');
        return;
      }
      openRoomList(browser, floorId);
      createRoom(browser, roomTitle);
      waitForRoomTitle(browser, roomTitle, true);
      findRoomIdByTitle(browser, roomTitle, (resolvedRoomId) => {
        roomId = resolvedRoomId;
      });
    });

    logout(browser);

    browser.perform(() => {
      if (!floorId || !roomId) {
        browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      const url = buildRoomInviteUrl(browser, floorId, roomId, 'invalid-token');
      navigateDirectToApp(browser, url);
    });
    waitForAppBootstrap(browser, '無効なルームの招待URLを直接開いたときの初期化');
    browser.waitForElementVisible('.view', 10000);
    waitForInviteOutcome(browser, 'room');

    browser.end();
  },
};
