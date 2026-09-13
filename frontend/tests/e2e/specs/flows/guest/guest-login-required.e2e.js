const {
  closeSoundCautionIfVisible,
  openGuestPostDialog,
  openGuestTimeline,
  verifyGuestMediaBlocked,
} = require('../../helpers/guest-helpers');
const { requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');

module.exports = {
  'ゲストがメディア投稿を試みるとログインを求める': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Guest Login Floor ${stamp}`;
    const roomTitle = `E2E Guest Login Room ${stamp}`;
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
    verifyGuestMediaBlocked(browser, () => {
      browser.end();
    });
  },
};
