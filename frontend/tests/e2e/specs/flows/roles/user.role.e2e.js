const { getBaseUrl, loginToTimeline, navigateToApp } = require('../../helpers/login');
const { ensureFloorAndRoom, waitForTimelineReady } = require('../../helpers/role-helpers');

const openAppMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu"]', 10000);
};

const assertButtonTextAbsent = (browser, text, label) => {
  browser.execute(
    function (targetText) {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some((btn) => btn.textContent && btn.textContent.trim() === targetText);
    },
    [text],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      browser.assert.ok(!exists, `ボタンが非表示です${label ? ` (${label})` : ''}: ${text}`);
    }
  );
};

const assertElementAbsent = (browser, selector, label) => {
  browser.execute(
    function (sel) {
      return !!document.querySelector(sel);
    },
    [selector],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      browser.assert.ok(!exists, `要素が非表示です${label ? ` (${label})` : ''}: ${selector}`);
    }
  );
};

module.exports = {
  '一般ユーザが権限に応じてタイムラインを操作できる': (browser) => {
    const mail = process.env.E2E_USER_MAIL || '';
    const password = process.env.E2E_USER_PASSWORD || '';
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';

    if (!mail || !password) {
      browser.assert.ok(false, '一般ユーザの権限テストをスキップします。E2E_USER_MAIL/PASSWORDが未設定です。');
      browser.end();
      return;
    }

    if (!editorMail || !editorPassword) {
      browser.assert.ok(false, '一般ユーザの権限テストをスキップします。フロア編集ユーザの認証情報が未設定です。');
      browser.end();
      return;
    }

    ensureFloorAndRoom(browser, { editorMail, editorPassword });

    browser.perform(() => {
      const ids = browser.globals.roleTestIds || {};
      if (!ids.floorId || !ids.roomId) {
        browser.assert.ok(false, '一般ユーザの権限テストに失敗しました。フロアIDまたはルームIDを取得できませんでした。');
        browser.end();
        return;
      }

      loginToTimeline(browser, { mail, password, floorId: ids.floorId, roomId: ids.roomId, waitForConnected: false });
      waitForTimelineReady(browser);
      browser.waitForElementVisible('[data-testid="timeline-post-button"]', 10000);

      openAppMenu(browser);
      browser
        .waitForElementVisible('[data-testid="app-menu-profile"]', 10000)
        .waitForElementNotPresent('[data-testid="app-menu-floor-management"]', 10000);

      const base = getBaseUrl(browser).replace(/\/$/, '');
      navigateToApp(browser, base).waitForElementVisible('#search_floor_input', 10000);
      assertButtonTextAbsent(browser, 'フロア作成', 'フロアを作成');
      assertButtonTextAbsent(browser, '全フロア非表示', 'すべてのフロアを非表示');
      assertButtonTextAbsent(browser, '全フロア表示', 'すべてのフロアを表示');

      navigateToApp(browser, `${base}/floor/${encodeURIComponent(ids.floorId)}`).waitForElementVisible(
        '.room-list',
        10000
      );
      assertElementAbsent(browser, '.view-action', 'ルームの操作');
      assertElementAbsent(browser, '.room-action', 'ルーム項目の操作');

      browser.end();
    });
  },
};
