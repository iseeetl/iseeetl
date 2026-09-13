// 固定アカウントをEditorからAuthorへ変更したまま終了する。
// 単独で実行し、直前にE2E用DBを初期化する。
const {
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
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { requireEnv, navigateToApp } = require('../../helpers/login');
const {
  installRoleDowngradeProbe,
  loadTargetEditor,
  setTargetUserRole,
  verifyDowngradedRestAccess,
  waitForSocketAccessUpdate,
  createAdminRoomPost,
  waitForBroadcastIsolation,
  waitForPrivateReconnectRejected,
  closeRoleDowngradeProbe,
} = require('../../helpers/user-role-downgrade');

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  '編集権限を下げると公開ルーム・メンバー限定ルームの既存Socket接続を再検証する': (browser) => {
    const admin = {
      mail: requireEnv('E2E_ADMIN_MAIL'),
      password: requireEnv('E2E_ADMIN_PASSWORD'),
    };
    const targetEditor = {
      mail: requireEnv('E2E_FLOOR_EDITOR_MAIL'),
      password: requireEnv('E2E_FLOOR_EDITOR_PASSWORD'),
    };
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      closeRoleDowngradeProbe(browser);
      clearBrowserSession(browser);
      browser.end();
    };

    if (admin.mail === targetEditor.mail) {
      browser.assert.ok(false, '管理者と初期データの固定のフロア編集ユーザは別のユーザである必要があります。');
      finish();
      return;
    }
    browser.assert.ok(true, '管理者と初期データの固定のフロア編集ユーザは別のユーザです。');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Role Downgrade Floor ${stamp}`;
    const privateRoomTitle = `E2E Role Downgrade Private ${stamp}`;
    const publicRoomTitle = `E2E Role Downgrade Public ${stamp}`;
    const privatePostContent = `E2E role private after downgrade ${stamp}`;
    const publicPostContent = `E2E role public after downgrade ${stamp}`;
    const state = {
      floorId: '',
      privateRoomId: '',
      publicRoomId: '',
    };

    clearBrowserSession(browser);
    loginByForm(browser, targetEditor);
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
        browser.assert.ok(false, '権限変更のテスト用のフロアIDを取得できませんでした。');
        finish();
        return;
      }

      openRoomList(browser, state.floorId);
      createRoom(browser, privateRoomTitle, { memberOnly: true });
      waitForRoomTitle(browser, privateRoomTitle, true);
      findRoomIdByTitle(browser, privateRoomTitle, (roomId) => {
        state.privateRoomId = roomId;
      });
    });

    browser.perform(() => {
      if (!state.floorId || !state.privateRoomId) {
        browser.assert.ok(false, '権限変更のテスト用のメンバー限定ルームIDを取得できませんでした。');
        finish();
        return;
      }

      createRoom(browser, publicRoomTitle);
      waitForRoomTitle(browser, publicRoomTitle, true);
      findRoomIdByTitle(browser, publicRoomTitle, (roomId) => {
        state.publicRoomId = roomId;
      });
    });

    browser.perform(() => {
      if (!state.floorId || !state.privateRoomId || !state.publicRoomId) {
        browser.assert.ok(false, '権限変更のテスト用のフロアIDまたはルームIDを取得できませんでした。');
        finish();
        return;
      }
      if (state.privateRoomId === state.publicRoomId) {
        browser.assert.ok(false, 'メンバー限定ルームと公開ルームは別のIDである必要があります。');
        finish();
        return;
      }
      browser.assert.ok(true, 'メンバー限定ルームと公開ルームは別のIDです。');

      navigateToApp(browser, buildRoomUrl(browser, state.floorId, state.privateRoomId))
        .waitForElementVisible('.timeline-page', 10000)
        .waitForElementPresent('[data-testid="timeline-connected"]', 20000);

      installRoleDowngradeProbe(browser, { publicRoomId: state.publicRoomId }, (probeReady) => {
        if (!probeReady) {
          finish();
          return;
        }

        loadTargetEditor(browser, { admin, targetMail: targetEditor.mail }, (targetUser) => {
          if (!targetUser) {
            finish();
            return;
          }
          if (targetUser.delete_flg || targetUser.role !== 'Editor') {
            browser.assert.ok(
              false,
              `権限を下げる対象は、有効なフロア編集ユーザである必要があります（role=${targetUser.role || 'unknown'}, deleted=${
                targetUser.delete_flg ? 'yes' : 'no'
              }）。`
            );
            finish();
            return;
          }

          setTargetUserRole(browser, { admin, user: targetUser, role: 'Author' }, (downgraded) => {
            if (!downgraded) {
              finish();
              return;
            }

            verifyDowngradedRestAccess(browser, { floorId: state.floorId, privateRoomId: state.privateRoomId }, (restAllowed) => {
              if (!restAllowed) {
                finish();
                return;
              }
              const expectedFloorPath = `/floor/${state.floorId}`;
              waitForSocketAccessUpdate(browser, expectedFloorPath, 0, (accessUpdated) => {
                if (!accessUpdated) {
                  finish();
                  return;
                }
                createAdminRoomPost(
                  browser,
                  {
                    admin,
                    floorId: state.floorId,
                    floorTitle,
                    roomId: state.privateRoomId,
                    roomTitle: privateRoomTitle,
                    content: privatePostContent,
                  },
                  (privatePostCreated) => {
                    if (!privatePostCreated) {
                      finish();
                      return;
                    }

                    createAdminRoomPost(
                      browser,
                      {
                        admin,
                        floorId: state.floorId,
                        floorTitle,
                        roomId: state.publicRoomId,
                        roomTitle: publicRoomTitle,
                        content: publicPostContent,
                      },
                      (publicPostCreated) => {
                        if (!publicPostCreated) {
                          finish();
                          return;
                        }

                        waitForBroadcastIsolation(
                          browser,
                          { privateContent: privatePostContent, publicContent: publicPostContent },
                          0,
                          (isolated) => {
                            if (!isolated) {
                              finish();
                              return;
                            }
                            waitForPrivateReconnectRejected(browser, 0, (rejected) => {
                              browser.assert.ok(rejected, '権限を下げた後も、変更前の認証情報ではメンバー限定ルームへのアクセスが拒否されます。');
                              finish();
                            });
                          }
                        );
                      }
                    );
                  }
                );
              });
            });
          });
        });
      });
    });
  },
};
