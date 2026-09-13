const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { ensureFloorAndRoom, waitForTimelineReady } = require('../../helpers/role-helpers');
const { openGuestPostDialog } = require('../../helpers/guest-helpers');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const openGuestTimeline = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const url = `${base}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
  navigateToApp(browser, url).waitForElementVisible('.timeline-page', 20000);
  waitForTimelineReady(browser);
};

const openAppMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu"]', 10000);
};

const closeSoundCautionIfVisible = (browser) => {
  browser.execute(
    function () {
      const dialog = document.querySelector('[data-testid="dialog-sound-caution"]');
      return Boolean(dialog && dialog.getClientRects().length);
    },
    [],
    (result) => {
      if (result && result.value) {
        clickSingleVisibleAfterExactControls(browser, {
          anchorSelector: '#sound_caution_confirm_title',
          submitSelector: '[data-testid="dialog-sound-caution-confirm"]',
          expectedControls: [],
          label: '音声に関する注意を確認',
        });
        browser.waitForElementNotVisible('[data-testid="dialog-sound-caution"]', 10000);
      }
    }
  );
};

module.exports = {
  'ゲストの権限に応じてタイムラインを操作できる': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';

    if (!editorMail || !editorPassword) {
      browser.assert.ok(false, 'ゲストの権限テストをスキップします。フロア編集ユーザの認証情報が未設定です。');
      browser.end();
      return;
    }

    ensureFloorAndRoom(browser, { editorMail, editorPassword });

    browser.perform(() => {
      const ids = browser.globals.roleTestIds || {};
      if (!ids.floorId || !ids.roomId) {
        browser.assert.ok(false, 'ゲストの権限テストに失敗しました。フロアIDまたはルームIDを取得できませんでした。');
        browser.end();
        return;
      }

      openGuestTimeline(browser, ids.floorId, ids.roomId);
      closeSoundCautionIfVisible(browser);
      openAppMenu(browser);
      browser
        .waitForElementVisible('[data-testid="app-menu-login"]', 10000)
        .click('[data-testid="app-menu-backdrop"]')
        .waitForElementNotPresent('[data-testid="app-menu"]', 10000);

      openGuestPostDialog(browser);
      browser.end();
    });
  },
};
