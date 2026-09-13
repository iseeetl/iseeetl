const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const { clickSingleVisible } = require('../../helpers/dialog-focus');

const CATEGORY_TAG_DIALOG_SELECTOR =
  '[role="dialog"][aria-labelledby="category-tag-management-dialog-title"]';
const CATEGORY_TAG_SUBMIT_SELECTOR =
  `${CATEGORY_TAG_DIALOG_SELECTOR} [data-testid="management-categorytag-submit"]:not([disabled])`;
const LIFECYCLE_DIALOG_SELECTOR = '[data-testid="management-lifecycle-dialog"]';
const LIFECYCLE_CONFIRM_SELECTOR =
  '[role="dialog"] [data-testid="management-lifecycle-confirm"]:not([disabled])';

const openCategoryTagManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/categorytag`;
  navigateToApp(browser, url).waitForElementVisible(
    '[data-testid="management-categorytag-create"]',
    10000
  );
};

const clickCreateButton = (browser) => {
  browser.execute(
    function () {
      const button = document.querySelector('[data-testid="management-categorytag-create"]');
      if (!button) return { clicked: false, reason: 'button-not-found' };
      button.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `作成ボタンをクリックできませんでした: ${reason}`);
      }
    }
  );
};

const waitForDialogVisible = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (selector) {
      const isVisible = (el) => !!(el && (el.offsetParent || el.getClientRects().length));
      const dialog = document.querySelector(selector);
      return { visible: isVisible(dialog) };
    },
    [CATEGORY_TAG_DIALOG_SELECTOR],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (visible) {
        browser.assert.ok(true, '共通タグのダイアログが表示されています。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '共通タグのダイアログが表示されていません。');
        return;
      }
      browser.pause(500, () => waitForDialogVisible(browser, attempt + 1));
    }
  );
};

const waitForDialogClosed = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (selector) {
      const isVisible = (el) => !!(el && (el.offsetParent || el.getClientRects().length));
      const dialog = document.querySelector(selector);
      return { visible: isVisible(dialog) };
    },
    [CATEGORY_TAG_DIALOG_SELECTOR],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (!visible) {
        browser.assert.ok(true, '共通タグのダイアログが閉じました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '共通タグのダイアログが閉じていません。');
        return;
      }
      browser.pause(500, () => waitForDialogClosed(browser, attempt + 1));
    }
  );
};

const waitForFetchIdle = (browser, attempt = 0, done) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const view = document.querySelector('.view');
      return { fetching: view ? view.getAttribute('aria-busy') === 'true' : null };
    },
    [],
    (result) => {
      const fetching = result && result.value ? result.value.fetching : null;
      if (fetching === false || fetching === null) {
        if (done) done();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '取得処理が続いています。');
        return;
      }
      browser.pause(300, () => waitForFetchIdle(browser, attempt + 1, done));
    }
  );
};

const setDialogValues = (browser, { order, name }) => {
  browser.execute(
    function (payload) {
      const dialog = document.querySelector(payload.dialogSelector);
      if (!dialog) return { ok: false, reason: 'dialog-not-found' };

      const numberInput = dialog.querySelector('input[type="number"]');
      const textInput = dialog.querySelector('input[type="text"], input:not([type])');
      if (!numberInput || !textInput) return { ok: false, reason: 'input-not-found' };

      numberInput.value = String(payload.order);
      numberInput.dispatchEvent(new Event('input', { bubbles: true }));
      textInput.value = payload.name;
      textInput.dispatchEvent(new Event('input', { bubbles: true }));

      return { ok: true };
    },
    [
      {
        dialogSelector: CATEGORY_TAG_DIALOG_SELECTOR,
        order,
        name,
      },
    ],
    (result) => {
      const ok = result && result.value ? result.value.ok : false;
      if (!ok) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `ダイアログの値を設定できませんでした: ${reason}`);
      }
    }
  );
};

const clickDialogSubmit = (browser) => {
  clickSingleVisible(browser, CATEGORY_TAG_SUBMIT_SELECTOR, '共通タグ管理の入力を送信');
};

const openFirstRow = (browser, onReady) => {
  browser.execute(
    function () {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const dataRow = rows.find((row) => row.querySelector('td'));
      if (!dataRow) return { clicked: false, reason: 'row-not-found' };
      const button = dataRow.querySelector('[data-testid="management-categorytag-edit"]');
      if (!button) return { clicked: false, reason: 'action-not-found' };
      button.click();
      return { clicked: true, reason: '' };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'unknown' };
      if (!state.clicked) {
        browser.assert.ok(false, `共通タグの編集操作が見つかりません: ${state.reason}`);
        return;
      }
      onReady();
    }
  );
};

const openLifecycleByName = (browser, name, onReady, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (targetName) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const row = rows.find((candidate) => {
        const cells = candidate.querySelectorAll('td');
        return cells.length > 1 && cells[1].textContent.trim() === targetName;
      });
      if (!row) return { clicked: false, reason: 'row-not-found' };
      const button = row.querySelector('[data-testid="management-categorytag-lifecycle"]');
      if (!button) return { clicked: false, reason: 'action-not-found' };
      button.click();
      return { clicked: true, reason: '' };
    },
    [name],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'unknown' };
      if (state.clicked) {
        browser.waitForElementVisible(LIFECYCLE_DIALOG_SELECTOR, 10000);
        if (onReady) onReady(true);
        return;
      }
      if (state.reason === 'action-not-found' || attempt >= maxAttempts) {
        browser.assert.ok(false, `共通タグの削除操作が見つかりません: ${state.reason}`);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => openLifecycleByName(browser, name, onReady, attempt + 1));
    }
  );
};

const clickLifecycleConfirm = (browser) => {
  clickSingleVisible(browser, LIFECYCLE_CONFIRM_SELECTOR, '共通タグの削除を確定');
};

const applySearch = (browser, term) => {
  browser.execute(
    function (keyword) {
      const input = document.querySelector('#management-search-input');
      const button = document.querySelector('[data-testid="management-search-submit"]');
      if (!input || !button) return { ok: false, reason: 'input-or-button-not-found' };
      input.value = keyword;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      button.click();
      return { ok: true };
    },
    [term],
    (result) => {
      const ok = result && result.value ? result.value.ok : false;
      if (!ok) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `検索条件を入力できませんでした: ${reason}`);
      }
    }
  );
};

const applySearchWhenIdle = (browser, term, done) => {
  waitForFetchIdle(browser, 0, () => {
    applySearch(browser, term);
    waitForFetchIdle(browser, 0, done);
  });
};

const waitForSearchMatch = (browser, term, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (keyword) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        const cell = cells.length > 1 ? cells[1] : null;
        const text = cell ? cell.textContent.trim() : '';
        if (text && text.indexOf(keyword) !== -1) {
          return { match: true, text };
        }
      }
      return { match: false, text: '' };
    },
    [term],
    (result) => {
      const state = result && result.value ? result.value : { match: false, text: '' };
      if (state.match) {
        browser.assert.ok(true, `検索結果が一致しました: ${state.text}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `検索結果が一致しません: ${state.text}`);
        return;
      }
      browser.pause(500, () => waitForSearchMatch(browser, term, attempt + 1));
    }
  );
};

