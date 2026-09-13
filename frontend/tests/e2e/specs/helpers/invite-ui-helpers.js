const { findOptionalElement, getBaseUrl, navigateToApp, buildLoginUrl, loginToTimeline } = require('./login');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('./dialog-focus');

const getInviteUserCredentials = () => {
  const mail = process.env.E2E_USER_MAIL || '';
  const password = process.env.E2E_USER_PASSWORD || '';
  if (!mail || !password) return null;
  return { mail, password };
};

const getFloorEditorCredentials = () => {
  const mail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
  const password = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
  if (!mail || !password) return null;
  return { mail, password };
};

const buildFloorUrl = (browser, floorId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  return `${base}/floor/${encodeURIComponent(floorId)}`;
};

const buildRoomUrl = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  return `${base}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
};

const selectInvitePeriod = (browser, dialogSelector, value, label) => {
  browser.execute(
    function (payload) {
      const isAvailable = (node) =>
        !!(node && node.getClientRects().length && !node.disabled && node.getAttribute('aria-disabled') !== 'true');
      const dialogs = Array.from(document.querySelectorAll(payload.dialogSelector)).filter(isAvailable);
      if (dialogs.length !== 1) return { selected: false, reason: 'dialog-not-unique', value: '' };
      const selects = Array.from(dialogs[0].querySelectorAll('#invite_floor_member_period, #invite_room_member_period'))
        .filter(isAvailable);
      if (selects.length !== 1) return { selected: false, reason: 'period-select-not-unique', value: '' };
      const select = selects[0];
      const option = Array.from(select.options).find((candidate) => candidate.value === payload.value);
      if (!option) return { selected: false, reason: 'period-option-not-found', value: select.value };
      select.value = payload.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { selected: select.value === payload.value, reason: '', value: select.value };
    },
    [{ dialogSelector, value }],
    (result) => {
      const state = result && result.value ? result.value : { selected: false, reason: 'execute-failed', value: '' };
      browser.assert.ok(
        state.selected && state.value === value,
        `${label}の期間を選択しました: 期待値=${value}, 実際=${state.value || 'none'}, reason=${state.reason || 'none'}`
      );
    }
  );
};

const normalizeInviteUrl = (browser, url) => {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return '';
  const base = getBaseUrl(browser).replace(/\/$/, '');
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.origin !== base) {
        throw new Error('招待URLにはE2E用フロントエンドの専用オリジンを使用してください。');
      }
      return parsed.href;
    } catch (error) {
      if (error && error.message === '招待URLにはE2E用フロントエンドの専用オリジンを使用してください。') {
        throw error;
      }
      throw new Error('招待URLには有効なURLを指定してください。');
    }
  }
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/${raw}`;
};

const clickFirstVisible = clickSingleVisible;

const clickFloorAction = (browser, title, actionLabel) => {
  browser.execute(
    function (payload) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      const targetTitle = titles.find((node) => node.textContent && node.textContent.trim() === payload.title);
      if (!targetTitle) return { clicked: false, reason: 'title-not-found' };
      const card = targetTitle.closest('article.floor-card');
      if (!card) return { clicked: false, reason: 'card-not-found' };
      const actions = card.querySelector('footer.floor-card__actions');
      if (!actions) return { clicked: false, reason: 'actions-not-found' };
      const buttons = Array.from(actions.querySelectorAll('button'));
      const target = buttons.find((btn) => btn.textContent && btn.textContent.trim() === payload.action);
      if (!target) return { clicked: false, reason: 'button-not-found' };
      target.click();
      return { clicked: true };
    },
    [{ title, action: actionLabel }],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `フロアの操作をクリックできませんでした（${actionLabel}）: ${reason}`);
      }
    }
  );
};

