const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { clickSingleVisible } = require('../../helpers/dialog-focus');
const { createScopedTagByApiActor } = require('../../helpers/management-tag-fixture');

const CONFIRM_SELECTOR = '[role="dialog"] [data-testid="base-edit-dialog-confirm"]:not([disabled])';
const CANCEL_SELECTOR = '[role="dialog"] [data-testid="base-edit-dialog-cancel"]:not([disabled])';

const openRoomTagManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/roomtag`;
  navigateToApp(browser, url).waitForElementVisible('table.management-table', 10000);
};

const openRowByName = (browser, name, onReady, onMissing, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (targetName) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const matches = rows.filter((row) => {
        const cells = row.querySelectorAll('td');
        return cells.length > 1 && cells[1].textContent.trim() === targetName;
      });
      if (matches.length !== 1) return { clicked: false, count: matches.length };
      const button = matches[0].querySelector('[data-testid="management-roomtag-edit"]');
      if (!button) return { clicked: false, count: 1 };
      button.click();
      return { clicked: true, count: 1 };
    },
    [name],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, count: 0 };
      if (state.clicked) {
        onReady();
        return;
      }
      if (state.count > 1) {
        browser.assert.equal(state.count, 1, `対象ルームタグの行が1件あります: ${name}`);
        if (onMissing) onMissing();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `対象のルームタグの行が見つかりません: ${name}`);
        if (onMissing) onMissing();
        return;
      }
      browser.pause(500, () => openRowByName(browser, name, onReady, onMissing, attempt + 1));
    }
  );
};

const waitForDialogVisible = (browser, titleId, attempt = 0, onReady) => {
  const maxAttempts = 10;
  browser.execute(
    function (id) {
      const el = document.getElementById(id);
      const visible = !!(el && (el.offsetParent || el.getClientRects().length));
      return { visible };
    },
    [titleId],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (visible) {
        browser.assert.ok(true, `ダイアログが表示されています: ${titleId}`);
        if (onReady) onReady(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ダイアログが表示されていません: ${titleId}`);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => waitForDialogVisible(browser, titleId, attempt + 1, onReady));
    }
  );
};

const waitForDialogClosed = (browser, titleId, attempt = 0, onReady) => {
  const maxAttempts = 10;
  browser.execute(
    function (id) {
      const el = document.getElementById(id);
      const visible = !!(el && (el.offsetParent || el.getClientRects().length));
      return { visible };
    },
    [titleId],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (!visible) {
        browser.assert.ok(true, `ダイアログが閉じました: ${titleId}`);
        if (onReady) onReady(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ダイアログが閉じていません: ${titleId}`);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => waitForDialogClosed(browser, titleId, attempt + 1, onReady));
    }
  );
};

const clickDialogOk = (browser) => {
  clickSingleVisible(browser, CONFIRM_SELECTOR, 'ルームタグ管理の変更を確定');
};

const clickDialogCancel = (browser) => {
  clickSingleVisible(browser, CANCEL_SELECTOR, 'ルームタグ管理の変更をキャンセル');
};

const deleteAndRestoreRoomTagByName = (browser, name, finish) => {
  browser.execute(function (targetName) {
    const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
    const matches = rows.filter((row) => row.querySelectorAll('td')[1]?.textContent.trim() === targetName);
    if (matches.length !== 1) return { id: '' };
    const button = matches[0].querySelector('[data-testid="management-roomtag-lifecycle"]');
    if (!button) return { id: '' };
    const id = button.getAttribute('data-management-lifecycle-id');
    return { id };
  }, [name], (result) => {
    const id = result.value?.id;
    browser.assert.ok(Boolean(id), '対象のルームタグの削除確認を開きます。');
    if (!id) return finish();
    const dialog = '[data-testid="management-lifecycle-dialog"]';
    const button = `[data-management-lifecycle-id="${id}"]`;
    clickSingleVisible(browser, button, 'ルームタグの削除確認を開く');
    browser.waitForElementVisible(dialog, 10000);
    clickSingleVisible(browser, `${dialog} [data-testid="management-lifecycle-confirm"]`, 'ルームタグの論理削除を確定');
    browser.waitForElementNotPresent(dialog, 10000);
    browser.waitForElementVisible(`tr.soft-delete ${button}`, 10000);
    openRoomTagManagement(browser);
    browser.waitForElementVisible(`tr.soft-delete ${button}`, 10000);
    clickSingleVisible(browser, button, '同じIDのルームタグを復元');
    browser.waitForElementVisible(dialog, 10000);
    clickSingleVisible(browser, `${dialog} [data-testid="management-lifecycle-confirm"]`, 'ルームタグの復元を確定');
    browser.waitForElementNotPresent(dialog, 10000);
    browser.waitForElementVisible(`tr:not(.soft-delete) ${button}`, 10000);
    openRoomTagManagement(browser);
    browser.waitForElementVisible(`tr:not(.soft-delete) ${button}`, 10000);
    browser.perform((done) => { finish(); done(); });
  });
};

module.exports = {
  'ルームタグ管理で編集・論理削除し、同じIDで復元できる': (browser) => {
    const titleId = 'edit_room_tag_dialog_title';
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const suffix = String(Date.now()).slice(-8);
    const tagName = `r${suffix}`;
    const updatedTagName = `v${suffix}`;

    runManagementFlowWithPreparedFloorRoom(browser, 'Room Tag Management CRUD', ({ roomId, finish }) => {
      createScopedTagByApiActor(
        browser,
        {
          actorMail: editorMail,
          actorPassword: editorPassword,
          scope: 'room',
          scopeId: roomId,
          name: tagName,
        },
        'ルームタグ管理のテストデータ'
      );
      openRoomTagManagement(browser);

      openRowByName(
        browser,
        tagName,
        () => {
          waitForDialogVisible(browser, titleId, 0, (visible) => {
            if (!visible) return finish();
            browser.getValue('#room_tag_name', (result) => {
              const current = result && result.value ? String(result.value) : '';
              browser.assert.equal(current, tagName, '対象のルームタグのテストデータを編集画面で開きました。');
              if (current !== tagName) return finish();
              browser.clearValue('#room_tag_name').setValue('#room_tag_name', updatedTagName);
              clickDialogOk(browser);
              waitForDialogClosed(browser, titleId, 0, (closed) => {
                if (!closed) return finish();
                openRowByName(
                  browser,
                  updatedTagName,
                  () => {
                    waitForDialogVisible(browser, titleId, 0, (reopened) => {
                      if (!reopened) return finish();
                      browser.getValue('#room_tag_name', (persistedResult) => {
                        const persisted =
                          persistedResult && persistedResult.value ? String(persistedResult.value) : '';
                        browser.assert.equal(
                          persisted,
                          updatedTagName,
                          '再度開いても更新したルームタグ名が保存されています。'
                        );
                        clickDialogCancel(browser);
                        waitForDialogClosed(browser, titleId, 0, () => deleteAndRestoreRoomTagByName(browser, updatedTagName, finish));
                      });
                    });
                  },
                  finish
                );
              });
            });
          });
        },
        finish
      );
    });
  },
};
