const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm } = require('../../helpers/session-helpers');
const {
  clickSingleVisible,
  clickSingleVisibleAfterExactControls,
} = require('../../helpers/dialog-focus');

const openSpamManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/spam`;
  navigateToApp(browser, url).waitForElementVisible('[data-testid="management-spam-create"]', 10000);
};

const createSpamFixture = (browser, word) => {
  browser.waitForElementVisible('[data-testid="management-spam-create"]', 10000);
  clickSingleVisible(browser, '[data-testid="management-spam-create"]', 'スパムワード検索用のテストデータを作成');
  browser
    .waitForElementVisible('[role="dialog"] #spam-word', 10000)
    .clearValue('[role="dialog"] #spam-word')
    .setValue('[role="dialog"] #spam-word', word);
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#spam-word',
    expectedControls: [{ selector: '#spam-word', property: 'value', value: word }],
    submitSelector: '[data-testid="management-spam-submit"]',
    label: 'スパムワード検索用のテストデータを送信',
  });
  browser.waitForElementNotVisible('[role="dialog"] #spam-word', 10000);
};

const waitForFetchIdle = (browser, attempt = 0, onDone) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const view = document.querySelector('.view');
      return { fetching: view ? view.getAttribute('aria-busy') === 'true' : null };
    },
    [],
    (result) => {
      const fetching = result && result.value ? result.value.fetching : null;
      if (fetching === false) {
        if (onDone) onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'スパム管理のテストデータの再読み込みが完了しませんでした。');
        if (onDone) onDone(false);
        return;
      }
      browser.pause(300, () => waitForFetchIdle(browser, attempt + 1, onDone));
    }
  );
};

const applySearch = (browser, term) => {
  browser
    .waitForElementVisible('#management-search-input', 10000)
    .clearValue('#management-search-input')
    .setValue('#management-search-input', term);
  clickSingleVisibleAfterExactControls(browser, {
    rootSelector: '.view',
    expectedControls: [{ selector: '#management-search-input', property: 'value', value: term }],
    submitSelector: '[data-testid="management-search-submit"]',
    label: 'スパムワードの検索を実行',
  });
};

const waitForSearchMatch = (browser, term, attempt = 0, onDone) => {
  const maxAttempts = 10;
  browser.execute(
    function (keyword) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      const texts = rows.map((row) => {
        const cell = row.querySelector('td');
        return cell ? cell.textContent.trim() : '';
      });
      const exactCount = texts.filter((text) => text === keyword).length;
      const query = new URLSearchParams(window.location.search);
      const view = document.querySelector('.view');
      return {
        fetching: view ? view.getAttribute('aria-busy') === 'true' : null,
        querySearch: query.get('q'),
        rowCount: rows.length,
        exactCount,
        text: exactCount === 1 ? keyword : '',
      };
    },
    [term],
    (result) => {
      const state = result && result.value ? result.value : {};
      const matched =
        state.fetching === false &&
        state.querySearch === term &&
        state.rowCount === 1 &&
        state.exactCount === 1;
      if (matched) {
        browser.assert.equal(state.querySearch, term, 'URLが検索条件を維持しています。');
        browser.assert.equal(state.rowCount, 1, '検索結果が1行だけ表示されています。');
        browser.assert.equal(state.exactCount, 1, '対象のテストデータが検索結果に1件だけ表示されています。');
        browser.assert.equal(state.text, term, `検索結果が対象のスパムワードのテストデータに一致しました: ${term}`);
        if (onDone) onDone(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `検索結果が想定した状態に確定しませんでした: q=${state.querySearch || '(empty)'} rows=${state.rowCount ?? -1} exact=${
            state.exactCount ?? -1
          } busy=${String(state.fetching)}`
        );
        if (onDone) onDone(false);
        return;
      }
      browser.pause(500, () => waitForSearchMatch(browser, term, attempt + 1, onDone));
    }
  );
};

module.exports = {
  'スパム管理で検索できる': (browser) => {
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const word = `e2e-spam-search-${String(Date.now()).slice(-8)}`;

    loginByForm(browser, { mail: adminMail, password: adminPassword });
    openSpamManagement(browser);
    createSpamFixture(browser, word);
    waitForFetchIdle(browser, 0, (ready) => {
      if (!ready) return browser.end();
      applySearch(browser, word);
      waitForSearchMatch(browser, word, 0, () => browser.end());
    });
  },
};
