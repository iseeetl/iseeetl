const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { clickSingleVisible } = require('../../helpers/dialog-focus');

const CONFIRM_SELECTOR = '[role="dialog"] [data-testid="base-edit-dialog-confirm"]:not([disabled])';
const LIFECYCLE_CONFIRM_SELECTOR =
  '[role="dialog"] [data-testid="management-lifecycle-confirm"]:not([disabled])';
const LIFECYCLE_DIALOG_SELECTOR = '[data-testid="management-lifecycle-dialog"]';
const STATUS_FILTER_SELECTOR = 'select.management-status-filter';

const openRoomManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/room`;
  navigateToApp(browser, url).waitForElementVisible('table.management-table', 10000);
};

const clickConfirm = (browser) => {
  clickSingleVisible(browser, CONFIRM_SELECTOR, 'ルーム管理の変更を確定');
};

const clickLifecycleConfirm = (browser) => {
  clickSingleVisible(browser, LIFECYCLE_CONFIRM_SELECTOR, 'ルーム管理の削除・復元を確定');
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
    (result) => browser.assert.ok(Boolean(result && result.value), 'ルームの状態フィルタを「すべて」に変更しました。')
  );
};

const waitForSnackbarMessage = (browser, attempt = 0, onReady) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const snackbar = document.querySelector('[data-testid="app-snackbar"]');
      const messageNode = snackbar ? snackbar.querySelector('span') : null;
      const visible = !!(snackbar && (snackbar.offsetParent || snackbar.getClientRects().length));
      return { visible, message: messageNode && messageNode.textContent ? messageNode.textContent.trim() : '' };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { visible: false, message: '' };
      if (state.visible && state.message) {
        const message = typeof state.message === 'string' ? state.message : String(state.message);
        const failed =
          message.indexOf('失敗') !== -1 ||
          message.toLowerCase().indexOf('failed') !== -1 ||
          message.toLowerCase().indexOf('error') !== -1;
        browser.assert.ok(!failed, `ルーム更新の通知: ${message}`);
        if (onReady) onReady(!failed);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ルーム更新の通知が表示されていません。');
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => waitForSnackbarMessage(browser, attempt + 1, onReady));
    }
  );
};

const waitForRoomTitleValue = (browser, attempt, done) => {
  const maxAttempts = 10;
  browser.getValue('#room_title', (result) => {
    const current = result && result.value ? String(result.value) : '';
    if (current) {
      done(current);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, 'ルーム名が読み込まれていません。');
      browser.end();
      return;
    }
    browser.pause(500, () => waitForRoomTitleValue(browser, attempt + 1, done));
  });
};

const waitForDialogClosed = (browser, attempt = 0, done) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const input = document.querySelector('#room_title');
      const visible = !!(input && (input.offsetParent || input.getClientRects().length));
      return { visible };
    },
    [],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (!visible) {
        browser.assert.ok(true, 'ダイアログが閉じました。');
        if (done) done();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ダイアログが閉じていません。');
        return;
      }
      browser.pause(500, () => waitForDialogClosed(browser, attempt + 1, done));
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
        browser.assert.equal(state.count, 1, `対象ルームの行が1件あります: ${title}`);
        if (onReady) onReady(false);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `対象ルームの行が見つかりません: ${title}`);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => openRowActionByTitle(browser, title, actionSelector, attempt + 1, onReady));
    }
  );
};

const openRowByTitle = (browser, title, attempt = 0, onReady) =>
  openRowActionByTitle(browser, title, '[data-testid="management-room-edit"]', attempt, onReady);

const openLifecycleByTitle = (browser, title, attempt = 0, onReady) =>
  openRowActionByTitle(browser, title, '[data-testid="management-room-lifecycle"]', attempt, onReady);

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
        browser.assert.equal(state.count, 1, `対象ルームの行が1件あります: ${title}`);
        if (onReady) onReady(false);
        return;
      }
      if (attempt >= maxAttempts) {
        const message = state.count === 1 ? '論理削除の状態が一致しません。' : `対象ルームの行が見つかりません: ${title}`;
        browser.assert.ok(false, message);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => waitForRowSoftDeleteState(browser, title, expected, attempt + 1, onReady));
    }
  );
};

module.exports = {
  'ルーム管理の編集ダイアログから保存できる': (browser) => {
    const suffix = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
    const floorTitle = `E2E Room Edit Floor ${suffix}`;
    const originalTitle = `E2E Room Edit ${suffix}`;
    const updatedTitle = `E2E Room Updated ${suffix}`;

    runManagementFlowWithPreparedFloorRoom(
      browser,
      'Room Management CRUD Edit',
      ({ finish }) => {
        openRoomManagement(browser);

        openRowByTitle(browser, originalTitle, 0, (opened) => {
          if (!opened) return finish();
          browser.waitForElementVisible('#room_title', 10000);

          waitForRoomTitleValue(browser, 0, (current) => {
            browser.assert.equal(current, originalTitle, '専用のルームのテストデータを編集画面で開きました。');
            if (current !== originalTitle) return finish();

            browser.clearValue('#room_title').setValue('#room_title', updatedTitle);
            clickConfirm(browser);
            waitForSnackbarMessage(browser, 0, (saved) => {
              if (!saved) return finish();
              waitForDialogClosed(browser, 0, () => {
                waitForRowSoftDeleteState(browser, updatedTitle, false, 0, (listed) => {
                  if (!listed) return finish();
                  openRowByTitle(browser, updatedTitle, 0, (reopened) => {
                    if (!reopened) return finish();
                    browser.waitForElementVisible('#room_title', 10000);
                    browser.getValue('#room_title', (persistedResult) => {
                      const persisted = persistedResult && persistedResult.value ? String(persistedResult.value) : '';
                      browser.assert.equal(persisted, updatedTitle, '再度開いても更新したルーム名が保存されています。');
                      finish();
                    });
                  });
                });
              });
            });
          });
        });
      },
      { floorTitle, roomTitle: originalTitle }
    );
  },
  'ルーム管理で論理削除と復元ができる': (browser) => {
    const suffix = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
    const floorTitle = `E2E Room Delete Toggle Floor ${suffix}`;
    const roomTitle = `E2E Room Delete Toggle ${suffix}`;

    runManagementFlowWithPreparedFloorRoom(
      browser,
      'Room Management CRUD Delete Toggle',
      ({ finish }) => {
        openRoomManagement(browser);
        showAllStatuses(browser);

        openLifecycleByTitle(browser, roomTitle, 0, (opened) => {
          if (!opened) return finish();
          browser.waitForElementVisible(LIFECYCLE_DIALOG_SELECTOR, 10000);
          clickLifecycleConfirm(browser);
          browser.waitForElementNotPresent(LIFECYCLE_DIALOG_SELECTOR, 10000);
          waitForRowSoftDeleteState(browser, roomTitle, true, 0, (deletedStateMatched) => {
            if (!deletedStateMatched) return finish();
            openLifecycleByTitle(browser, roomTitle, 0, (reopened) => {
              if (!reopened) return finish();
              browser.waitForElementVisible(LIFECYCLE_DIALOG_SELECTOR, 10000);
              clickLifecycleConfirm(browser);
              browser.waitForElementNotPresent(LIFECYCLE_DIALOG_SELECTOR, 10000);
              waitForRowSoftDeleteState(browser, roomTitle, false, 0, () => {
                finish();
              });
            });
          });
        });
      },
      { floorTitle, roomTitle }
    );
  },
};
