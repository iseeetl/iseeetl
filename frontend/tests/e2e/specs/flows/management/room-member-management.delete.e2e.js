const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const {
  loginToTimeline,
  loginByForm,
  getInviteUserCredentials,
  getFloorEditorCredentials,
  captureInviteUrl,
  createInviteUrl,
  waitForInviteCompletion,
  closeSoundCautionIfVisible,
  setInviteUrl,
  getInviteUrl,
  clickFirstVisible,
  logout,
  ensureRoomIsMemberOnly,
  openRoomList,
} = require('../../helpers/invite-ui-helpers');

const openManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/roommember`;
  navigateToApp(browser, url).waitForElementVisible('table.management-table', 10000);
};

const readStoreMemberContext = (browser, onReady, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      let persisted = {};
      try {
        persisted = JSON.parse(window.localStorage.getItem('iseeetl_store') || '{}');
      } catch (_) {
        persisted = {};
      }
      return {
        username: persisted.user && persisted.user.name ? String(persisted.user.name) : '',
        roomTitle: persisted.room && persisted.room.title ? String(persisted.room.title) : '',
      };
    },
    [],
    (result) => {
      const username = result && result.value ? result.value.username : '';
      const roomTitle = result && result.value ? result.value.roomTitle : '';
      if (!username || !roomTitle) {
        if (attempt >= maxAttempts) {
          browser.assert.ok(false, '保存済みのメンバー情報を取得できませんでした。');
          return;
        }
        browser.pause(500, () => readStoreMemberContext(browser, onReady, attempt + 1));
        return;
      }
      if (onReady) onReady({ username, roomTitle });
    }
  );
};

const inviteRoomMember = (browser, inviteUser, floorEditor, onReady) => {
  const expectedRoomPath = `/floor/${inviteUser.floorId}/room/${inviteUser.roomId}`;

  loginToTimeline(browser, {
    ...floorEditor,
    floorId: inviteUser.floorId,
    roomId: inviteUser.roomId,
    waitForConnected: false,
  });
  closeSoundCautionIfVisible(browser);
  ensureRoomIsMemberOnly(browser, inviteUser.floorId, inviteUser.roomId);

  openRoomList(browser, inviteUser.floorId);
  const inviteButton = `[data-testid="room-invite-member-button-${inviteUser.roomId}"]`;
  browser
    .waitForElementVisible(inviteButton, 10000)
    .click(inviteButton)
    .waitForElementVisible('[data-testid="dialog-invite-room-member"]', 10000);
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

  logout(browser, inviteUser.floorId, inviteUser.roomId);

  loginByForm(browser, inviteUser);
  closeSoundCautionIfVisible(browser);
  browser.perform((done) => {
    const target = getInviteUrl(browser, 'room');
    if (!target) {
      browser.assert.ok(false, 'ルームの招待URLがありません。');
      done();
      return;
    }
    navigateToApp(browser, target);
    done();
  });
  waitForInviteCompletion(browser, expectedRoomPath, 'ルーム');
  logout(browser, inviteUser.floorId, inviteUser.roomId);
  if (onReady) onReady();
};

const openDeleteDialogByMember = (browser, member, attempt = 0, onReady) => {
  const maxAttempts = 10;
  browser.execute(
    function (target) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const row = rows.find((node) => {
        const cells = Array.from(node.querySelectorAll('td'));
        const values = cells.map((cell) => (cell.textContent || '').trim());
        return values.includes(target.roomTitle) && values.includes(target.username);
      });
      if (!row) return { clicked: false };
      const button = row.querySelector('button.management-row-action-button');
      if (!button) return { clicked: false };
      button.click();
      return { clicked: true };
    },
    [member],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (clicked) {
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '対象メンバーの行が見つかりません。');
        return;
      }
      browser.pause(500, () => openDeleteDialogByMember(browser, member, attempt + 1, onReady));
    }
  );
};

const clickTargetMemberDeleteConfirm = (browser, member, onReady) => {
  browser.execute(
    function (target) {
      const isVisible = function (node) {
        return !!(node && (node.offsetParent || node.getClientRects().length));
      };
      const dialogs = Array.from(
        document.querySelectorAll('[role="dialog"][aria-labelledby="room-member-management-delete-dialog-title"]')
      ).filter(isVisible);
      if (dialogs.length !== 1) {
        return {
          clicked: false,
          dialogCount: dialogs.length,
          payloadMatched: false,
          confirmCount: 0,
        };
      }

      const dialog = dialogs[0];
      const resourceName = dialog.querySelector(
        '#room-member-management-delete-dialog-title-resource-context .dialog-target-context__name'
      );
      const userName = dialog.querySelector(
        '#room-member-management-delete-dialog-title-user-context .dialog-target-context__name'
      );
      const message = dialog.querySelector('#room-member-management-delete-dialog-title-description');
      const payloadMatched =
        String(resourceName && resourceName.textContent ? resourceName.textContent : '').trim() ===
          target.roomTitle &&
        String(userName && userName.textContent ? userName.textContent : '').trim() === target.username &&
        String(message && message.textContent ? message.textContent : '').trim() ===
          `「${target.roomTitle}」からメンバー「${target.username}」を削除します`;
      const confirms = Array.from(
        dialog.querySelectorAll('[data-testid="management-room-member-delete-confirm"]')
      ).filter(
        (button) => isVisible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true'
      );
      const valid = payloadMatched && confirms.length === 1;
      if (valid) confirms[0].click();
      return {
        clicked: valid,
        dialogCount: 1,
        payloadMatched,
        confirmCount: confirms.length,
      };
    },
    [member],
    (result) => {
      const state =
        result && result.value
          ? result.value
          : {
              clicked: false,
              dialogCount: 0,
              payloadMatched: false,
              confirmCount: 0,
            };
      browser.assert.equal(state.dialogCount, 1, 'ルームメンバーの削除ダイアログが1件だけ表示されています。');
      browser.assert.ok(state.payloadMatched, 'ルームメンバーの削除ダイアログのデータが対象を正しく特定しています。');
      browser.assert.equal(
        state.confirmCount,
        1,
        'ルームメンバーの削除確定ボタンは、表示中で有効なものが1件だけあります。'
      );
      if (onReady) onReady(!!state.clicked);
    }
  );
};

const countMemberRows = (browser, member, onReady) => {
  browser.execute(
    function (target) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      return rows.filter((node) => {
        const cells = Array.from(node.querySelectorAll('td'));
        const values = cells.map((cell) => (cell.textContent || '').trim());
        return values.includes(target.roomTitle) && values.includes(target.username);
      }).length;
    },
    [member],
    (result) => {
      const count = result && typeof result.value === 'number' ? result.value : 0;
      if (onReady) onReady(count);
    }
  );
};

const waitForVisibleDialogClosed = (browser, attempt = 0, onReady) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
      const hasVisibleDialog = dialogs.some((node) => node && (node.offsetParent || node.getClientRects().length));
      return { hasVisibleDialog };
    },
    [],
    (result) => {
      const hasVisibleDialog = result && result.value ? result.value.hasVisibleDialog : false;
      if (!hasVisibleDialog) {
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '削除ダイアログが閉じていません。');
        return;
      }
      browser.pause(500, () => waitForVisibleDialogClosed(browser, attempt + 1, onReady));
    }
  );
};

const waitForMemberRowRemoved = (browser, member, attempt = 0, onReady) => {
  const maxAttempts = 30;
  browser.execute(
    function (target) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const count = rows.filter((node) => {
        const cells = Array.from(node.querySelectorAll('td'));
        const values = cells.map((cell) => (cell.textContent || '').trim());
        return values.includes(target.roomTitle) && values.includes(target.username);
      }).length;
      return { count };
    },
    [member],
    (result) => {
      const count = result && result.value ? result.value.count : 0;
      if (count === 0) {
        browser.assert.equal(
          count,
          0,
          `対象メンバーの行が削除されました: room=${member.roomTitle}, username=${member.username}`
        );
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `対象メンバーの行が残っています: room=${member.roomTitle}, username=${member.username}, count=${count}。`
        );
        return;
      }
      browser.pause(500, () => waitForMemberRowRemoved(browser, member, attempt + 1, onReady));
    }
  );
};

module.exports = {
  'ルームメンバー管理でメンバーを削除できる': (browser) => {
    const inviteUser = getInviteUserCredentials();
    const floorEditor = getFloorEditorCredentials();

    if (!inviteUser || !floorEditor) {
      browser.assert.ok(false, 'ルームメンバーの削除テストをスキップします。必須の環境変数が未設定です。');
      browser.end();
      return;
    }
    if (inviteUser.mail === floorEditor.mail) {
      browser.assert.ok(false, 'ルームメンバーの削除では、フロア編集ユーザと削除対象のユーザを分けてください。');
      browser.end();
      return;
    }

    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Room Member Delete Floor ${stamp}`;
    const roomTitle = `E2E Room Member Delete Room ${stamp}`;
    const state = prepareFloorRoom(browser, {
      editorMail: floorEditor.mail,
      editorPassword: floorEditor.password,
      floorTitle,
      roomTitle,
      logoutAfter: true,
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'ルームメンバーの削除テストの準備でフロアIDまたはルームIDを取得できませんでした。');
        browser.end();
        return;
      }

      const preparedInviteUser = {
        ...inviteUser,
        floorId: state.floorId,
        roomId: state.roomId,
      };
      loginToTimeline(browser, { ...preparedInviteUser, waitForConnected: false });
      closeSoundCautionIfVisible(browser);
      readStoreMemberContext(browser, (member) => {
        browser.globals.roomMember = member;
        logout(browser, preparedInviteUser.floorId, preparedInviteUser.roomId);

        inviteRoomMember(browser, preparedInviteUser, floorEditor, () => {
          loginToTimeline(browser, {
            mail: adminMail,
            password: adminPassword,
            floorId: preparedInviteUser.floorId,
            roomId: preparedInviteUser.roomId,
          });
          openManagement(browser);
          countMemberRows(browser, browser.globals.roomMember, (beforeCount) => {
            if (beforeCount !== 1) {
              browser.assert.equal(beforeCount, 1, '削除前の対象メンバーの行が1件だけあります。');
              return;
            }
            openDeleteDialogByMember(browser, browser.globals.roomMember, 0, () => {
              browser.waitForElementVisible(
                '[role="dialog"][aria-labelledby="room-member-management-delete-dialog-title"]',
                10000
              );
              clickTargetMemberDeleteConfirm(browser, browser.globals.roomMember, (clicked) => {
                if (!clicked) {
                  browser.end();
                  return;
                }
                waitForVisibleDialogClosed(browser, 0, () => {
                  waitForMemberRowRemoved(browser, browser.globals.roomMember, 0, () => {
                    logout(browser, preparedInviteUser.floorId, preparedInviteUser.roomId);
                    browser.end();
                  });
                });
              });
            });
          });
        });
      });
    });
  },
};
