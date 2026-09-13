const { navigateDirectToApp, waitForAppBootstrap } = require('../../helpers/login');
const {
  loginByForm,
  loginIfPresent,
  getInviteUserCredentials,
  getFloorEditorCredentials,
  createInviteUrl,
  captureInviteUrl,
  waitForInviteCompletion,
  closeSoundCautionIfVisible,
  setInviteUrl,
  getInviteUrl,
  clickFirstVisible,
  logout,
  ensureRoomIsMemberOnly,
  openFloorList,
  openRoomList,
  waitForUserRole,
  waitForFloorTitle,
  waitForRoomTitle,
  findFloorIdByTitle,
  findRoomIdByTitle,
  createFloor,
  createRoom,
} = require('../../helpers/invite-ui-helpers');

module.exports = {
  '招待画面からルームに参加できる': (browser) => {
    const inviteUser = getInviteUserCredentials();
    const floorEditor = getFloorEditorCredentials();

    if (!inviteUser || !floorEditor) {
      browser.assert.ok(false, 'ルーム招待の成功テストをスキップします。必須の環境変数が未設定です。');
      browser.end();
      return;
    }
    if (inviteUser.mail === floorEditor.mail) {
      browser.assert.ok(false, 'ルーム招待では、フロア編集ユーザと招待されるユーザを分けてください。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Invite Room Floor ${stamp}`;
    const roomTitle = `E2E Invite Room ${stamp}`;
    let floorId = '';
    let roomId = '';
    let expectedRoomPath = '';

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

    browser.perform(() => {
      if (!floorId || !roomId) {
        browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      expectedRoomPath = `/floor/${floorId}/room/${roomId}`;
      ensureRoomIsMemberOnly(browser, floorId, roomId);
      openRoomList(browser, floorId);
      const inviteButton = `[data-testid="room-invite-member-button-${roomId}"]`;
      browser
        .waitForElementVisible(inviteButton, 10000)
        .click(inviteButton)
        .waitForElementVisible('[data-testid="dialog-invite-room-member"]', 10000);
    });
    createInviteUrl(browser, 'room', '8h');

    captureInviteUrl(browser, '[data-testid="dialog-invite-room-member-url"]', 'ルーム', (value) => {
      setInviteUrl(browser, 'room', value);
    });
    browser.assert.textContains('#invite_room_member_dialog_limit', '8時間');

    clickFirstVisible(
      browser,
      '[data-testid="dialog-invite-room-member-close-desktop"], [data-testid="dialog-invite-room-member-close-mobile"]',
      'ルーム招待を閉じる'
    );
    browser.waitForElementNotVisible('[data-testid="dialog-invite-room-member"]', 10000);

    logout(browser);

    loginByForm(browser, inviteUser);
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    browser.perform((done) => {
      const target = getInviteUrl(browser, 'room');
      if (!target) {
        browser.assert.ok(false, 'ルームの招待URLがありません。');
        done();
        return;
      }
      browser.assert.ok(true, 'ルームの招待URLを取得しました。');
      navigateDirectToApp(browser, target);
      done();
    });
    waitForAppBootstrap(browser, 'ルームの招待URLを直接開いたときの初期化');
    browser.waitForElementVisible('.view', 10000);
    loginIfPresent(browser, inviteUser);
    waitForInviteCompletion(browser, expectedRoomPath, 'ルーム');

    browser.end();
  },
};
