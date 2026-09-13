const { getBaseUrl, navigateToApp, loginToTimeline } = require('../../helpers/login');
const {
  loginByForm,
  loginIfPresent,
  buildFloorUrl,
  captureInviteUrl,
  createInviteUrl,
  waitForInviteCompletion,
  closeSoundCautionIfVisible,
  setInviteUrl,
  getInviteUrl,
  clickFirstVisible,
  logout,
  openRoomList,
  waitForUserRole,
  waitForFloorTitle,
  waitForRoomTitle,
  findFloorIdByTitle,
  findRoomIdByTitle,
  createFloor,
  createRoom,
} = require('../../helpers/invite-ui-helpers');

const openAppMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu"]', 10000);
};

const assertButtonTextPresent = (browser, text, label) => {
  browser.execute(
    function (targetText) {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some((btn) => btn.textContent && btn.textContent.trim() === targetText);
    },
    [text],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      browser.assert.ok(exists, `ボタンが表示されています${label ? ` (${label})` : ''}: ${text}`);
    }
  );
};

const assertButtonTextAbsent = (browser, text, label) => {
  browser.execute(
    function (targetText) {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some((btn) => btn.textContent && btn.textContent.trim() === targetText);
    },
    [text],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      browser.assert.ok(!exists, `ボタンが非表示です${label ? ` (${label})` : ''}: ${text}`);
    }
  );
};

const assertElementPresent = (browser, selector, label) => {
  browser.execute(
    function (sel) {
      return !!document.querySelector(sel);
    },
    [selector],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      browser.assert.ok(exists, `要素が表示されています${label ? ` (${label})` : ''}: ${selector}`);
    }
  );
};

const waitForFloorListReady = (browser, label, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      const bodyText = document.body && document.body.innerText ? document.body.innerText.slice(0, 120) : '';
      return {
        href: window.location ? window.location.href || '' : '',
        path: `${window.location.pathname || ''}${window.location.search || ''}`,
        hasSearchInput: !!document.querySelector('#search_floor_input'),
        hasLoginForm: !!document.querySelector('#mail'),
        hasAppMenu: !!document.querySelector('[data-testid="app-menu-button"]'),
        hasLoginMenu: !!document.querySelector('[data-testid="app-menu-login"]'),
        hasProfileMenu: !!document.querySelector('[data-testid="app-menu-profile"]'),
        title: document.title || '',
        bodyText,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.hasSearchInput) {
        browser.waitForElementVisible('#search_floor_input', 10000);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `フロア一覧を表示できませんでした${label ? ` (${label})` : ''}: path=${state.path || ''} href=${
            state.href || ''
          } loginForm=${state.hasLoginForm ? 'yes' : 'no'} appMenu=${state.hasAppMenu ? 'yes' : 'no'} loginMenu=${
            state.hasLoginMenu ? 'yes' : 'no'
          } profileMenu=${state.hasProfileMenu ? 'yes' : 'no'} title=${state.title || ''} body=${
            state.bodyText || ''
          }`
        );
        return;
      }
      browser.pause(1000, () => waitForFloorListReady(browser, label, attempt + 1));
    }
  );
};

const openFloorListForSetup = (browser, label) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, base);
  waitForFloorListReady(browser, label);
};

