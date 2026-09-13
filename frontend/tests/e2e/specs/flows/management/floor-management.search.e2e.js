// ページングはfloor.search.pagination.e2e.jsで専用データを作成して検証する。
const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');

const openFloorManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/floor`;
  navigateToApp(browser, url).waitForElementVisible('table.management-table', 10000);
};

const applySearch = (browser, term) => {
  browser.execute(
    function (keyword) {
      const input = document.querySelector('#management-search-input');
      const button = document.querySelector('[data-testid="management-search-submit"]');
      if (!input || !button) return { ok: false, reason: 'search-control-not-found' };
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

const waitForSearchMatch = (browser, term, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (keyword) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const matches = rows.filter((row) => {
        const cell = row.querySelector('td');
        return cell && cell.textContent.trim() === keyword;
      });
      return { match: matches.length === 1, count: matches.length };
    },
    [term],
    (result) => {
      const state = result && result.value ? result.value : { match: false, count: -1 };
      if (state.match) {
        browser.assert.ok(true, `準備したフロアが検索結果に1件だけ表示されています: ${term}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `準備したフロアを検索結果の1件に特定できませんでした: ${term}（count=${state.count}）`);
        return;
      }
      browser.pause(500, () => waitForSearchMatch(browser, term, attempt + 1));
    }
  );
};

module.exports = {
  'フロア管理で検索できる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'Floor Management Search', ({ floorTitle, finish }) => {
      openFloorManagement(browser);
      applySearch(browser, floorTitle);
      waitForSearchMatch(browser, floorTitle);
      finish();
    });
  },
};