const clickRoomAction = (browser, title, actionLabel) => {
  browser.execute(
    function (payload) {
      const titles = Array.from(document.querySelectorAll('h2.room-title'));
      const targetTitle = titles.find((node) => node.textContent && node.textContent.trim() === payload.title);
      if (!targetTitle) return { clicked: false, reason: 'title-not-found' };
      const item = targetTitle.closest('li');
      if (!item) return { clicked: false, reason: 'item-not-found' };
      const actions = item.querySelector('.room-action');
      if (!actions) return { clicked: false, reason: 'actions-not-found' };
      const buttons = Array.from(actions.querySelectorAll('button'));
      const target = buttons.find((btn) => btn.textContent && btn.textContent.trim() === payload.action);
      if (!target) return { clicked: false, reason: 'button-not-found' };
      target.click();
      return { clicked: true };
    },
    [{ title, action: actionLabel }],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `ルームの操作をクリックできませんでした（${actionLabel}）: ${reason}`);
      }
    }
  );
};

const captureInviteUrl = (browser, selector, label, onCapture, attempt = 0) => {
  const maxAttempts = 40;
  browser.execute(
    function (sel) {
      const node = document.querySelector(sel);
      if (!node) return { value: '' };
      return { value: (node.value || node.textContent || '').trim() };
    },
    [selector],
    (result) => {
      const value = result && result.value ? result.value.value : '';
      if (value) {
        onCapture(value);
        browser.assert.ok(true, `${label}の招待URLを取得しました。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${label}の招待URLが見つかりません。`);
        return;
      }
      browser.pause(500, () => captureInviteUrl(browser, selector, label, onCapture, attempt + 1));
    }
  );
};

const sanitizeInvitePath = (path) => {
  if (!path) return '';
  return String(path).replace(/\/invite\/[^/]+/g, '/invite/[token]');
};

const waitForInviteCompletion = (browser, expectedPath, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const errorNode = document.querySelector('.view-content .error-color');
      const messageNode = document.querySelector('.view-content p');
      return {
        path: window.location ? window.location.pathname || '' : '',
        errorText: errorNode ? errorNode.textContent.trim() : '',
        messageText: messageNode ? messageNode.textContent.trim() : '',
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { path: '', errorText: '', messageText: '' };
      if (state.errorText) {
        browser.assert.ok(false, `招待に失敗しました（${label}）: ${state.errorText}`);
        return;
      }

      const hasInvitePath = state.path.indexOf('/invite/') !== -1;
      const hasExpectedPath = expectedPath ? state.path.indexOf(expectedPath) !== -1 : true;
      const hasSuccessMessage = /参加しました|Joined .*membership|membership joined/i.test(state.messageText);

      if (hasInvitePath && hasExpectedPath && hasSuccessMessage) {
        browser.assert.ok(true, `招待に成功しました（${label}）。`);
        return;
      }

      if (attempt >= maxAttempts) {
        const safePath = sanitizeInvitePath(state.path);
        browser.assert.ok(
          false,
          `招待の成功を確認できませんでした（${label}）: path=${safePath} message=${state.messageText || ''}`
        );
        return;
      }
      browser.pause(500, () => waitForInviteCompletion(browser, expectedPath, label, attempt + 1));
    }
  );
};

const closeSoundCautionIfVisible = (browser) => {
  browser.execute(
    function () {
      const dialog = document.querySelector('[data-testid="dialog-sound-caution"]');
      return Boolean(dialog && dialog.getClientRects().length);
    },
    [],
    (result) => {
      if (result && result.value) {
        clickSingleVisibleAfterExactControls(browser, {
          anchorSelector: '#sound_caution_confirm_title',
          submitSelector: '[data-testid="dialog-sound-caution-confirm"]',
          expectedControls: [],
          label: '音声に関する注意を確認',
        });
        browser.waitForElementNotVisible('[data-testid="dialog-sound-caution"]', 10000);
      }
    }
  );
};

const setInviteUrl = (browser, type, url) => {
  if (!browser.globals.inviteUrls) browser.globals.inviteUrls = {};
  browser.globals.inviteUrls[type] = normalizeInviteUrl(browser, url);
};

