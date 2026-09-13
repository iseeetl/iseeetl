const {
  loginIfPresent,
  getInviteUserCredentials,
  getFloorEditorCredentials,
  buildFloorUrl,
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
  'フロアメンバーを削除すると対象のSocket接続と接続権限が失効する': (browser) => {
    const inviteUser = getInviteUserCredentials();
    const floorEditor = getFloorEditorCredentials();

    if (!inviteUser || !floorEditor) {
      browser.assert.ok(false, 'フロアメンバー削除時のSocket切断テストをスキップします。必須の認証情報が未設定です。');
      browser.end();
      return;
    }
    if (inviteUser.mail === floorEditor.mail) {
      browser.assert.ok(false, 'フロアメンバー削除時のSocket切断テストをスキップします。フロア編集ユーザと対象ユーザを分けてください。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Floor Socket Removal ${stamp}`;
    const roomTitle = `E2E Floor Socket Removal Room ${stamp}`;
    const state = { floorId: '', roomId: '' };

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
        browser.assert.ok(false, 'フロアメンバー削除時のSocket切断テスト用のフロアIDを取得できませんでした。');
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
        browser.assert.ok(false, 'フロアメンバー削除時のSocket切断テスト用のフロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      navigateToApp(browser, buildFloorUrl(browser, state.floorId))
        .waitForElementVisible('[data-testid="room-invite-floor-member-button"]', 10000)
        .click('[data-testid="room-invite-floor-member-button"]')
        .waitForElementVisible('[data-testid="dialog-invite-floor-member"]', 10000);
      createInviteUrl(browser, 'floor', '8h');
    });

    captureInviteUrl(browser, '[data-testid="dialog-invite-floor-member-url"]', 'フロアメンバーの削除', (value) => {
      setInviteUrl(browser, 'floor-removal', value);
    });
    clickFirstVisible(
      browser,
      '[data-testid="dialog-invite-floor-member-close-desktop"], [data-testid="dialog-invite-floor-member-close-mobile"]',
      'フロア招待を閉じる'
    );
    browser.waitForElementNotVisible('[data-testid="dialog-invite-floor-member"]', 10000);

    logout(browser);
    clearBrowserSession(browser);
    loginByForm(browser, inviteUser);
    closeSoundCautionIfVisible(browser);
    browser.perform((done) => {
      const inviteUrl = getInviteUrl(browser, 'floor-removal');
      if (!inviteUrl) {
        browser.assert.ok(false, 'フロアメンバー削除時のSocket切断テスト用の招待URLを取得できませんでした。');
        done();
        return;
      }
      navigateToApp(browser, inviteUrl);
      done();
    });
    browser.waitForElementVisible('.view', 10000);
    loginIfPresent(browser, inviteUser);
    browser.perform(() => {
      if (!state.floorId) return;
      waitForInviteCompletion(browser, `/floor/${state.floorId}`, 'フロアメンバーの削除');
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) return;
      navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.roomId))
        .waitForElementVisible('.timeline-page', 10000)
        .waitForElementPresent('[data-testid="timeline-connected"]', 20000);
    });

    const finish = () => browser.end();

    installSocketRevocationProbe(browser, 'フロアメンバー', (probeReady) => {
      if (!probeReady) {
        finish();
        return;
      }
      removeMemberThroughApi(
        browser,
        {
          memberType: 'floor',
          actorMail: floorEditor.mail,
          actorPassword: floorEditor.password,
          scopeId: state.floorId,
          targetMail: inviteUser.mail,
          targetPassword: inviteUser.password,
          label: 'フロア編集ユーザ',
        },
        (removed) => {
          if (!removed) {
            finish();
            return;
          }
          const expectedFloorPath = `/floor/${state.floorId}`;
          waitForSocketRevocation(browser, { label: 'フロアメンバー', expectedPath: expectedFloorPath }, 0, () => {
            waitForReconnectRejected(browser, 'フロアメンバー', 0, () => {
              finish();
            });
          });
        }
      );
    });
  },
};
