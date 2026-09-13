const {
  closeSoundCautionIfVisible,
  clickFirstVisible,
  openGuestTimeline,
  readGuestName,
} = require('../../helpers/guest-helpers');
const { requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const openGuestProfileDialog = (browser) => {
  browser
    .waitForElementVisible('.guest-profile-button', 10000)
    .click('.guest-profile-button')
    .waitForElementVisible('[data-testid="dialog-guest-profile"]', 10000);
};

module.exports = {
  'ゲストプロフィールで名前を変更できる': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const guestName = `E2E Guest ${stamp}`;
    const floorTitle = `E2E Guest Profile Floor ${stamp}`;
    const roomTitle = `E2E Guest Profile Room ${stamp}`;
    const state = prepareFloorRoom(browser, { editorMail, editorPassword, floorTitle, roomTitle });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      openGuestTimeline(browser, state.floorId, state.roomId);
      closeSoundCautionIfVisible(browser);
    });

    openGuestProfileDialog(browser);
    browser.clearValue('#guest_name').setValue('#guest_name', guestName);
    clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#guest_profile_dialog_title',
      submitSelector: '[data-testid="dialog-guest-profile-confirm"]',
      expectedControls: [{ selector: '#guest_name', value: guestName }],
      label: 'ゲストのプロフィールを確定',
    });
    browser.waitForElementNotVisible('[data-testid="dialog-guest-profile"]', 10000);

    openGuestProfileDialog(browser);
    readGuestName(browser, (value) => {
      browser.assert.strictEqual(value, guestName, 'ゲスト名が更新されました。');
    });
    clickFirstVisible(
      browser,
      '[data-testid="dialog-guest-profile-cancel-desktop"], [data-testid="dialog-guest-profile-cancel-mobile"]',
      'ゲストのプロフィールを閉じる'
    );
    browser.waitForElementNotVisible('[data-testid="dialog-guest-profile"]', 10000);

    browser.end();
  },
};
