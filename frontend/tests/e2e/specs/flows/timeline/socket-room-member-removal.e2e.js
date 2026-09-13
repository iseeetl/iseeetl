const {
  loginIfPresent,
  getInviteUserCredentials,
  getFloorEditorCredentials,
  buildRoomUrl,
  captureInviteUrl,
  createInviteUrl,
  waitForInviteCompletion,
  closeSoundCautionIfVisible,
  setInviteUrl,
  getInviteUrl,
  clickFirstVisible,
  logout,
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
const { navigateToApp } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const {
  installSocketRevocationProbe,
  removeMemberThroughApi,
  waitForSocketRevocation,
  waitForReconnectRejected,
} = require('../../helpers/socket-access-revocation');

module.exports = {
  'ルームメンバーを削除すると対象のSocket接続と接続権限が失効する': (browser) => {
    const inviteUser = getInviteUserCredentials();
    const floorEditor = getFloorEditorCredentials();

    if (!inviteUser || !floorEditor) {
      browser.assert.ok(false, 'ルームメンバー削除時のSocket切断テストには、手順書に記載された認証情報が必要です。');
      browser.end();
      return;
    }
    if (inviteUser.mail === floorEditor.mail) {
      browser.assert.ok(false, 'ルームメンバー削除時のSocket切断テストでは、フロア編集ユーザと対象ユーザを分けてください。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Socket Removal Floor ${stamp}`;
    const roomTitle = `E2E Socket Removal Room ${stamp}`;
    const state = { floorId: '', roomId: '' };
    let expectedRoomPath = '';

    clearBrowserSession(browser);
    loginByForm(browser, floorEditor);
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    openFloorList(browser);
    createFloor(browser, floorTitle);
    waitForFloorTitle(browser, floorTitle, true);
    findFloorIdByTitle(browser, floorTitle, (floorId) => {
      state.floorId = floorId;
    });

    browser.perform(() => {
      if (!state.floorId) {
        browser.assert.ok(false, 'ルームメンバー削除時のSocket切断テスト用のフロアIDを取得できませんでした。');
        return;
      }
      openRoomList(browser, state.floorId);
      createRoom(browser, roomTitle, { memberOnly: true });
      waitForRoomTitle(browser, roomTitle, true);
      findRoomIdByTitle(browser, roomTitle, (roomId) => {
        state.roomId = roomId;
      });
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'ルームメンバー削除時のSocket切断テスト用のフロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      expectedRoomPath = `/floor/${state.floorId}/room/${state.roomId}`;
      openRoomList(browser, state.floorId);
      const inviteButton = `[data-testid="room-invite-member-button-${state.roomId}"]`;
      browser
        .waitForElementVisible(inviteButton, 10000)
        .click(inviteButton)
        .waitForElementVisible('[data-testid="dialog-invite-room-member"]', 10000);
    });
    createInviteUrl(browser, 'room', '8h');
    captureInviteUrl(browser, '[data-testid="dialog-invite-room-member-url"]', 'ルーム', (value) => {
      setInviteUrl(browser, 'room', value);
    });
    clickFirstVisible(
      browser,
      '[data-testid="dialog-invite-room-member-close-desktop"], [data-testid="dialog-invite-room-member-close-mobile"]',
      'ルーム招待を閉じる'
    );
    browser.waitForElementNotVisible('[data-testid="dialog-invite-room-member"]', 10000);

    logout(browser);
    clearBrowserSession(browser);
    loginByForm(browser, inviteUser);
    closeSoundCautionIfVisible(browser);
    browser.perform((done) => {
      const inviteUrl = getInviteUrl(browser, 'room');
      if (!inviteUrl) {
        browser.assert.ok(false, 'ルームメンバー削除時のSocket切断テスト用の招待URLを取得できませんでした。');
        done();
        return;
      }
      navigateToApp(browser, inviteUrl);
      done();
    });
    browser.waitForElementVisible('.view', 10000);
    loginIfPresent(browser, inviteUser);
    waitForInviteCompletion(browser, expectedRoomPath, 'ルーム');
    browser.perform(() => {
      if (!state.floorId || !state.roomId) return;
      navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.roomId))
        .waitForElementVisible('.timeline-page', 10000)
        .waitForElementPresent('[data-testid="timeline-connected"]', 20000);
    });

    const finish = () => browser.end();

    installSocketRevocationProbe(browser, 'ルームメンバー', (probeReady) => {
      if (!probeReady) return finish();
      removeMemberThroughApi(
        browser,
        {
          memberType: 'room',
          actorMail: floorEditor.mail,
          actorPassword: floorEditor.password,
          targetMail: inviteUser.mail,
          targetPassword: inviteUser.password,
          scopeId: state.roomId,
          label: 'フロア編集ユーザ',
        },
        (removed) => {
          if (!removed) return finish();
          const expectedFloorPath = `/floor/${state.floorId}`;
          waitForSocketRevocation(browser, { label: 'ルームメンバー', expectedPath: expectedFloorPath }, 0, () => {
            waitForReconnectRejected(browser, 'ルームメンバー', 0, finish);
          });
        }
      );
    });
  },
};
