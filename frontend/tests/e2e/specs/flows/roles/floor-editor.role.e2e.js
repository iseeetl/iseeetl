const { getBaseUrl, loginToTimeline, navigateToApp } = require('../../helpers/login');
const { ensureFloorAndRoom, waitForTimelineReady } = require('../../helpers/role-helpers');

const openAppMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu"]', 10000);
};

const assertButtonTextPresent = (browser, text, label) => {
  browser.execute(
    function (targetText) {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some((btn) => btn.textContent && btn.textContent.trim() === targetText);
    },
    [text],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      browser.assert.ok(exists, `ボタンが表示されています${label ? ` (${label})` : ''}: ${text}`);
    }
  );
};

const assertElementPresent = (browser, selector, label) => {
  browser.execute(
    function (sel) {
      return !!document.querySelector(sel);
    },
    [selector],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      browser.assert.ok(exists, `要素が表示されています${label ? ` (${label})` : ''}: ${selector}`);
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
  'フロア編集ユーザがフロア・ルーム・タイムラインを操作できる': (browser) => {
    const mail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const password = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    if (!mail || !password) {
      browser.assert.ok(false, 'フロア編集ユーザの権限テストをスキップします。E2E_FLOOR_EDITOR_MAIL/PASSWORDが未設定です。');
      browser.end();
      return;
    }

    ensureFloorAndRoom(browser, { editorMail: mail, editorPassword: password });

    browser.perform(() => {
      const ids = browser.globals.roleTestIds || {};
      if (!ids.floorId || !ids.roomId) {
        browser.assert.ok(false, 'フロア編集ユーザの権限テストに失敗しました。フロアIDまたはルームIDを取得できませんでした。');
        browser.end();
        return;
      }

      loginToTimeline(browser, { mail, password, floorId: ids.floorId, roomId: ids.roomId, waitForConnected: false });
      waitForTimelineReady(browser);
      browser.waitForElementVisible('[data-testid="timeline-post-button"]', 10000);

      openAppMenu(browser);
      browser
        .waitForElementVisible('[data-testid="app-menu-profile"]', 10000)
        .waitForElementNotPresent('[data-testid="app-menu-floor-management"]', 10000)
        .waitForElementNotPresent('[data-testid="app-menu-room-management"]', 10000)
        .waitForElementNotPresent('[data-testid="app-menu-user-management"]', 10000)
        .waitForElementNotPresent('[data-testid="app-menu-floor-tag-management"]', 10000);

      const base = getBaseUrl(browser).replace(/\/$/, '');
      navigateToApp(browser, base).waitForElementVisible('#search_floor_input', 10000);
      assertButtonTextPresent(browser, 'フロア作成', 'フロアを作成');
      assertButtonTextPresent(browser, '全フロア非表示', 'すべてのフロアを非表示');
      assertButtonTextPresent(browser, '全フロア表示', 'すべてのフロアを表示');

      navigateToApp(browser, `${base}/floor/${encodeURIComponent(ids.floorId)}`).waitForElementVisible(
        '.room-list',
        10000
      );
      assertElementPresent(browser, '.view-action', 'ルームの操作');
      assertButtonTextPresent(browser, 'ルーム作成', 'ルームを作成');
      assertButtonTextPresent(browser, 'フロアタグ', 'フロアタグ');
      assertButtonTextPresent(browser, 'フロア単語', 'フロアの単語');
      assertElementPresent(browser, '[data-testid="room-invite-floor-member-button"]', 'フロアメンバーの招待');
      assertElementPresent(browser, '[data-testid="room-floor-member-list-button"]', 'フロアメンバー一覧');
      assertElementAbsent(browser, '[data-testid="room-leave-floor-member-button"]', 'フロアメンバーから退出');
      assertElementPresent(browser, '.room-action', 'ルーム項目の操作');

      browser.end();
    });
  },
};
