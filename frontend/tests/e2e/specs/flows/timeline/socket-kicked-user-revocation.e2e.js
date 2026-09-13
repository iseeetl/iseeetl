const {
  getInviteUserCredentials,
  getFloorEditorCredentials,
  buildRoomUrl,
  closeSoundCautionIfVisible,
  openFloorList,
  openRoomList,
  waitForUserRole,
  waitForFloorTitle,
  waitForRoomTitle,
  findFloorIdByTitle,
  findRoomIdByTitle,
  createFloor,
  createRoom,
  logout,
} = require('../../helpers/invite-ui-helpers');
const { navigateToApp } = require('../../helpers/login');
const { submitPost, waitForPostVisibleByText } = require('../../helpers/timeline-helpers');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { waitForSocketRevocation } = require('../../helpers/socket-access-revocation');
const {
  installKickedUserSocketProbe,
  waitForKickedReconnectRejected,
  runAuthenticatedRequestsThroughApi,
  waitForKickedRoomRedirect,
} = require('../../helpers/kicked-user-socket');

module.exports = {
  '接続中のユーザをキックすると解除までフロア内の全ルームへ接続できない': (browser) => {
    const targetUser = getInviteUserCredentials();
    const floorEditor = getFloorEditorCredentials();

    if (!targetUser || !floorEditor) {
      browser.assert.ok(false, 'キック時のSocket切断テストをスキップします。必須の認証情報が未設定です。');
      browser.end();
      return;
    }
    if (targetUser.mail === floorEditor.mail) {
      browser.assert.ok(false, 'キック時のSocket切断テストをスキップします。フロア編集ユーザと対象ユーザを分けてください。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Kick Socket Floor ${stamp}`;
    const roomTitleA = `E2E Kick Socket Room A ${stamp}`;
    const roomTitleB = `E2E Kick Socket Room B ${stamp}`;
    const postText = `E2E kick socket target ${stamp}`;
    const state = {
      floorId: '',
      roomIdA: '',
      roomIdB: '',
    };

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
        browser.assert.ok(false, 'キック時のSocket切断テスト用のフロアIDを取得できませんでした。');
        return;
      }
      openRoomList(browser, state.floorId);
      createRoom(browser, roomTitleA);
      waitForRoomTitle(browser, roomTitleA, true);
      findRoomIdByTitle(browser, roomTitleA, (roomId) => {
        state.roomIdA = roomId;
      });
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomIdA) {
        browser.assert.ok(false, 'キック時のSocket切断テスト用の最初のルームを取得できませんでした。');
        return;
      }
      openRoomList(browser, state.floorId);
      createRoom(browser, roomTitleB);
      waitForRoomTitle(browser, roomTitleB, true);
      findRoomIdByTitle(browser, roomTitleB, (roomId) => {
        state.roomIdB = roomId;
      });
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomIdA || !state.roomIdB) {
        browser.assert.ok(false, 'キック時のSocket切断のテストデータを取得できませんでした。');
        return;
      }
      logout(browser);
      clearBrowserSession(browser);
      loginByForm(browser, targetUser);
      closeSoundCautionIfVisible(browser);
      navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.roomIdA))
        .waitForElementVisible('.timeline-page', 10000)
        .waitForElementPresent('[data-testid="timeline-connected"]', 20000);
      submitPost(browser, postText);
      waitForPostVisibleByText(browser, postText, 'キック対象');
    });

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    installKickedUserSocketProbe(browser, targetUser, (targetUserId) => {
      state.targetUserId = targetUserId;
      if (!targetUserId) {
        finish();
        return;
      }

      runAuthenticatedRequestsThroughApi(
        browser,
        {
          actorMail: floorEditor.mail,
          actorPassword: floorEditor.password,
          requests: [
            {
              path: '/api/kickeduser/create',
              body: { user_id: targetUserId, room_id: state.roomIdA },
            },
          ],
          label: 'フロア編集ユーザがフロアからキック',
        },
        (created) => {
          if (!created) {
            finish();
            return;
          }

          waitForSocketRevocation(browser, { label: 'キックされたユーザ', expectedPath: '/' }, 0, (revoked) => {
            if (!revoked) {
              finish();
              return;
            }
            waitForKickedReconnectRejected(browser, 0, (reconnectRejected) => {
              if (!reconnectRejected) {
                finish();
                return;
              }

              navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.roomIdB));
              waitForKickedRoomRedirect(browser, 0, (redirected) => {
                if (!redirected) {
                  finish();
                  return;
                }

                runAuthenticatedRequestsThroughApi(
                  browser,
                  {
                    actorMail: floorEditor.mail,
                    actorPassword: floorEditor.password,
                    requests: [
                      {
                        path: '/api/kickeduser/delete',
                        body: { user_id: targetUserId, floor_id: state.floorId },
                      },
                    ],
                    label: 'フロア編集ユーザがフロアのキックを解除',
                  },
                  (removed) => {
                    if (!removed) {
                      finish();
                      return;
                    }

                    navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.roomIdA))
                      .waitForElementVisible('.timeline-page', 10000)
                      .waitForElementPresent('[data-testid="timeline-connected"]', 20000);
                    navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.roomIdB))
                      .waitForElementVisible('.timeline-page', 10000)
                      .waitForElementPresent('[data-testid="timeline-connected"]', 20000)
                      .perform(() => finish());
                  }
                );
              });
            });
          });
        }
      );
    });
  },
};
