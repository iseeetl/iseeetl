const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { clickSingleVisible } = require('../../helpers/dialog-focus');
const {
  closeSoundCautionIfVisible,
  createFloor,
  loginByForm,
  logoutIfPossible,
  openFloorList,
  waitForFloorTitle,
  waitForUserRole,
} = require('../../helpers/guest-helpers');

const FIXTURE_COUNT = 11;
const FLOOR_PAGE_SIZE = 9;
const MANAGEMENT_PAGE_SIZE = 10;

const updateFloorSearch = (browser, value) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/page/1?q=${encodeURIComponent(value)}`)
    .waitForElementVisible('#search_floor_input', 10000)
    .waitForElementNotPresent('#search_floor_input[disabled]', 20000);
};

const readFloorPage = (browser, callback, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const current = document.querySelector('.pager-current-page');
      const titles = Array.from(document.querySelectorAll('h2.floor-title')).map((node) =>
        node.textContent ? node.textContent.trim() : ''
      );
      const pageNumbers = Array.from(document.querySelectorAll('.pager a, .pager .pager-current-page'))
        .map((node) => (node.textContent || '').trim())
        .filter((value) => /^\d+$/.test(value))
        .map(Number);
      return {
        currentPage: current ? Number(current.textContent.trim()) : 0,
        lastPage: pageNumbers.length ? Math.max(...pageNumbers) : 0,
        titles: titles.filter(Boolean),
        query: window.location.search,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.currentPage > 0 && state.lastPage > 0) {
        callback(state);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `フロア一覧のページが表示可能になりませんでした: ${JSON.stringify(state)}`);
        callback(state);
        return;
      }
      browser.pause(500, () => readFloorPage(browser, callback, attempt + 1));
    }
  );
};

const navigateViaFloorPageLink = (browser, page, searchTerm) => {
  browser.execute(
    function (payload) {
      const candidates = Array.from(document.querySelectorAll('.pager a')).filter((link) => {
        const visible = !!(link.offsetParent || link.getClientRects().length);
        if (!visible || link.getAttribute('aria-disabled') === 'true') return false;
        const target = new URL(link.href, window.location.href);
        return link.textContent.trim() === String(payload.page) && target.pathname === `/page/${payload.page}`;
      });
      if (candidates.length !== 1) {
        return { count: candidates.length, href: '', pathname: '', query: '', sameOrigin: false };
      }
      const target = new URL(candidates[0].href, window.location.href);
      return {
        count: 1,
        href: target.href,
        pathname: target.pathname,
        query: target.searchParams.get('q') || '',
        sameOrigin: target.origin === window.location.origin,
      };
    },
    [{ page, searchTerm }],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.equal(state.count, 1, `フロア一覧の${page}ページへのリンクが、表示かつ有効の状態で1件あります。`);
      browser.assert.equal(state.pathname, `/page/${page}`, `フロア一覧の${page}ページへのリンクが、想定した遷移先です。`);
      browser.assert.equal(state.query, searchTerm, `フロア一覧の${page}ページへのリンクが、検索条件を維持しています。`);
      browser.assert.equal(state.sameOrigin, true, `フロア一覧の${page}ページへのリンクが、同じアプリのオリジンを参照しています。`);
      if (
        state.count === 1 &&
        state.pathname === `/page/${page}` &&
        state.query === searchTerm &&
        state.sameOrigin === true
      ) {
        navigateToApp(browser, state.href);
      }
    }
  );
};

const waitForFloorPage = (browser, expectedPage, searchTerm, callback, attempt = 0) => {
  const maxAttempts = 20;
  readFloorPage(browser, (state) => {
    const query = new URLSearchParams((state.query || '').replace(/^\?/, ''));
    const expectedCount = expectedPage === 1 ? FLOOR_PAGE_SIZE : FIXTURE_COUNT - FLOOR_PAGE_SIZE;
    const fixtureResponseReady =
      state.lastPage === 2 &&
      state.titles.length === expectedCount &&
      state.titles.every((title) => title.indexOf(searchTerm) !== -1);
    if (state.currentPage === expectedPage && query.get('q') === searchTerm && fixtureResponseReady) {
      browser.assert.ok(true, `フロア一覧のページを確認しました: page=${expectedPage}, q=${searchTerm}`);
      callback(state);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `フロア一覧のページが確定しませんでした: ${JSON.stringify(state)}`);
      callback(state);
      return;
    }
    browser.pause(500, () => waitForFloorPage(browser, expectedPage, searchTerm, callback, attempt + 1));
  });
};

const openFloorManagement = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/management/floor`).waitForElementVisible('.floor-management-table', 20000);
};

