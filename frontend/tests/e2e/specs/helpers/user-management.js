const { getBaseUrl, navigateToApp } = require('./login');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('./dialog-focus');

const USER_EDIT_DIALOG_SELECTOR = '[role="dialog"][aria-labelledby="user-management-edit-dialog-title"]';
const USER_LIFECYCLE_DIALOG_SELECTOR = '[data-testid="management-lifecycle-dialog"]';
const USER_LIFECYCLE_CONFIRM_SELECTOR =
  '[role="dialog"] [data-testid="management-lifecycle-confirm"]:not([disabled])';

const openUserManagement = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/management/user`).waitForElementVisible('table.management-table', 10000);
};

const applySearch = (browser, term) => {
  browser.execute(
    function (keyword) {
      const input = document.querySelector('#management-search-input');
      const button = document.querySelector('[data-testid="management-search-submit"]');
      if (!input || !button) return { ok: false, reason: 'search-control-not-found' };
      input.value = keyword;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      window.setTimeout(function () {
        button.click();
      }, 0);
      return { ok: true };
    },
    [term],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'unknown' };
      if (!state.ok) browser.assert.ok(false, `ユーザ検索に失敗しました: ${state.reason || 'unknown'}`);
    }
  );
};

const waitForSearchQuery = (browser, term, onReady, onFail, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function () {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('q');
    },
    [],
    (result) => {
      const current = result && typeof result.value === 'string' ? result.value : '';
      if (current === term) {
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ユーザの検索条件が更新されていません。');
        if (onFail) onFail();
        return;
      }
      browser.pause(400, () => waitForSearchQuery(browser, term, onReady, onFail, attempt + 1));
    }
  );
};

const openUserRowByMail = (browser, mail, onReady, onFail, attempt = 0) => {
  const maxAttempts = 15;
  browser.execute(
    function (targetMail) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const row = rows.find((candidate) =>
        Array.from(candidate.querySelectorAll('td')).some(
          (cell) => cell.textContent && cell.textContent.trim() === targetMail
        )
      );
      if (!row) return { clicked: false, reason: 'row-not-found' };
      const button = row.querySelector('[data-testid="management-user-edit"]');
      if (!button) return { clicked: false, reason: 'action-not-found' };
      button.click();
      return { clicked: true, reason: '' };
    },
    [mail],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'unknown' };
      if (state.clicked) {
        browser.waitForElementVisible(USER_EDIT_DIALOG_SELECTOR, 10000);
        if (onReady) onReady();
        return;
      }
      if (state.reason === 'action-not-found' || attempt >= maxAttempts) {
        browser.assert.ok(false, `対象ユーザの編集操作が見つかりません: ${state.reason}`);
        if (onFail) onFail();
        return;
      }
      browser.pause(400, () => openUserRowByMail(browser, mail, onReady, onFail, attempt + 1));
    }
  );
};

const openUserLifecycleByMail = (browser, mail, onReady, onFail, attempt = 0) => {
  const maxAttempts = 15;
  browser.execute(
    function (targetMail) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const row = rows.find((candidate) =>
        Array.from(candidate.querySelectorAll('td')).some(
          (cell) => cell.textContent && cell.textContent.trim() === targetMail
        )
      );
      if (!row) return { clicked: false, reason: 'row-not-found' };
      const button = row.querySelector('[data-testid="management-user-lifecycle"]');
      if (!button) return { clicked: false, reason: 'action-not-found' };
      button.click();
      return { clicked: true, reason: '' };
    },
    [mail],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'unknown' };
      if (state.clicked) {
        browser.waitForElementVisible(USER_LIFECYCLE_DIALOG_SELECTOR, 10000);
        if (onReady) onReady();
        return;
      }
      if (state.reason === 'action-not-found' || attempt >= maxAttempts) {
        browser.assert.ok(false, `対象ユーザの削除・復元操作が見つかりません: ${state.reason}`);
        if (onFail) onFail();
        return;
      }
      browser.pause(400, () =>
        openUserLifecycleByMail(browser, mail, onReady, onFail, attempt + 1)
      );
    }
  );
};

const clickUserLifecycleConfirm = (browser) => {
  clickSingleVisible(browser, USER_LIFECYCLE_CONFIRM_SELECTOR, 'ユーザ管理の削除・復元を確定');
};

const waitForUserLifecycleDialogClosed = (browser, onReady, onFail, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (selector) {
      const dialog = document.querySelector(selector);
      return !!(dialog && (dialog.offsetParent || dialog.getClientRects().length));
    },
    [USER_LIFECYCLE_DIALOG_SELECTOR],
    (result) => {
      const visible = !!(result && result.value);
      if (!visible) {
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ユーザの削除・復元ダイアログが閉じませんでした。');
        if (onFail) onFail();
        return;
      }
      browser.pause(400, () =>
        waitForUserLifecycleDialogClosed(browser, onReady, onFail, attempt + 1)
      );
    }
  );
};

const setDialogPassword = (browser, password) => {
  browser.waitForElementVisible('#password', 10000).clearValue('#password').setValue('#password', password);
};

const clickDialogSubmit = (browser, expected, onClicked, onFail) => {
  if (!expected || typeof expected.mail !== 'string' || expected.mail.length === 0) {
    browser.assert.ok(false, 'ユーザの更新を送信するには、対象のメールアドレスを正確に指定してください。');
    if (onFail) onFail();
    return;
  }

  const expectedControls = [{ selector: '#user-management-mail', value: expected.mail }];
  if (Object.prototype.hasOwnProperty.call(expected, 'username')) {
    expectedControls.push({ selector: '#user-management-username', value: expected.username });
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'password')) {
    expectedControls.push({ selector: '#password', value: expected.password });
  }
  if (Object.prototype.hasOwnProperty.call(expected, 'role')) {
    expectedControls.push({ selector: '#role', value: expected.role });
  }

  clickSingleVisibleAfterExactControls(
    browser,
    {
      anchorSelector: '#user-management-edit-dialog-title',
      submitSelector: '[data-testid="management-user-submit"]',
      expectedControls,
      label: 'ユーザ管理で対象ユーザの入力を送信',
    },
    (state) => {
      if (!state || state.clicked !== true) {
        if (onFail) onFail();
        return;
      }
      if (onClicked) onClicked();
    }
  );
};

const waitForDialogClosed = (browser, onReady, onFail, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const dialog = document.querySelector('[role="dialog"][aria-labelledby="user-management-edit-dialog-title"]');
      return !!(dialog && (dialog.offsetParent || dialog.getClientRects().length));
    },
    [],
    (result) => {
      const visible = !!(result && result.value);
      if (!visible) {
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ユーザの編集ダイアログが閉じませんでした。');
        if (onFail) onFail();
        return;
      }
      browser.pause(400, () => waitForDialogClosed(browser, onReady, onFail, attempt + 1));
    }
  );
};

module.exports = {
  openUserManagement,
  applySearch,
  waitForSearchQuery,
  openUserRowByMail,
  openUserLifecycleByMail,
  clickUserLifecycleConfirm,
  waitForUserLifecycleDialogClosed,
  setDialogPassword,
  clickDialogSubmit,
  waitForDialogClosed,
};
