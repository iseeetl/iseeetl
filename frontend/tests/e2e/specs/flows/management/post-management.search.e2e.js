const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { createTimelineGuestPostsByApiActor } = require('../../helpers/timeline-api-actor');

const FIXTURE_COUNT = 11;
const MANAGEMENT_PAGE_SIZE = 10;

const openPostManagement = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/management/post`)
    .waitForElementVisible('#management-search-input', 10000)
    .waitForElementVisible('table.management-table', 10000)
    .waitForElementNotPresent('#management-search-input[disabled]', 10000);
};

const applySearch = (browser, term) => {
  browser
    .clearValue('#management-search-input')
    .setValue('#management-search-input', term);
  clickSingleVisibleAfterExactControls(browser, {
    rootSelector: '.view-content',
    expectedControls: [{ selector: '#management-search-input', value: term }],
    submitSelector: '[data-testid="management-search-submit"]',
    label: '投稿管理の検索',
  });
};

const readPageState = (browser, callback) => {
  browser.execute(
    function () {
      const current = document.querySelector('.pager button.pager-current-page');
      const pageNumbers = Array.from(document.querySelectorAll('.pager button'))
        .map(function (node) {
          return (node.textContent || '').trim();
        })
        .filter(function (value) {
          return /^\d+$/.test(value);
        })
        .map(Number);
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'))
        .map(function (row) {
          const cells = row.querySelectorAll('td');
          const contextValues =
            cells.length > 0 ? Array.from(cells[0].querySelectorAll('span[dir="auto"]')) : [];
          const content = cells.length > 1 ? cells[1].querySelector('span[dir="auto"]') : null;
          return {
            guestName: contextValues.length
              ? (contextValues[contextValues.length - 1].textContent || '').trim()
              : '',
            content: content ? (content.textContent || '').trim() : '',
          };
        })
        .filter(function (row) {
          return row.content.length > 0;
        });
      const view = document.querySelector('.view');
      const query = new URLSearchParams(window.location.search);
      return {
        ready: !!view && view.getAttribute('aria-busy') === 'false',
        currentPage: current ? Number((current.textContent || '').trim()) : 0,
        lastPage: pageNumbers.length ? Math.max.apply(null, pageNumbers) : 0,
        queryPage: query.get('page'),
        querySearch: query.get('q'),
        rows,
      };
    },
    [],
    (result) => callback(result && result.value ? result.value : {})
  );
};

const waitForFixturePage = (
  browser,
  { expectedPage, guestName, expectedCount },
  callback,
  attempt = 0
) => {
  const maxAttempts = 20;
  readPageState(browser, (state) => {
    const ready =
      state.ready === true &&
      state.currentPage === expectedPage &&
      state.lastPage === 2 &&
      state.queryPage === String(expectedPage) &&
      state.querySearch === guestName &&
      Array.isArray(state.rows) &&
      state.rows.length === expectedCount &&
      state.rows.every((row) => row.guestName === guestName);
    if (ready) {
      browser.assert.ok(
        true,
        `投稿管理のテストデータのページを確認しました: page=${expectedPage}, q=${guestName}`
      );
      callback(state);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `投稿管理のテストデータのページが確定しませんでした: ${JSON.stringify(state)}`);
      callback(state);
      return;
    }
    browser.pause(300, () =>
      waitForFixturePage(browser, { expectedPage, guestName, expectedCount }, callback, attempt + 1)
    );
  });
};

const clickSecondPage = (browser) => {
  browser.execute(
    function () {
      const candidates = Array.from(document.querySelectorAll('.pager button')).filter(function (button) {
        const visible = !!(button.offsetParent || button.getClientRects().length);
        return visible && !button.disabled && (button.textContent || '').trim() === '2';
      });
      if (candidates.length !== 1) return { clicked: false, candidateCount: candidates.length };
      candidates[0].click();
      return { clicked: true, candidateCount: 1 };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, candidateCount: 0 };
      browser.assert.ok(
        state.clicked && state.candidateCount === 1,
        `有効な2ページ目のボタンを1件だけクリックしました（count=${state.candidateCount}）。`
      );
    }
  );
};

const assertExactFixtureSet = (browser, firstPageRows, secondPageRows, fixtureContents) => {
  const contents = firstPageRows.concat(secondPageRows).map((row) => row.content);
  browser.assert.equal(
    new Set(contents).size,
    contents.length,
    '投稿管理のページ間でテストデータが重複していません。'
  );
  browser.assert.deepEqual(
    contents.slice().sort(),
    fixtureContents.slice().sort(),
    '投稿管理のページに対象のテストデータがすべて含まれています。'
  );
};

module.exports = {
  '投稿管理で検索とページ切替ができる': (browser) => {
    const stamp = Date.now().toString(36).slice(-8);
    const floorTitle = `E2E Post Search Floor ${stamp}`;
    const roomTitle = `E2E Post Search Room ${stamp}`;
    const guestName = `E2EPost${stamp}`;
    const fixtureContents = Array.from(
      { length: FIXTURE_COUNT },
      (_, index) => `E2E Post Search ${stamp}-${String(index + 1).padStart(2, '0')}`
    );
    let firstPageRows = [];

    runManagementFlowWithPreparedFloorRoom(
      browser,
      'Post Management Search',
      ({ floorId, roomId, finish }) => {
        createTimelineGuestPostsByApiActor(
          browser,
          {
            floorId,
            floorTitle,
            roomId,
            roomTitle,
            guestName,
            contents: fixtureContents,
          },
          '投稿管理の検索用テストデータ'
        );
        openPostManagement(browser);
        applySearch(browser, guestName);
        waitForFixturePage(
          browser,
          { expectedPage: 1, guestName, expectedCount: MANAGEMENT_PAGE_SIZE },
          (state) => {
            firstPageRows = state.rows;
            browser.assert.equal(
              state.rows.length,
              MANAGEMENT_PAGE_SIZE,
              '投稿管理の1ページ目は表示件数の上限まで埋まっています。'
            );
            clickSecondPage(browser);
            waitForFixturePage(
              browser,
              {
                expectedPage: 2,
                guestName,
                expectedCount: FIXTURE_COUNT - MANAGEMENT_PAGE_SIZE,
              },
              (secondPageState) => {
                browser.assert.equal(
                  secondPageState.rows.length,
                  FIXTURE_COUNT - MANAGEMENT_PAGE_SIZE,
                  '投稿管理の2ページ目に残りの項目が表示されています。'
                );
                assertExactFixtureSet(
                  browser,
                  firstPageRows,
                  secondPageState.rows,
                  fixtureContents
                );
                finish();
              }
            );
          }
        );
      },
      { floorTitle, roomTitle }
    );
  },
};
