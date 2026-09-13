const { requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const {
  openUserManagement,
  applySearch,
  waitForSearchQuery,
  openUserLifecycleByMail,
  clickUserLifecycleConfirm,
  waitForUserLifecycleDialogClosed,
} = require('../../helpers/user-management');

const waitForRowDeleteState = (browser, mail, expectedDeleted, onReady, onFail, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (targetMail) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const row = rows.find((node) =>
        Array.from(node.querySelectorAll('td')).some(
          (cell) => cell.textContent && cell.textContent.trim() === targetMail
        )
      );
      return { found: !!row, deleted: !!(row && row.classList.contains('soft-delete')) };
    },
    [mail],
    (result) => {
      const state = result && result.value ? result.value : { found: false, deleted: false };
      if (state.found && state.deleted === expectedDeleted) {
        browser.assert.equal(
          state.deleted,
          expectedDeleted,
          expectedDeleted
            ? '論理削除した投稿者が削除済みとして表示されています。'
            : '投稿者の行が論理削除から復元されています。'
        );
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `削除状態が更新されていません: found=${state.found} deleted=${state.deleted}`);
        if (onFail) onFail();
        return;
      }
      browser.pause(400, () =>
        waitForRowDeleteState(browser, mail, expectedDeleted, onReady, onFail, attempt + 1)
      );
    }
  );
};

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'ユーザ管理で論理削除と復元ができる': (browser) => {
    const admin = {
      mail: requireEnv('E2E_ADMIN_MAIL'),
      password: requireEnv('E2E_ADMIN_PASSWORD'),
    };
    const targetMail = requireEnv('E2E_USER_MAIL');
    const searchTerm = targetMail.slice(0, 20);
    const finish = () => browser.end();

    if (admin.mail === targetMail) {
      browser.assert.ok(false, '初期データの固定の投稿者と管理者は別のユーザである必要があります。');
      finish();
      return;
    }
    browser.assert.ok(true, '初期データの固定の投稿者と管理者は別のユーザです。');
    loginByForm(browser, admin);
    openUserManagement(browser);
    applySearch(browser, searchTerm);

    waitForSearchQuery(
      browser,
      searchTerm,
      () => {
        waitForRowDeleteState(browser, targetMail, false, () => {
          openUserLifecycleByMail(browser, targetMail, () => {
            clickUserLifecycleConfirm(browser);
            waitForUserLifecycleDialogClosed(browser, () => {
              waitForRowDeleteState(browser, targetMail, true, () => {
                openUserLifecycleByMail(browser, targetMail, () => {
                  clickUserLifecycleConfirm(browser);
                  waitForUserLifecycleDialogClosed(browser, () => {
                    waitForRowDeleteState(browser, targetMail, false, finish, finish);
                  }, finish);
                }, finish);
              }, finish);
            }, finish);
          }, finish);
        }, finish);
      },
      finish
    );
  },
};