const updateManagementSearch = (browser, value) => {
  const input = '#management-search-input';
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/management/floor?q=${encodeURIComponent(value)}`)
    .waitForElementVisible(input, 10000)
    .waitForElementNotPresent(`${input}[disabled]`, 20000);
};

const readManagementPage = (browser, callback, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const current = document.querySelector('.pager button.pager-current-page');
      const rows = Array.from(document.querySelectorAll('table.floor-management-table tbody tr')).filter((row) =>
        row.querySelector('td')
      );
      const titles = rows
        .map((row) => {
          const cell = row.querySelector('td');
          return cell && cell.textContent ? cell.textContent.trim() : '';
        })
        .filter(Boolean);
      const pageNumbers = Array.from(document.querySelectorAll('.pager button'))
        .map((node) => (node.textContent || '').trim())
        .filter((value) => /^\d+$/.test(value))
        .map(Number);
      return {
        currentPage: current ? Number(current.textContent.trim()) : 0,
        lastPage: pageNumbers.length ? Math.max(...pageNumbers) : 0,
        titles,
        query: window.location.search,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.currentPage > 0 && state.lastPage > 0) {
        callback(state);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `管理画面のページが表示可能になりませんでした: ${JSON.stringify(state)}`);
        callback(state);
        return;
      }
      browser.pause(500, () => readManagementPage(browser, callback, attempt + 1));
    }
  );
};

const waitForManagementPage = (browser, expectedPage, searchTerm, callback, attempt = 0) => {
  const maxAttempts = 20;
  readManagementPage(browser, (state) => {
    const query = new URLSearchParams((state.query || '').replace(/^\?/, ''));
    const expectedCount = expectedPage === 1 ? MANAGEMENT_PAGE_SIZE : FIXTURE_COUNT - MANAGEMENT_PAGE_SIZE;
    const fixtureResponseReady =
      state.lastPage === 2 &&
      state.titles.length === expectedCount &&
      state.titles.every((title) => title.indexOf(searchTerm) !== -1);
    if (state.currentPage === expectedPage && query.get('q') === searchTerm && fixtureResponseReady) {
      browser.assert.ok(true, `管理画面のページを確認しました: page=${expectedPage}, q=${searchTerm}`);
      callback(state);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `管理画面のページが確定しませんでした: ${JSON.stringify(state)}`);
      callback(state);
      return;
    }
    browser.pause(500, () => waitForManagementPage(browser, expectedPage, searchTerm, callback, attempt + 1));
  });
};

const clickManagementNextPage = (browser) => {
  clickSingleVisible(
    browser,
    '.pager.pager--management button[aria-label="2ページ"]',
    '管理画面の2ページ目'
  );
};

const assertExactFixtureSet = (browser, firstPageTitles, secondPageTitles, fixtureTitles, label) => {
  const combined = firstPageTitles.concat(secondPageTitles);
  const unique = new Set(combined);
  browser.assert.equal(unique.size, combined.length, `${label}: ページ間でフロアが重複していません。`);
  browser.assert.deepEqual(
    combined.slice().sort(),
    fixtureTitles.slice().sort(),
    `${label}: すべてのテストデータがページに含まれています。`
  );
};

module.exports = {
  'フロア一覧と管理一覧でページを切り替えられる': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const searchTerm = `P2${Date.now().toString(36).slice(-8)}`;
    const fixtureTitles = Array.from(
      { length: FIXTURE_COUNT },
      (_, index) => `${searchTerm}-${String(index + 1).padStart(2, '0')}`
    );
    let floorFirstPageTitles = [];
    let managementFirstPageTitles = [];

    loginByForm(browser, { mail: editorMail, password: editorPassword });
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    openFloorList(browser);

    fixtureTitles.forEach((title) => {
      createFloor(browser, title);
      waitForFloorTitle(browser, title, true);
    });

    updateFloorSearch(browser, searchTerm);
    waitForFloorPage(browser, 1, searchTerm, (state) => {
      floorFirstPageTitles = state.titles;
      browser.assert.equal(state.lastPage, 2, 'フロア一覧は2ページあります。');
      browser.assert.equal(state.titles.length, FLOOR_PAGE_SIZE, 'フロア一覧の1ページ目は表示件数の上限まで埋まっています。');
      navigateViaFloorPageLink(browser, 2, searchTerm);
    });

    waitForFloorPage(browser, 2, searchTerm, (state) => {
      browser.assert.equal(
        state.titles.length,
        FIXTURE_COUNT - FLOOR_PAGE_SIZE,
        'フロア一覧の2ページ目に残りの項目が表示されています。'
      );
      assertExactFixtureSet(browser, floorFirstPageTitles, state.titles, fixtureTitles, 'フロア一覧');
    });

    logoutIfPossible(browser);
    loginByForm(browser, { mail: adminMail, password: adminPassword });
    closeSoundCautionIfVisible(browser);
    waitForUserRole(browser, 'Administrator');
    openFloorManagement(browser);
    updateManagementSearch(browser, searchTerm);

    waitForManagementPage(browser, 1, searchTerm, (state) => {
      managementFirstPageTitles = state.titles;
      browser.assert.equal(state.lastPage, 2, '管理画面の一覧は2ページあります。');
      browser.assert.equal(state.titles.length, MANAGEMENT_PAGE_SIZE, '管理画面の1ページ目は表示件数の上限まで埋まっています。');
      clickManagementNextPage(browser);
    });

    waitForManagementPage(browser, 2, searchTerm, (state) => {
      browser.assert.equal(
        state.titles.length,
        FIXTURE_COUNT - MANAGEMENT_PAGE_SIZE,
        '管理画面の2ページ目に残りの項目が表示されています。'
      );
      assertExactFixtureSet(browser, managementFirstPageTitles, state.titles, fixtureTitles, '管理画面の一覧');
      browser.end();
    });
  },
};