const getInviteUrl = (browser, type) => {
  const store = browser.globals.inviteUrls || {};
  return store[type] || '';
};

const openAppMenu = (browser, attempt = 0) => {
  const maxAttempts = 40;
  browser.execute(
    function () {
      const app = document.querySelector('#app_container');
      const menu = document.querySelector('[data-testid="app-menu"]');
      const button = document.querySelector('[data-testid="app-menu-button"]');
      const menuVisible = !!(menu && (menu.offsetParent || menu.getClientRects().length));
      const appInert = !!(app && app.inert);

      if (!menuVisible && button && !appInert) button.click();

      return {
        appInert,
        buttonFound: !!button,
        expanded: button ? button.getAttribute('aria-expanded') : null,
        menuVisible,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.menuVisible) {
        browser.assert.ok(true, 'アプリメニューが開きました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `アプリメニューが開きませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(250, () => openAppMenu(browser, attempt + 1));
    }
  );
};

const logout = (browser, floorId, roomId) => {
  openAppMenu(browser);
  browser.waitForElementVisible('[data-testid="app-menu-logout"]', 10000);
  clickFirstVisible(browser, '[data-testid="app-menu-logout"]', 'ログアウト');
  browser.pause(500);
  if (floorId && roomId) {
    const loginUrl = buildLoginUrl(browser, floorId, roomId);
    navigateToApp(browser, loginUrl).waitForElementVisible('#mail', 10000);
    return;
  }
  openLogin(browser);
};

const waitForHiddenOrMissing = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (sel) {
      const node = document.querySelector(sel);
      if (!node) return { state: 'missing' };
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      const visible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width + rect.height > 0;
      return { state: visible ? 'visible' : 'hidden' };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value.state : 'missing';
      if (state !== 'visible') {
        browser.assert.ok(true, `${label}が閉じました。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${label}が閉じていません。`);
        return;
      }
      browser.pause(500, () => waitForHiddenOrMissing(browser, selector, label, attempt + 1));
    }
  );
};

const ensureRoomIsMemberOnly = (browser, floorId, roomId) => {
  const floorUrl = buildFloorUrl(browser, floorId);
  const roomUrl = buildRoomUrl(browser, floorId, roomId);
  const editButton = `.edit-room-button-${roomId}`;
  navigateToApp(browser, floorUrl)
    .waitForElementVisible(editButton, 10000)
    .click(editButton)
    .waitForElementVisible('#member_only', 10000);

  browser.execute(
    function () {
      const checkbox = document.getElementById('member_only');
      return { checked: checkbox ? checkbox.checked : null };
    },
    [],
    (result) => {
      const checked = result && result.value ? result.value.checked : null;
      if (checked === false) {
        browser.click('#member_only');
      }
    }
  );

  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_room_dialog_title',
    submitSelector: '[data-testid="base-edit-dialog-confirm"]',
    expectedControls: [{ selector: '#member_only', property: 'checked', value: true }],
    label: 'ルームの編集を確定',
  });
  waitForHiddenOrMissing(browser, '#member_only', 'ルームの編集ダイアログ');
  navigateToApp(browser, roomUrl).waitForElementVisible('.timeline-page', 10000);
  closeSoundCautionIfVisible(browser);
};

