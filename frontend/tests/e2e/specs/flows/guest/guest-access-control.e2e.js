const { getBaseUrl, navigateDirectToApp, waitForAppBootstrap } = require('../../helpers/login');
const {
  loginByForm,
  closeSoundCautionIfVisible,
  openFloorList,
  openRoomList,
  createFloor,
  createRoom,
  waitForFloorTitle,
  waitForRoomTitle,
  findFloorIdByTitle,
  findRoomIdByTitle,
  waitForUserRole,
} = require('../../helpers/guest-helpers');

const readVisibleRoomLinkState = (browser, roomId, callback) => {
  browser.execute(
    function (targetRoomId) {
      const links = Array.from(document.querySelectorAll(`a[id="${targetRoomId}"]`));
      const visibleCount = links.filter((link) => {
        const style = window.getComputedStyle(link);
        const rect = link.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width + rect.height > 0;
      }).length;
      return { matchCount: links.length, visibleCount };
    },
    [roomId],
    (result) => callback(result && result.value ? result.value : { matchCount: -1, visibleCount: -1 })
  );
};

const assertRoomLinkAbsent = (browser, roomId, label) => {
  readVisibleRoomLinkState(browser, roomId, (state) => {
    browser.assert.equal(
      state.visibleCount,
      0,
      `ゲストには対象ルームのリンクが表示されていません（${label}）: ${roomId}（matches=${state.matchCount}）`
    );
  });
};

const assertRoomLinkVisibleOnce = (browser, roomId, label) => {
  readVisibleRoomLinkState(browser, roomId, (state) => {
    browser.assert.ok(
      state.matchCount === 1 && state.visibleCount === 1,
      `ゲストには対象ルームのリンクが1件だけ表示されています（${label}）: ${roomId}（matches=${state.matchCount}, visible=${state.visibleCount}）`
    );
  });
};

const waitForGuestSession = (browser, onDone, attempt = 0) => {
  const maxAttempts = 40;
  browser.execute(
    function () {
      try {
        const store = JSON.parse(localStorage.getItem('iseeetl_store') || '{}');
        const user = store && store.user ? store.user : {};
        return { ready: !user.isLogin && !!user.guestId };
      } catch (_) {
        return { ready: false };
      }
    },
    [],
    (result) => {
      const ready = !!(result && result.value && result.value.ready);
      if (ready) {
        browser.assert.ok(true, 'ログアウト後にゲストのセッションを確認しました。');
        onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ログアウト後にゲストのセッションを確認できませんでした。');
        onDone(false);
        return;
      }
      browser.pause(500, () => waitForGuestSession(browser, onDone, attempt + 1));
    }
  );
};

const logoutToGuestSession = (browser, onDone) => {
  browser
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu-logout"]', 10000)
    .click('[data-testid="app-menu-logout"]');
  waitForGuestSession(browser, onDone);
};

const waitForAccessDenied = (browser, floorId, roomId, label, onDone, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (targetFloorId) {
      const path = window.location.pathname || '';
      const hasLoginForm = !!document.querySelector('#mail');
      return {
        path,
        expectedPath: `/floor/${targetFloorId}`,
        hasLoginForm,
      };
    },
    [floorId],
    (result) => {
      const state = result && result.value ? result.value : { path: '', expectedPath: '', hasLoginForm: true };
      if (!state.hasLoginForm && state.path === state.expectedPath) {
        browser.assert.ok(true, `アクセス拒否を確認しました${label ? ` (${label})` : ''}: ${state.path}`);
        onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `アクセス拒否後に想定したフロアへ戻りませんでした（${label}）: path=${state.path} expected=${state.expectedPath} loginForm=${state.hasLoginForm ? 'yes' : 'no'} room=${roomId}`
        );
        onDone(false);
        return;
      }
      browser.pause(500, () => waitForAccessDenied(browser, floorId, roomId, label, onDone, attempt + 1));
    }
  );
};

