const {
  closeSoundCautionIfVisible,
  openGuestPostDialog,
  openGuestTimeline,
  waitForPostTextContains,
  verifyGuestMediaBlocked,
} = require('../../helpers/guest-helpers');
const { requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const assertGuestPostInputEnabled = (browser) => {
  browser.execute(
    function () {
      const input = document.querySelector('#post_content');
      if (!input) return { ok: false, reason: 'post-content-not-found' };
      return { ok: !input.disabled, reason: input.disabled ? 'post-content-disabled' : '' };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'unknown' };
      if (!state.ok) {
        browser.assert.ok(false, `ゲストの投稿欄を操作できません: ${state.reason || 'unknown'}`);
      } else {
        browser.assert.ok(true, '通常ルームでゲストの投稿欄が有効です。');
      }
    }
  );
};

module.exports = {
  '通常ルームのゲストはテキストを投稿でき、メディアは投稿できない': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Guest Post Floor ${stamp}`;
    const roomTitle = `E2E Guest Post Room ${stamp}`;
    const postText = `E2E Guest Text Post ${stamp}`;
    const state = prepareFloorRoom(browser, { editorMail, editorPassword, floorTitle, roomTitle });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      openGuestTimeline(browser, state.floorId, state.roomId);
      closeSoundCautionIfVisible(browser);
    });

    openGuestPostDialog(browser);
    assertGuestPostInputEnabled(browser);

    verifyGuestMediaBlocked(browser);

    browser
      .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
      .waitForElementVisible('#post_content', 10000)
      .clearValue('#post_content')
      .setValue('#post_content', postText)
      .assert.value('#post_content', postText);
    clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#post_content',
      expectedControls: [{ selector: '#post_content', property: 'value', value: postText }],
      submitSelector:
        '.desktop-item[data-testid="dialog-edit-post-submit"], .mobile-item[data-testid="dialog-edit-post-submit"]',
      label: 'ゲストの投稿を送信',
    });
    browser.waitForElementNotVisible('[data-testid="dialog-edit-post"]', 10000);
    waitForPostTextContains(browser, postText);

    browser.end();
  },
};