const openLogin = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/login`).waitForElementVisible('#mail', 10000);
};

const LOGIN_BUTTON_SELECTOR = '[data-testid="login-submit"]';

const setInputValueByScript = (browser, selector, value, label) => {
  browser.execute(
    function (payload) {
      const input = document.querySelector(payload.selector);
      if (!input) return { ok: false, reason: 'input-not-found' };
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.value = payload.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.blur();
      return { ok: true };
    },
    [{ selector, value }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'execute-failed' };
      if (state.ok) return;
      browser.assert.ok(
        false,
        `入力値を設定できませんでした${label ? ` (${label})` : ''}: selector=${selector} reason=${
          state.reason || 'unknown'
        }`
      );
    }
  );
};

const getAuthState = (browser, callback) => {
  browser.execute(
    function () {
      let user = null;
      try {
        const raw = localStorage.getItem('iseeetl_store');
        const persistedStore = raw ? JSON.parse(raw) : null;
        user = persistedStore && persistedStore.user ? persistedStore.user : null;
      } catch (_) {
        user = null;
      }
      const getText = (selector) => {
        const node = document.querySelector(selector);
        return node ? node.textContent.trim() : '';
      };

      return {
        href: window.location ? window.location.href || '' : '',
        path: window.location ? `${window.location.pathname || ''}${window.location.search || ''}` : '',
        hasLoginForm: !!document.querySelector('#mail'),
        hasLoginMenu: !!document.querySelector('[data-testid="app-menu-login"]'),
        hasProfileMenu: !!document.querySelector('[data-testid="app-menu-profile"]'),
        role: user ? user.role : null,
        isLogin: user ? !!user.isLogin : null,
        snackbar: getText('[data-testid="app-snackbar"] span') || getText('.screen-reader-only[role="alert"]'),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      callback(state);
    }
  );
};

const waitForLoginCompleted = (browser, label, attempt = 0) => {
  const maxAttempts = 20;
  getAuthState(browser, (state) => {
    const hasAuthenticatedState =
      state.isLogin === true || state.hasProfileMenu || (!state.hasLoginMenu && !!state.role);
    const loggedIn = !state.hasLoginForm && hasAuthenticatedState;
    if (loggedIn) {
      browser.assert.ok(
        true,
        `ログインしました${label ? ` (${label})` : ''}: role=${state.role || 'unknown'} path=${state.path || ''}`
      );
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(
        false,
        `ログインが完了しませんでした${label ? ` (${label})` : ''}: path=${state.path || ''} href=${state.href || ''} role=${
          state.role || 'unknown'
        } isLogin=${state.isLogin === true ? 'yes' : state.isLogin === false ? 'no' : 'unknown'} loginForm=${
          state.hasLoginForm ? 'yes' : 'no'
        } loginMenu=${state.hasLoginMenu ? 'yes' : 'no'} profileMenu=${state.hasProfileMenu ? 'yes' : 'no'} snackbar=${
          state.snackbar || ''
        }`
      );
      return;
    }
    browser.pause(500, () => waitForLoginCompleted(browser, label, attempt + 1));
  });
};

const loginByForm = (browser, { mail, password }) => {
  openLogin(browser);
  browser.waitForElementVisible('#mail', 10000).waitForElementVisible('#password', 10000);
  setInputValueByScript(browser, '#mail', mail, 'mail');
  setInputValueByScript(browser, '#password', password, 'password');
  browser.waitForElementVisible(LOGIN_BUTTON_SELECTOR, 10000).click(LOGIN_BUTTON_SELECTOR);
  waitForLoginCompleted(browser, 'loginByForm');
};

const loginIfPresent = (browser, { mail, password }) => {
  findOptionalElement(browser, '#mail', (result) => {
    if (result.status !== 0) {
      return;
    }
    browser.waitForElementVisible('#mail', 10000).waitForElementVisible('#password', 10000);
    setInputValueByScript(browser, '#mail', mail, 'mail');
    setInputValueByScript(browser, '#password', password, 'password');
    browser.waitForElementVisible(LOGIN_BUTTON_SELECTOR, 10000).click(LOGIN_BUTTON_SELECTOR);
    waitForLoginCompleted(browser, 'loginIfPresent');
  });
};

const openFloorList = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, base).waitForElementVisible('#search_floor_input', 10000);
};

const openRoomList = (browser, floorId, options = {}) => {
  const requireCreateButton = options.requireCreateButton !== false;
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/floor/${encodeURIComponent(floorId)}`).waitForElementVisible('.view', 10000);
  if (requireCreateButton) {
    browser.waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
    return;
  }
  findOptionalElement(browser, '[data-testid="room-list-create-button"]', (result) => {
    if (result.status === 0) {
      browser.waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
    }
  });
};

