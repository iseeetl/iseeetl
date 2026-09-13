const { requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const { clearBrowserSession } = require('../../helpers/auth-security');
const {
  openUserManagement,
  applySearch,
  waitForSearchQuery,
  openUserRowByMail,
} = require('../../helpers/user-management');

module.exports = {
  '管理ダイアログから管理者の権限を下げたり削除したりできない': (browser) => {
    const mail = requireEnv('E2E_ADMIN_MAIL');
    const password = requireEnv('E2E_ADMIN_PASSWORD');
    const searchTerm = mail.length > 20 ? mail.slice(0, 20) : mail;

    clearBrowserSession(browser);
    loginByForm(browser, { mail, password });
    openUserManagement(browser);
    applySearch(browser, searchTerm);
    waitForSearchQuery(browser, searchTerm, () => {
      openUserRowByMail(browser, mail, () => {
        browser
          .waitForElementVisible('#role', 10000)
          .execute(
            function (targetMail) {
              const role = document.getElementById('role');
              const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
              const row = rows.find((candidate) =>
                Array.from(candidate.querySelectorAll('td')).some(
                  (cell) => cell.textContent && cell.textContent.trim() === targetMail
                )
              );
              return {
                roleDisabled: !!(role && role.disabled),
                roleLabel: role ? role.value : '',
                lifecycleActionCount: row
                  ? row.querySelectorAll('[data-testid="management-user-lifecycle"]').length
                  : -1,
              };
            },
            [mail],
            (result) => {
              const state = result && result.value ? result.value : {};
              browser.assert.ok(state.roleDisabled, '管理者の権限欄は読み取り専用です。');
              browser.assert.equal(state.roleLabel, '管理者', '管理者の権限ラベルが表示されています。');
              browser.assert.equal(
                state.lifecycleActionCount,
                0,
                '管理者の削除・復元操作は利用できません。'
              );
            }
          )
          .end();
      });
    });
  },
};
