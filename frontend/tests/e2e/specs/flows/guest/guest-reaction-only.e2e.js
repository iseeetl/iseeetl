const {
  loginByForm,
  logoutIfPossible,
  closeSoundCautionIfVisible,
  openGuestTimeline,
  openTimeline,
  waitForUserRole,
  createPost,
  readPostReactionCount,
  openReactionPickerForPost,
  clickLikeReaction,
  confirmGuestRulesIfVisible,
  waitForReactionIncrease,
} = require('../../helpers/guest-helpers');
const { requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');

module.exports = {
  'リアクション限定のゲストには投稿操作を表示せず、リアクションを許可する': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Guest Reaction Floor ${stamp}`;
    const roomTitle = `E2E Guest Reaction Room ${stamp}`;
    const postText = `E2E Guest Reaction Post ${stamp}`;
    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
      roomOptions: { guestReactionOnly: true },
    });

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

    browser.waitForElementNotPresent('[data-testid="timeline-post-button"]', 5000);
    browser.perform(() => {
      confirmGuestRulesIfVisible(browser);
      browser.keys('n');
      browser.pause(300);
      browser.execute(
        function () {
          const dialog = document.querySelector('[data-testid="dialog-edit-post"]');
          return { visible: !!(dialog && (dialog.offsetParent || dialog.getClientRects().length)) };
        },
        [],
        (result) => {
          const visible = result && result.value ? result.value.visible : false;
          browser.assert.ok(!visible, 'リアクション限定のゲストは、Nキーで投稿ダイアログを開けません。');
        }
      );
    });

    readPostReactionCount(browser, postText, (state) => {
      if (!state.present) {
        browser.assert.ok(false, 'リアクションできる投稿がありません。');
        return;
      }
      openReactionPickerForPost(browser, postText);
      clickLikeReaction(browser);
      confirmGuestRulesIfVisible(browser);
      waitForReactionIncrease(browser, postText, state.count);
    });

    browser.end();
  },
};