const waitForRemoval = (browser, term, attempt = 0, onReady) => {
  const maxAttempts = 10;
  browser.execute(
    function (keyword) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        const cell = cells.length > 1 ? cells[1] : null;
        const text = cell ? cell.textContent.trim() : '';
        const match = text.indexOf(keyword) !== -1;
        if (match) {
          return { found: true, text };
        }
      }
      return { found: false, text: '' };
    },
    [term],
    (result) => {
      const state = result && result.value ? result.value : { found: false, text: '' };
      if (!state.found) {
        browser.assert.ok(true, `削除後の一覧に対象タグがありません: ${term}`);
        if (onReady) onReady(true);
        return;
      }
      if (attempt >= maxAttempts) {
        const message = state.found ? `対象タグが一覧に残っています: ${state.text}` : '検索結果が一致しません';
        browser.assert.ok(false, message);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => waitForRemoval(browser, term, attempt + 1, onReady));
    }
  );
};

module.exports = {
  '共通タグ管理で作成・編集・削除ができる': (browser) => {
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const timestamp = Date.now();
    const createdName = `e2e-category-${timestamp}`;
    const updatedName = `${createdName}-u`;

    loginByForm(browser, { mail: adminMail, password: adminPassword });
    openCategoryTagManagement(browser);

    clickCreateButton(browser);
    waitForDialogVisible(browser);
    setDialogValues(browser, { order: 10, name: createdName });
    clickDialogSubmit(browser);
    waitForDialogClosed(browser);

    applySearchWhenIdle(browser, createdName);
    waitForSearchMatch(browser, createdName);

    openFirstRow(browser, () => {
      waitForDialogVisible(browser);
      setDialogValues(browser, { order: 11, name: updatedName });
      clickDialogSubmit(browser);
      waitForDialogClosed(browser);

      applySearchWhenIdle(browser, updatedName);
      waitForSearchMatch(browser, updatedName);
      openLifecycleByName(browser, updatedName, (opened) => {
        if (!opened) return browser.end();
        clickLifecycleConfirm(browser);
        browser.waitForElementNotPresent(LIFECYCLE_DIALOG_SELECTOR, 10000);
        waitForRemoval(browser, updatedName, 0, () => browser.end());
      });
    });
  },
};
