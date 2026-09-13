const { getBaseUrl, navigateToApp, requireEnv } = require('./login');
const { loginByForm } = require('./session-helpers');
const { prepareFloorRoom } = require('./timeline-helpers');
const {
  captureInviteUrl,
  createInviteUrl,
  waitForInviteCompletion,
  closeSoundCautionIfVisible,
  clickFirstVisible,
  logout,
} = require('./invite-ui-helpers');
const { clickSingleVisible } = require('./dialog-focus');

const readLoggedInUsername = (browser, onReady, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      try {
        const persisted = JSON.parse(window.localStorage.getItem('iseeetl_store') || '{}');
        return persisted.user && persisted.user.name ? String(persisted.user.name) : '';
      } catch (_) {
        return '';
      }
    },
    [],
    (result) => {
      const username = result && result.value ? String(result.value) : '';
      if (username) {
        onReady(username);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'メンバー管理の基本動作テストで対象ユーザ名を取得できませんでした。');
        return;
      }
      browser.pause(500, () => readLoggedInUsername(browser, onReady, attempt + 1));
    }
  );
};

const openExactMemberRow = (browser, target, onReady, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function (expected) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const matches = rows.filter((row) => {
        const values = Array.from(row.querySelectorAll('td')).map((cell) => (cell.textContent || '').trim());
        return values.includes(expected.containerTitle) && values.includes(expected.username);
      });
      const button =
        matches.length === 1
          ? matches[0].querySelector('button.management-row-action-button')
          : null;
      if (button) button.click();
      return { count: matches.length, clicked: Boolean(button) };
    },
    [target],
    (result) => {
      const state = result && result.value ? result.value : {};
      const count = Number(state.count || 0);
      if (count === 1 && state.clicked) {
        browser.assert.equal(
          count,
          1,
          '対象メンバーの行が1件だけあります。'
        );
        onReady();
        return;
      }
      if (count > 1 || (count === 1 && !state.clicked) || attempt >= maxAttempts) {
        browser.assert.equal(
          JSON.stringify({ count, clicked: Boolean(state.clicked) }),
          JSON.stringify({ count: 1, clicked: true }),
          '操作可能な対象メンバーの行が1件だけあります。'
        );
        return;
      }
      browser.pause(500, () => openExactMemberRow(browser, target, onReady, attempt + 1));
    }
  );
};

const assertDialogContext = (browser, dialogSelector, target) => {
  browser.execute(
    function (payload) {
      const dialogs = Array.from(document.querySelectorAll(payload.selector)).filter(
        (node) => node.offsetParent || node.getClientRects().length
      );
      const text = dialogs.length === 1 ? (dialogs[0].textContent || '').trim() : '';
      return {
        count: dialogs.length,
        hasContainer: text.includes(payload.containerTitle),
        hasUsername: text.includes(payload.username),
      };
    },
    [{ selector: dialogSelector, ...target }],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(
        state.count === 1 && state.hasContainer && state.hasUsername,
        `メンバー削除ダイアログが対象を正しく特定しています: ${JSON.stringify(state)}`
      );
    }
  );
};

const invitePreparedMembership = (browser, state, author, container) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const floorUrl = `${base}/floor/${encodeURIComponent(state.floorId)}`;
  const isFloor = container === 'floor';
  const expectedPath = isFloor
    ? `/floor/${state.floorId}`
    : `/floor/${state.floorId}/room/${state.roomId}`;
  const trigger = isFloor
    ? '[data-testid="room-invite-floor-member-button"]'
    : `[data-testid="room-invite-member-button-${state.roomId}"]`;
  const dialog = isFloor
    ? '[data-testid="dialog-invite-floor-member"]'
    : '[data-testid="dialog-invite-room-member"]';
  const urlSelector = isFloor
    ? '[data-testid="dialog-invite-floor-member-url"]'
    : '[data-testid="dialog-invite-room-member-url"]';
  const closeButton = isFloor
    ? '[data-testid="dialog-invite-floor-member-close-desktop"], [data-testid="dialog-invite-floor-member-close-mobile"]'
    : '[data-testid="dialog-invite-room-member-close-desktop"], [data-testid="dialog-invite-room-member-close-mobile"]';
  const label = `${container}のメンバー管理の基本動作`;
  let inviteUrl = '';

  navigateToApp(browser, floorUrl)
    .waitForElementVisible(trigger, 10000)
    .perform((done) => {
      clickFirstVisible(browser, trigger, `${container}の招待を開く`);
      done();
    })
    .waitForElementVisible(dialog, 10000);
  createInviteUrl(browser, container, '8h');
  captureInviteUrl(browser, urlSelector, container, (value) => {
    inviteUrl = value;
  });
  clickFirstVisible(browser, closeButton, `${container}の招待を閉じる`);
  browser.waitForElementNotVisible(dialog, 10000);

  logout(browser);
  loginByForm(browser, author);
  closeSoundCautionIfVisible(browser);
  browser.perform((done) => {
    if (!inviteUrl) {
      browser.assert.ok(false, `${container}のメンバー招待URLが必要です。`);
      done();
      return;
    }
    navigateToApp(browser, inviteUrl);
    done();
  });
  browser.perform(() => {
    if (inviteUrl) waitForInviteCompletion(browser, expectedPath, label);
  });
  logout(browser);
};

const runMembershipManagementSmoke = (browser, config) => {
  const inviteUser = {
    mail: requireEnv('E2E_USER_MAIL'),
    password: requireEnv('E2E_USER_PASSWORD'),
  };
  const floorEditor = {
    mail: requireEnv('E2E_FLOOR_EDITOR_MAIL'),
    password: requireEnv('E2E_FLOOR_EDITOR_PASSWORD'),
  };

  const admin = {
    mail: requireEnv('E2E_ADMIN_MAIL'),
    password: requireEnv('E2E_ADMIN_PASSWORD'),
  };
  const stamp = String(Date.now()).slice(-6);
  const state = prepareFloorRoom(browser, {
    editorMail: floorEditor.mail,
    editorPassword: floorEditor.password,
    floorTitle: `E2E ${config.fixtureLabel} Floor ${stamp}`,
    roomTitle: `E2E ${config.fixtureLabel} Room ${stamp}`,
    roomOptions: { memberOnly: config.container === 'room' },
    logoutAfter: false,
  });

  browser.perform(() => {
    if (!state.floorId || !state.roomId) {
      browser.assert.ok(false, 'メンバー管理のテスト準備でフロアIDまたはルームIDを取得できませんでした。');
      browser.end();
      return;
    }

    invitePreparedMembership(browser, state, inviteUser, config.container);
    loginByForm(browser, inviteUser);
    closeSoundCautionIfVisible(browser);
    readLoggedInUsername(browser, (username) => {
      const target = {
        containerTitle: config.container === 'floor' ? state.floorTitle : state.roomTitle,
        username,
      };
      logout(browser);
      loginByForm(browser, admin);

      const managementUrl = `${getBaseUrl(browser).replace(/\/$/, '')}${config.managementPath}`;
      navigateToApp(browser, managementUrl).waitForElementVisible('table.management-table', 10000);
      openExactMemberRow(browser, target, () => {
        browser.waitForElementVisible(config.dialogSelector, 10000);
        assertDialogContext(browser, config.dialogSelector, target);
        clickSingleVisible(
          browser,
          `${config.dialogSelector} .management-dialog-cancel-button`,
          'メンバー削除をキャンセル'
        );
        browser.waitForElementNotVisible(config.dialogSelector, 10000);
        browser.end();
      });
    });
  });
};

module.exports = {
  runMembershipManagementSmoke,
};