const waitForUserRole = (browser, expectedRole, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function () {
      try {
        const raw = localStorage.getItem('iseeetl_store');
        if (!raw) return { ok: false, role: null };
        const data = JSON.parse(raw);
        return { ok: true, role: data && data.user ? data.user.role : null };
      } catch (_) {
        return { ok: false, role: null };
      }
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, role: null };
      if (state.ok && state.role === expectedRole) {
        browser.assert.ok(true, `ユーザの権限を確認しました: ${expectedRole}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ユーザの権限が一致しません: 期待値=${expectedRole} 実際=${state.role || 'unknown'}`);
        return;
      }
      browser.pause(500, () => waitForUserRole(browser, expectedRole, attempt + 1));
    }
  );
};

const waitForDialogClosed = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (sel) {
      const node = document.querySelector(sel);
      const visible = !!(node && (node.offsetParent || node.getClientRects().length));
      return { visible };
    },
    [selector],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (!visible) {
        browser.assert.ok(true, `ダイアログが閉じました${label ? ` (${label})` : ''}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ダイアログが閉じていません${label ? ` (${label})` : ''}。`);
        return;
      }
      browser.pause(500, () => waitForDialogClosed(browser, selector, label, attempt + 1));
    }
  );
};

const waitForFloorTitle = (browser, title, shouldExist, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      return titles.some((node) => node.textContent && node.textContent.trim() === targetTitle);
    },
    [title],
    (result) => {
      const found = result && typeof result.value === 'boolean' ? result.value : false;
      if (found === shouldExist) {
        browser.assert.ok(true, `フロア名の確認結果=${shouldExist ? '存在' : '削除済み'}: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `フロア名の確認結果=${shouldExist ? '未検出' : '残存'}: ${title}`);
        return;
      }
      browser.pause(500, () => waitForFloorTitle(browser, title, shouldExist, attempt + 1));
    }
  );
};

const waitForRoomTitle = (browser, title, shouldExist, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.room-title'));
      return titles.some((node) => node.textContent && node.textContent.trim() === targetTitle);
    },
    [title],
    (result) => {
      const found = result && typeof result.value === 'boolean' ? result.value : false;
      if (found === shouldExist) {
        browser.assert.ok(true, `ルーム名の確認結果=${shouldExist ? '存在' : '削除済み'}: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ルーム名の確認結果=${shouldExist ? '未検出' : '残存'}: ${title}`);
        return;
      }
      browser.pause(500, () => waitForRoomTitle(browser, title, shouldExist, attempt + 1));
    }
  );
};

const findFloorIdByTitle = (browser, title, onFound) => {
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      const targetTitleNode = titles.find((node) => node.textContent && node.textContent.trim() === targetTitle);
      if (!targetTitleNode) return { ok: false, reason: 'title-not-found' };
      const link = targetTitleNode.closest('a');
      const href = link ? link.getAttribute('href') : null;
      return { ok: !!href, href };
    },
    [title],
    (result) => {
      const value = result && result.value ? result.value : {};
      const href = value.href || '';
      const match = href.match(/\/floor\/([^/?#]+)/);
      const floorId = match ? match[1] : '';
      if (!floorId) {
        const reason = value.reason || 'floor-id-not-found';
        browser.assert.ok(false, `フロアIDを取得できませんでした: ${reason}`);
      }
      if (typeof onFound === 'function') onFound(floorId);
    }
  );
};

const findRoomIdByTitle = (browser, title, onFound) => {
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.room-title'));
      const targetTitleNode = titles.find((node) => node.textContent && node.textContent.trim() === targetTitle);
      if (!targetTitleNode) return { ok: false, reason: 'title-not-found' };
      const link = targetTitleNode.closest('a');
      const href = link ? link.getAttribute('href') : null;
      return { ok: !!href, href };
    },
    [title],
    (result) => {
      const value = result && result.value ? result.value : {};
      const href = value.href || '';
      const match = href.match(/\/room\/([^/?#]+)/);
      const roomId = match ? match[1] : '';
      if (!roomId) {
        const reason = value.reason || 'room-id-not-found';
        browser.assert.ok(false, `ルームIDを取得できませんでした: ${reason}`);
      }
      if (typeof onFound === 'function') onFound(roomId);
    }
  );
};

const createFloor = (browser, title) => {
  clickFirstVisible(browser, '[data-testid="floor-list-create-button"]', '作成ダイアログを開く');
  browser.waitForElementVisible('#edit_floor_title', 10000);
  browser.clearValue('#edit_floor_title').setValue('#edit_floor_title', title);
  browser.clearValue('#edit_floor_description').setValue('#edit_floor_description', 'E2E invite floor.');
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_floor_dialog_title',
    submitSelector: '[data-testid="base-edit-dialog-confirm"]',
    expectedControls: [
      { selector: '#edit_floor_title', value: title },
      { selector: '#edit_floor_description', value: 'E2E invite floor.' },
    ],
    label: 'フロアの作成を確定',
  });
  waitForDialogClosed(browser, '#edit_floor_title', 'フロアを作成');
};

const createRoom = (browser, title, options = {}) => {
  const guestReactionOnly = options.guestReactionOnly === true;
  const memberOnly = options.memberOnly === true;
  const hidden = options.hidden === true;
  clickFirstVisible(browser, '[data-testid="room-list-create-button"]', '作成ダイアログを開く');
  browser.waitForElementVisible('#room_title', 10000);
  browser.clearValue('#room_title').setValue('#room_title', title);
  browser.clearValue('#room_description').setValue('#room_description', 'E2E invite room.');
  if (guestReactionOnly) {
    browser.click('label[for="guest_reaction_only"]');
  }
  if (memberOnly) {
    browser.click('label[for="member_only"]');
  }
  if (hidden) {
    browser.click('label[for="hidden_flg"]');
  }
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_room_dialog_title',
    submitSelector: '[data-testid="base-edit-dialog-confirm"]',
    expectedControls: [
      { selector: '#room_title', value: title },
      { selector: '#room_description', value: 'E2E invite room.' },
      { selector: '#guest_reaction_only', property: 'checked', value: guestReactionOnly },
      { selector: '#member_only', property: 'checked', value: memberOnly },
      { selector: '#hidden_flg', property: 'checked', value: hidden },
    ],
    label: 'ルームの作成を確定',
  });
  waitForDialogClosed(browser, '#room_title', 'ルームを作成');
};

const createInviteUrl = (browser, kind, period = '8h') => {
  if (kind !== 'floor' && kind !== 'room') {
    throw new Error(`未対応の招待種別です: ${kind || 'missing'}`);
  }
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: `#invite_${kind}_member_dialog_title`,
    submitSelector: `[data-testid="dialog-invite-${kind}-member-create-button"]`,
    expectedControls: [{ selector: `#invite_${kind}_member_period`, value: period }],
    label: `${kind}の招待URLを作成`,
  });
};

module.exports = {
  loginToTimeline,
  loginByForm,
  loginIfPresent,
  getInviteUserCredentials,
  getFloorEditorCredentials,
  buildFloorUrl,
  buildRoomUrl,
  selectInvitePeriod,
  captureInviteUrl,
  waitForInviteCompletion,
  closeSoundCautionIfVisible,
  setInviteUrl,
  getInviteUrl,
  clickFirstVisible,
  clickFloorAction,
  clickRoomAction,
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
  createInviteUrl,
  waitForDialogClosed,
  normalizeInviteUrl,
};
