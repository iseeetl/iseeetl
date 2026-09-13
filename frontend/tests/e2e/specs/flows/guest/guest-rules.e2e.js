const {
  loginByForm,
  logoutIfPossible,
  closeSoundCautionIfVisible,
  openGuestTimeline,
  openTimeline,
  waitForUserRole,
  createPost,
  openReactionPickerForPost,
  clickLikeReaction,
} = require('../../helpers/guest-helpers');
const { requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

module.exports = {
  'ゲストのリアクション時に利用ルールを表示する': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Guest Rules Floor ${stamp}`;
    const roomTitle = `E2E Guest Rules Room ${stamp}`;
    const postText = `E2E Guest Rules Post ${stamp}`;
    const state = prepareFloorRoom(browser, { editorMail, editorPassword, floorTitle, roomTitle });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      loginByForm(browser, { mail: editorMail, password: editorPassword });
      closeSoundCautionIfVisible(browser);
      browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
      waitForUserRole(browser, 'Editor');
      openTimeline(browser, state.floorId, state.roomId);
      createPost(browser, postText);
      logoutIfPossible(browser);
      openGuestTimeline(browser, state.floorId, state.roomId);
      closeSoundCautionIfVisible(browser);
    });

    browser.waitForElementVisible('article', 10000);
    openReactionPickerForPost(browser, postText);
    clickLikeReaction(browser);
    browser.waitForElementVisible('[data-testid="dialog-guest-rules"]', 10000);
    clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#guest_rules_dialog_title',
      expectedControls: [],
      submitSelector: '[data-testid="dialog-guest-rules-confirm"]',
      label: 'ゲストの利用ルールに同意',
    });
    browser.waitForElementNotVisible('[data-testid="dialog-guest-rules"]', 10000);

    browser.end();
  },
};