const waitForTimelineConnectedOrContinue = (browser, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const node = document.querySelector('[data-testid="timeline-connected"]');
      const visible = !!(node && (node.offsetParent || node.getClientRects().length));
      return {
        path: `${window.location.pathname || ''}${window.location.search || ''}`,
        hasLoginForm: !!document.querySelector('#mail'),
        exists: !!node,
        visible,
      };
    },
    [],
    (result) => {
      const state =
        result && result.value ? result.value : { path: '', hasLoginForm: false, exists: false, visible: false };
      if (state.visible) {
        browser.assert.ok(true, `タイムラインに接続しました${label ? ` (${label})` : ''}。`);
        return;
      }
      if (state.hasLoginForm) {
        browser.assert.ok(false, `タイムラインからログイン画面へ移動しました${label ? ` (${label})` : ''}: ${state.path}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          true,
          `タイムラインの接続済み表示がありません${label ? ` (${label})` : ''}: path=${state.path} exists=${
            state.exists ? 'yes' : 'no'
          }`
        );
        return;
      }
      browser.pause(1000, () => waitForTimelineConnectedOrContinue(browser, label, attempt + 1));
    }
  );
};

const prepareFloorAndRoomIfMissing = (browser, state, floorEditor) => {
  loginByForm(browser, floorEditor);
  closeSoundCautionIfVisible(browser);
  browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
  waitForUserRole(browser, 'Editor');

  if (!state.floorId) {
    openFloorListForSetup(browser, 'prepare');
    createFloor(browser, state.floorTitle);
    waitForFloorTitle(browser, state.floorTitle, true);
    findFloorIdByTitle(browser, state.floorTitle, (resolvedFloorId) => {
      state.floorId = resolvedFloorId;
    });
  }

  browser.perform(() => {
    if (!state.floorId) {
      browser.assert.ok(false, 'フロアIDを取得できませんでした。');
      return;
    }
    if (state.roomId) return;
    openRoomList(browser, state.floorId);
    createRoom(browser, state.roomTitle);
    waitForRoomTitle(browser, state.roomTitle, true);
    findRoomIdByTitle(browser, state.roomTitle, (resolvedRoomId) => {
      state.roomId = resolvedRoomId;
    });
  });
};

const inviteAndJoinFloorMembership = (browser, state, generalUser) => {
  browser.perform(() => {
    if (!state.floorId || !state.roomId) {
      browser.assert.ok(false, 'フロア招待用のフロアIDまたはルームIDを取得できませんでした。');
      return;
    }
    state.expectedFloorPath = `/floor/${state.floorId}`;
    const floorUrl = buildFloorUrl(browser, state.floorId);
    navigateToApp(browser, floorUrl)
      .waitForElementVisible('[data-testid="room-invite-floor-member-button"]', 10000)
      .click('[data-testid="room-invite-floor-member-button"]')
      .waitForElementVisible('[data-testid="dialog-invite-floor-member"]', 10000);
    createInviteUrl(browser, 'floor', '8h');
  });

  captureInviteUrl(browser, '[data-testid="dialog-invite-floor-member-url"]', 'フロアメンバーの権限', (value) => {
    setInviteUrl(browser, 'floor-role-member', value);
  });

  clickFirstVisible(
    browser,
    '[data-testid="dialog-invite-floor-member-close-desktop"], [data-testid="dialog-invite-floor-member-close-mobile"]',
    'フロア招待を閉じる'
  );
  browser.waitForElementNotVisible('[data-testid="dialog-invite-floor-member"]', 10000);

  logout(browser, state.floorId, state.roomId);

  loginByForm(browser, generalUser);
  closeSoundCautionIfVisible(browser);
  browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
  browser.perform((done) => {
    const target = getInviteUrl(browser, 'floor-role-member');
    if (!target) {
      browser.assert.ok(false, 'フロアの招待URLがありません。');
      done();
      return;
    }
    navigateToApp(browser, target);
    done();
  });
  browser.waitForElementVisible('.view', 10000);
  loginIfPresent(browser, generalUser);
  waitForInviteCompletion(browser, state.expectedFloorPath, 'フロアメンバーの権限');
};

module.exports = {
  'フロアメンバーの権限に応じた操作ができる': (browser) => {
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';

    if (!userMail || !userPassword || !editorMail || !editorPassword) {
      browser.assert.ok(false, 'フロアメンバーの権限テストをスキップします。必須の認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const state = {
      floorId: '',
      roomId: '',
      expectedFloorPath: '',
      floorTitle: `E2E Floor Member Floor ${stamp}`,
      roomTitle: `E2E Floor Member Room ${stamp}`,
    };
    const floorEditor = { mail: editorMail, password: editorPassword };
    const generalUser = { mail: userMail, password: userPassword };

    prepareFloorAndRoomIfMissing(browser, state, floorEditor);
    inviteAndJoinFloorMembership(browser, state, generalUser);

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'フロアメンバーの権限テストに失敗しました。準備後もフロアIDまたはルームIDがありません。');
        return;
      }
      loginToTimeline(browser, {
        mail: userMail,
        password: userPassword,
        floorId: state.floorId,
        roomId: state.roomId,
        waitForConnected: false,
      });
    });

    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('.timeline-page', 20000);
    waitForTimelineConnectedOrContinue(browser, 'フロアメンバー');

    openAppMenu(browser);
    browser
      .waitForElementVisible('[data-testid="app-menu-profile"]', 10000)
      .waitForElementNotPresent('[data-testid="app-menu-floor-management"]', 10000)
      .waitForElementNotPresent('[data-testid="app-menu-room-management"]', 10000)
      .waitForElementNotPresent('[data-testid="app-menu-user-management"]', 10000);

    const base = getBaseUrl(browser).replace(/\/$/, '');
    browser.perform(() => {
      if (!state.floorId) {
        browser.assert.ok(false, 'フロアメンバーの権限テストに失敗しました。検証に必要なフロアIDがありません。');
        return;
      }
      navigateToApp(browser, `${base}/floor/${encodeURIComponent(state.floorId)}`).waitForElementVisible(
        '.room-list',
        10000
      );
    });

    assertElementPresent(browser, '.view-action', 'ルーム一覧の操作');
    assertElementPresent(browser, '[data-testid="room-list-create-button"]', 'ルームを作成');
    assertElementPresent(browser, '[data-testid="room-floor-member-list-button"]', 'フロアメンバー一覧');
    assertElementPresent(browser, '[data-testid="room-leave-floor-member-button"]', 'フロアメンバーから退出');
    assertElementPresent(browser, '.room-action', 'ルーム項目の操作');

    assertButtonTextPresent(browser, 'ルーム作成', 'ルームを作成');
    assertButtonTextAbsent(browser, 'フロアタグ', 'フロアタグ');
    assertButtonTextAbsent(browser, 'フロア単語', 'フロアの単語');
    browser.waitForElementNotPresent('[data-testid="room-invite-floor-member-button"]', 5000);

    browser.end();
  },
};
