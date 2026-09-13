const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { clickSingleVisible } = require('../../helpers/dialog-focus');
const { createScopedTagByApiActor, deleteManagedTagByName } = require('../../helpers/management-tag-fixture');

const CONFIRM_SELECTOR = '[role="dialog"] [data-testid="base-edit-dialog-confirm"]:not([disabled])';
const CANCEL_SELECTOR = '[role="dialog"] [data-testid="base-edit-dialog-cancel"]:not([disabled])';

const openFloorTagManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/floortag`;
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
      const button = matches[0].querySelector('[data-testid="management-floortag-edit"]');
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
        browser.assert.equal(state.count, 1, `対象フロアタグの行が1件あります: ${name}`);
        if (onMissing) onMissing();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `対象のフロアタグの行が見つかりません: ${name}`);
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
  clickSingleVisible(browser, CONFIRM_SELECTOR, 'フロアタグ管理の変更を確定');
};

const clickDialogCancel = (browser) => {
  clickSingleVisible(browser, CANCEL_SELECTOR, 'フロアタグ管理の変更をキャンセル');
};

module.exports = {
  'フロアタグ管理の編集ダイアログから保存し、一覧から削除できる': (browser) => {
    const titleId = 'edit_floor_tag_dialog_title';
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const suffix = String(Date.now()).slice(-8);
    const tagName = `f${suffix}`;
    const updatedTagName = `u${suffix}`;

    runManagementFlowWithPreparedFloorRoom(browser, 'Floor Tag Management CRUD', ({ floorId, finish }) => {
      createScopedTagByApiActor(
        browser,
        {
          actorMail: editorMail,
          actorPassword: editorPassword,
          scope: 'floor',
          scopeId: floorId,
          name: tagName,
        },
        'フロアタグ管理のテストデータ'
      );
      openFloorTagManagement(browser);

      openRowByName(
        browser,
        tagName,
        () => {
          waitForDialogVisible(browser, titleId, 0, (visible) => {
            if (!visible) return finish();
            browser.getValue('#tag_name', (result) => {
              const current = result && result.value ? String(result.value) : '';
              browser.assert.equal(current, tagName, '対象のフロアタグのテストデータを編集画面で開きました。');
              if (current !== tagName) return finish();
              browser.clearValue('#tag_name').setValue('#tag_name', updatedTagName);
              clickDialogOk(browser);
              waitForDialogClosed(browser, titleId, 0, (closed) => {
                if (!closed) return finish();
                openRowByName(
                  browser,
                  updatedTagName,
                  () => {
                    waitForDialogVisible(browser, titleId, 0, (reopened) => {
                      if (!reopened) return finish();
                      browser.getValue('#tag_name', (persistedResult) => {
                        const persisted =
                          persistedResult && persistedResult.value ? String(persistedResult.value) : '';
                        browser.assert.equal(
                          persisted,
                          updatedTagName,
                          '再度開いても更新したフロアタグ名が保存されています。'
                        );
                        clickDialogCancel(browser);
                        waitForDialogClosed(browser, titleId, 0, () => deleteManagedTagByName(browser, { scope: 'floor', name: updatedTagName }, finish));
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
