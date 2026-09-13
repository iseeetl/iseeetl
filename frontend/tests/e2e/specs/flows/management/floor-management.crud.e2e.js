const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { clickSingleVisible } = require('../../helpers/dialog-focus');

const CONFIRM_SELECTOR = '[role="dialog"] [data-testid="base-edit-dialog-confirm"]:not([disabled])';
const LIFECYCLE_CONFIRM_SELECTOR =
  '[role="dialog"] [data-testid="management-lifecycle-confirm"]:not([disabled])';
const LIFECYCLE_DIALOG_SELECTOR = '[data-testid="management-lifecycle-dialog"]';
const STATUS_FILTER_SELECTOR = 'select.management-status-filter';

const openFloorManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/floor`;
  navigateToApp(browser, url).waitForElementVisible('table.management-table', 10000);
};

const clickConfirm = (browser) => {
  clickSingleVisible(browser, CONFIRM_SELECTOR, 'フロア管理の変更を確定');
};

const clickLifecycleConfirm = (browser) => {
  clickSingleVisible(browser, LIFECYCLE_CONFIRM_SELECTOR, 'フロア管理の削除・復元を確定');
};

const showAllStatuses = (browser) => {
  browser.waitForElementVisible(STATUS_FILTER_SELECTOR, 10000).execute(
    function (selector) {
      const select = document.querySelector(selector);
      if (!select) return false;
      select.value = 'all';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    [STATUS_FILTER_SELECTOR],
    (result) => browser.assert.ok(Boolean(result && result.value), 'フロアの状態フィルタを「すべて」に変更しました。')
  );
};

const waitForDialogClosed = (browser, attempt = 0, onReady) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const input = document.querySelector('#edit_floor_title');
      const visible = !!(input && (input.offsetParent || input.getClientRects().length));
      return { visible };
    },
    [],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (!visible) {
        browser.assert.ok(true, 'ダイアログが閉じました。');
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ダイアログが閉じていません。');
        return;
      }
      browser.pause(500, () => waitForDialogClosed(browser, attempt + 1, onReady));
    }
  );
};

const openRowActionByTitle = (browser, title, actionSelector, attempt = 0, onReady) => {
  const maxAttempts = 10;
  browser.execute(
    function (keyword, selector) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const matches = rows.filter((node) => {
        const cell = node.querySelector('td');
        const text = cell ? cell.textContent.trim() : '';
        return text === keyword;
      });
      if (matches.length !== 1) return { clicked: false, count: matches.length };
      const button = matches[0].querySelector(selector);
      if (!button) return { clicked: false, count: 1 };
      button.click();
      return { clicked: true, count: 1 };
    },
    [title, actionSelector],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, count: 0 };
      if (state.clicked) {
        if (onReady) onReady(true);
        return;
      }
      if (state.count > 1) {
        browser.assert.equal(state.count, 1, `対象フロアの行が1件あります: ${title}`);
        if (onReady) onReady(false);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `対象フロアの行が見つかりません: ${title}`);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => openRowActionByTitle(browser, title, actionSelector, attempt + 1, onReady));
    }
  );
};

const openRowByTitle = (browser, title, attempt = 0, onReady) =>
  openRowActionByTitle(browser, title, '[data-testid="management-floor-edit"]', attempt, onReady);

const openLifecycleByTitle = (browser, title, attempt = 0, onReady) =>
  openRowActionByTitle(browser, title, '[data-testid="management-floor-lifecycle"]', attempt, onReady);

const waitForRowSoftDeleteState = (browser, title, expected, attempt = 0, onReady) => {
  const maxAttempts = 10;
  browser.execute(
    function (payload) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const matches = rows.filter((node) => {
        const cell = node.querySelector('td');
        const text = cell ? cell.textContent.trim() : '';
        return text === payload.title;
      });
      if (matches.length !== 1) return { count: matches.length, deleted: false };
      return { count: 1, deleted: matches[0].classList.contains('soft-delete') };
    },
    [{ title }],
    (result) => {
      const state = result && result.value ? result.value : { count: 0, deleted: false };
      if (state.count === 1 && state.deleted === expected) {
        browser.assert.ok(true, `論理削除の状態が一致しました: ${expected}`);
        if (onReady) onReady(true);
        return;
      }
      if (state.count > 1) {
        browser.assert.equal(state.count, 1, `対象フロアの行が1件あります: ${title}`);
        if (onReady) onReady(false);
        return;
      }
      if (attempt >= maxAttempts) {
        const message = state.count === 1 ? '論理削除の状態が一致しません。' : `対象フロアの行が見つかりません: ${title}`;
        browser.assert.ok(false, message);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => waitForRowSoftDeleteState(browser, title, expected, attempt + 1, onReady));
    }
  );
};

module.exports = {
  'フロア管理の編集ダイアログから保存できる': (browser) => {
    const suffix = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
    const originalTitle = `E2E Floor Edit ${suffix}`;
    const updatedTitle = `E2E Floor Updated ${suffix}`;

    runManagementFlowWithPreparedFloorRoom(
      browser,
      'Floor Management CRUD Edit',
      ({ finish }) => {
        openFloorManagement(browser);

        openRowByTitle(browser, originalTitle, 0, (opened) => {
          if (!opened) return finish();
          browser.waitForElementVisible('#edit_floor_title', 10000);
          browser.getValue('#edit_floor_title', (result) => {
            const current = result && result.value ? String(result.value) : '';
            browser.assert.equal(current, originalTitle, '専用のフロアのテストデータを編集画面で開きました。');
            if (current !== originalTitle) return finish();

            browser.clearValue('#edit_floor_title').setValue('#edit_floor_title', updatedTitle);
            clickConfirm(browser);
            waitForDialogClosed(browser, 0, () => {
              waitForRowSoftDeleteState(browser, updatedTitle, false, 0, (listed) => {
                if (!listed) return finish();
                openRowByTitle(browser, updatedTitle, 0, (reopened) => {
                  if (!reopened) return finish();
                  browser.waitForElementVisible('#edit_floor_title', 10000);
                  browser.getValue('#edit_floor_title', (persistedResult) => {
                    const persisted = persistedResult && persistedResult.value ? String(persistedResult.value) : '';
                    browser.assert.equal(persisted, updatedTitle, '再度開いても更新したフロア名が保存されています。');
                    finish();
                  });
                });
              });
            });
          });
        });
      },
      {
        floorTitle: originalTitle,
        roomTitle: `E2E Floor Edit Room ${suffix}`,
      }
    );
  },
  'フロア管理で論理削除と復元ができる': (browser) => {
    const suffix = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
    const floorTitle = `E2E Floor Delete Toggle ${suffix}`;

    runManagementFlowWithPreparedFloorRoom(
      browser,
      'Floor Management CRUD Delete Toggle',
      ({ finish }) => {
        openFloorManagement(browser);
        showAllStatuses(browser);

        openLifecycleByTitle(browser, floorTitle, 0, (opened) => {
          if (!opened) return finish();
          browser.waitForElementVisible(LIFECYCLE_DIALOG_SELECTOR, 10000);
          clickLifecycleConfirm(browser);
          browser.waitForElementNotPresent(LIFECYCLE_DIALOG_SELECTOR, 10000);
          waitForRowSoftDeleteState(browser, floorTitle, true, 0, (deletedStateMatched) => {
            if (!deletedStateMatched) return finish();
            openLifecycleByTitle(browser, floorTitle, 0, (reopened) => {
              if (!reopened) return finish();
              browser.waitForElementVisible(LIFECYCLE_DIALOG_SELECTOR, 10000);
              clickLifecycleConfirm(browser);
              browser.waitForElementNotPresent(LIFECYCLE_DIALOG_SELECTOR, 10000);
              waitForRowSoftDeleteState(browser, floorTitle, false, 0, () => {
                finish();
              });
            });
          });
        });
      },
      {
        floorTitle,
        roomTitle: `E2E Floor Delete Toggle Room ${suffix}`,
      }
    );
  },
};
