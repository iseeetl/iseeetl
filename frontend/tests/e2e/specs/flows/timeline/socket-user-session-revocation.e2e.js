const {
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
} = require('../../helpers/invite-ui-helpers');
const { requireEnv, navigateToApp } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { waitForTimelineReady } = require('../../helpers/e2e-public-contract');
const {
  loadManagedUser,
  setManagedUserDeleted,
  createAdminRoomPost,
  installUserSessionRevocationProbe,
  waitForSessionRevocation,
  verifyRevokedSocketDidNotReceivePost,
  verifyOldSessionRejected,
  closeUserSessionRevocationProbe,
} = require('../../helpers/user-session-revocation');

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'ユーザの論理削除で既存セッションとSocketを失効させ、復元後も旧認証を拒否する': (browser) => {
    const targetUser = {
      mail: requireEnv('E2E_USER_MAIL'),
      password: requireEnv('E2E_USER_PASSWORD'),
    };
    const admin = {
      mail: requireEnv('E2E_ADMIN_MAIL'),
      password: requireEnv('E2E_ADMIN_PASSWORD'),
    };
    const floorEditor = getFloorEditorCredentials();
    const finish = () => {
      closeUserSessionRevocationProbe(browser);
      clearBrowserSession(browser);
      browser.end();
    };

    if (!floorEditor) {
      browser.assert.ok(false, 'E2E_FLOOR_EDITOR_MAIL/PASSWORDが必要です。');
      finish();
      return;
    }
    if (targetUser.mail === admin.mail || targetUser.mail === floorEditor.mail || admin.mail === floorEditor.mail) {
      browser.assert.ok(false, '管理者、フロア編集ユーザ、初期データの固定の投稿者は、それぞれ別のユーザである必要があります。');
      finish();
      return;
    }
    browser.assert.ok(true, '管理者、フロア編集ユーザ、初期データの固定の投稿者は、それぞれ別のユーザです。');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E User Session Floor ${stamp}`;
    const roomTitle = `E2E User Session Room ${stamp}`;
    const postDeletionContent = `E2E User Session Post ${stamp}`;
    const state = {
      floorId: '',
      roomId: '',
      managedUser: null,
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
        browser.assert.ok(false, 'ユーザのセッション失効テスト用のフロアIDを取得できませんでした。');
        return;
      }
      openRoomList(browser, state.floorId);
      createRoom(browser, roomTitle);
      waitForRoomTitle(browser, roomTitle, true);
      findRoomIdByTitle(browser, roomTitle, (roomId) => {
        state.roomId = roomId;
      });
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'ユーザのセッション失効のテストデータを取得できませんでした。');
        finish();
        return;
      }

      loadManagedUser(browser, { admin, targetMail: targetUser.mail }, (managedUser) => {
        state.managedUser = managedUser;
        if (!managedUser) {
          finish();
          return;
        }
        if (managedUser.delete_flg) {
          browser.assert.ok(false, 'セッション失効のテスト前に、初期データの固定の投稿者が有効である必要があります。');
          finish();
          return;
        }

        clearBrowserSession(browser);
        loginByForm(browser, targetUser);
        closeSoundCautionIfVisible(browser);
        navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.roomId))
          .waitForElementVisible('.timeline-page', 10000)
          .waitForElementPresent('[data-testid="timeline-connected"]', 20000);

        installUserSessionRevocationProbe(browser, (probeReady) => {
          if (!probeReady) {
            finish();
            return;
          }

          setManagedUserDeleted(browser, { admin, user: managedUser, deleteFlg: true }, (deleted) => {
            if (!deleted) {
              finish();
              return;
            }

            waitForSessionRevocation(browser, 0, (revoked) => {
              if (!revoked) {
                finish();
                return;
              }

              createAdminRoomPost(
                browser,
                {
                  admin,
                  floorId: state.floorId,
                  floorTitle,
                  roomId: state.roomId,
                  roomTitle,
                  content: postDeletionContent,
                },
                (postCreated) => {
                  if (!postCreated) {
                    finish();
                    return;
                  }

                  verifyRevokedSocketDidNotReceivePost(browser, postDeletionContent, (postIsolated) => {
                    if (!postIsolated) {
                      finish();
                      return;
                    }

                    verifyOldSessionRejected(browser, 'deleted', (deletedSessionRejected) => {
                      if (!deletedSessionRejected) {
                        finish();
                        return;
                      }

                      setManagedUserDeleted(browser, { admin, user: managedUser, deleteFlg: false }, (restored) => {
                        if (!restored) {
                          finish();
                          return;
                        }

                        verifyOldSessionRejected(browser, 'restored', (restoredSessionRejected) => {
                          if (!restoredSessionRejected) {
                            finish();
                            return;
                          }

                          clearBrowserSession(browser);
                          loginByForm(browser, targetUser);
                          closeSoundCautionIfVisible(browser);
                          navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.roomId))
                            .waitForElementVisible('.timeline-page', 10000);
                          waitForTimelineReady(
                            browser,
                            { requireRoomReady: true, maxAttempts: 120, interval: 250 },
                            (ready, summary) => {
                              browser.assert.ok(
                                ready,
                                `復元したユーザのタイムラインのSocket接続を確認しました: ${JSON.stringify(summary)}`
                              );
                              finish();
                            }
                          );
                        });
                      });
                    });
                  });
                }
              );
            });
          });
        });
      });
    });
  },
};