module.exports = {
  'ゲストへの一覧表示とルームへの直接アクセスを設定に従って制御する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const base = getBaseUrl(browser).replace(/\/$/, '');

    const state = {
      floorId: '',
      memberOnlyRoomId: '',
      hiddenRoomId: '',
      floorTitle: '',
      memberOnlyTitle: '',
      hiddenTitle: '',
    };

    if (!editorMail || !editorPassword) {
      browser.assert.ok(false, 'ゲストのアクセス制御のテストをスキップします。フロア編集ユーザの認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    state.floorTitle = `E2E Guest Access Floor ${stamp}`;
    state.memberOnlyTitle = `E2E Guest MemberOnly Room ${stamp}`;
    state.hiddenTitle = `E2E Guest Hidden Room ${stamp}`;

    loginByForm(browser, { mail: editorMail, password: editorPassword });
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    openFloorList(browser);
    createFloor(browser, state.floorTitle);
    waitForFloorTitle(browser, state.floorTitle, true);
    findFloorIdByTitle(browser, state.floorTitle, (resolvedFloorId) => {
      state.floorId = resolvedFloorId;
      if (!state.floorId) {
        browser.assert.ok(false, 'ゲストのアクセス制御のテスト用フロアIDを取得できませんでした。');
        return;
      }

      openRoomList(browser, state.floorId);
      createRoom(browser, state.memberOnlyTitle, { memberOnly: true });
      waitForRoomTitle(browser, state.memberOnlyTitle, true);
      findRoomIdByTitle(browser, state.memberOnlyTitle, (resolvedRoomId) => {
        state.memberOnlyRoomId = resolvedRoomId;
      });

      createRoom(browser, state.hiddenTitle, { hidden: true });
      waitForRoomTitle(browser, state.hiddenTitle, true);
      findRoomIdByTitle(browser, state.hiddenTitle, (resolvedRoomId) => {
        state.hiddenRoomId = resolvedRoomId;

        browser.perform(() => {
          if (!state.memberOnlyRoomId || !state.hiddenRoomId) {
            browser.assert.ok(false, 'アクセス制限付きルームのIDを取得できませんでした。');
            return;
          }
          logoutToGuestSession(browser, (guestReady) => {
            if (!guestReady) {
              browser.end();
              return;
            }

            navigateDirectToApp(browser, `${base}/floor/${encodeURIComponent(state.floorId)}`);
            waitForAppBootstrap(browser, 'ゲストがフロアのURLを直接開いたときの初期化');
            browser.waitForElementVisible('.room-list', 10000);
            assertRoomLinkVisibleOnce(browser, state.memberOnlyRoomId, 'member-only');
            assertRoomLinkAbsent(browser, state.hiddenRoomId, 'hidden');

            navigateDirectToApp(
              browser,
              `${base}/floor/${encodeURIComponent(state.floorId)}/room/${encodeURIComponent(state.memberOnlyRoomId)}`
            );
            waitForAppBootstrap(browser, 'ゲストがメンバー限定ルームのURLを直接開いたときの初期化');
            waitForAccessDenied(
              browser,
              state.floorId,
              state.memberOnlyRoomId,
              'メンバー限定ルーム',
              (denied) => {
                if (!denied) {
                  browser.end();
                  return;
                }

                navigateDirectToApp(
                  browser,
                  `${base}/floor/${encodeURIComponent(state.floorId)}/room/${encodeURIComponent(state.hiddenRoomId)}`
                );
                waitForAppBootstrap(browser, 'ゲストが非表示ルームのURLを直接開いたときの初期化');
                browser
                  .waitForElementVisible('.timeline-page', 20000)
                  .waitForElementPresent('[data-testid="timeline-connected"]', 20000)
                  .assert.urlContains(`/room/${encodeURIComponent(state.hiddenRoomId)}`)
                  .end();
              }
            );
          });
        });
      });
    });
  },
};
