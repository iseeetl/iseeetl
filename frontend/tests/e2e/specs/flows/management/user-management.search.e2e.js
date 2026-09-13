const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');

const openUserManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/user`;
  navigateToApp(browser, url).waitForElementVisible('table.management-table', 10000);
};

const applySearch = (browser, term) => {
  browser.execute(
    function (keyword) {
      const input = document.querySelector('#management-search-input');
      const button = document.querySelector('[data-testid="management-search-submit"]');
      if (!input || !button) return { ok: false, reason: 'search-control-not-found' };
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

const waitForSearchMatch = (browser, term, attempt = 0, onDone) => {
  const maxAttempts = 10;
  browser.execute(
    function (keyword) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        const text = cells.length > 1 ? cells[1].textContent.trim() : '';
        if (text === keyword) return { match: true };
      }
      return { match: false };
    },
    [term],
    (result) => {
      const state = result && result.value ? result.value : { match: false };
      if (state.match) {
        browser.assert.ok(true, '検索結果が対象の初期ユーザに一致しました。');
        if (onDone) onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '検索結果に対象の初期ユーザが含まれていません。');
        if (onDone) onDone(false);
        return;
      }
      browser.pause(500, () => waitForSearchMatch(browser, term, attempt + 1, onDone));
    }
  );
};

module.exports = {
  'ユーザ管理で検索できる': (browser) => {
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');

    loginByForm(browser, { mail: adminMail, password: adminPassword });
    openUserManagement(browser);
    applySearch(browser, adminMail);
    waitForSearchMatch(browser, adminMail, 0, () => browser.end());
  },
};
