const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');

const openRoomList = (browser, floorId) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/floor/${encodeURIComponent(floorId)}`;
  navigateToApp(browser, url).waitForElementVisible('.view', 10000);
};

const readFirstRoomLink = (browser, callback) => {
  browser.execute(
    function () {
      const link = document.querySelector('.room-list a');
      return link ? link.getAttribute('href') || '' : '';
    },
    [],
    (result) => callback(result && result.value ? result.value : '')
  );
};

module.exports = {
  'ルーム一覧を表示する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';

    if (!editorMail || !editorPassword) {
      browser.assert.ok(false, 'ルーム一覧の基本動作テストに失敗しました。必須の認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Room List Floor ${stamp}`;
    const roomTitle = `E2E Room List Room ${stamp}`;

    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
    });

    browser.perform(() => {
      if (!state.floorId) {
        browser.assert.ok(false, 'フロアIDを取得できませんでした。');
        return;
      }
      openRoomList(browser, state.floorId);
      browser.waitForElementVisible('.room-list', 10000);
      assertAccessibilityIntegrity(browser, {
        rootSelector: '#app_container',
        label: 'ルーム一覧',
        checkControlNames: true,
      });
      readFirstRoomLink(browser, (href) => {
        if (!href) {
          browser.assert.ok(false, 'ルームのリンクが見つかりません。');
        } else {
          browser.assert.ok(true, `ルームのリンクが見つかりました: ${href}`);
        }
        browser.end();
      });
    });
  },
};
