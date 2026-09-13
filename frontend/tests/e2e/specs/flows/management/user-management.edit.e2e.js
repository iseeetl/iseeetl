const { requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const {
  openUserManagement,
  applySearch,
  waitForSearchQuery,
  openUserRowByMail,
  clickDialogSubmit,
  waitForDialogClosed,
} = require('../../helpers/user-management');

const SEEDED_AUTHOR_USERNAME = 'E2E Author';

const readDialogUsername = (browser, onReady, onFail) => {
  browser.execute(
    function () {
      const input = document.querySelector('#user-management-username');
      if (!input) return { ok: false, reason: 'input-not-found' };
      return { ok: true, value: input.value || '' };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'no-result' };
      browser.assert.ok(state.ok, `ユーザ名の入力欄を操作できます: ${state.reason || 'ok'}`);
      if (state.ok) {
        if (onReady) onReady(state.value || '');
        return;
      }
      if (onFail) onFail();
    }
  );
};

const setDialogUsername = (browser, value) => {
  browser.execute(
    function (nextValue) {
      const input = document.querySelector('#user-management-username');
      if (!input) return { ok: false, reason: 'input-not-found' };
      input.value = nextValue;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return { ok: true };
    },
    [value],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'no-result' };
      browser.assert.ok(state.ok, `ユーザ名を入力しました: ${state.reason || 'ok'}`);
    }
  );
};

const waitForRowUsername = (browser, mail, expected, onReady, onFail, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (payload) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const row = rows.find((node) =>
        Array.from(node.querySelectorAll('td')).some(
          (cell) => cell.textContent && cell.textContent.trim() === payload.mail
        )
      );
      const firstCell = row ? row.querySelector('td') : null;
      return {
        found: !!row,
        username: firstCell && firstCell.textContent ? firstCell.textContent.trim() : '',
      };
    },
    [{ mail }],
    (result) => {
      const state = result && result.value ? result.value : { found: false, username: '' };
      if (state.found && state.username === expected) {
        browser.assert.equal(state.username, expected, '更新したユーザ名が管理画面の一覧に表示されています。');
        if (onReady) onReady();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ユーザ名の更新が管理画面の一覧に反映されていません。');
        if (onFail) onFail();
        return;
      }
      browser.pause(400, () =>
        waitForRowUsername(browser, mail, expected, onReady, onFail, attempt + 1)
      );
    }
  );
};

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'ユーザ管理でユーザ名を変更できる': (browser) => {
    const admin = {
      mail: requireEnv('E2E_ADMIN_MAIL'),
      password: requireEnv('E2E_ADMIN_PASSWORD'),
    };
    const targetMail = requireEnv('E2E_USER_MAIL');
    const searchTerm = targetMail.slice(0, 20);
    const nextUsername = `E2E${String(Date.now()).slice(-6)}`;
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
        openUserRowByMail(
          browser,
          targetMail,
          () => {
            readDialogUsername(browser, (currentUsername) => {
              browser.assert.equal(
                currentUsername,
                SEEDED_AUTHOR_USERNAME,
                '編集対象は初期データの固定の投稿者です。'
              );
              if (currentUsername !== SEEDED_AUTHOR_USERNAME) {
                finish();
                return;
              }
              setDialogUsername(browser, nextUsername);
              clickDialogSubmit(
                browser,
                { mail: targetMail, username: nextUsername },
                () => {
                  waitForDialogClosed(
                    browser,
                    () => waitForRowUsername(browser, targetMail, nextUsername, finish, finish),
                    finish
                  );
                },
                finish
              );
            }, finish);
          },
          finish
        );
      },
      finish
    );
  },
};
