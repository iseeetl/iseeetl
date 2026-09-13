const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');

const openFloorList = (browser) => {
  const base = getBaseUrl(browser);
  navigateToApp(browser, base).waitForElementVisible('.view-header h1.view-title', 10000);
};

const waitForSearchMatch = (browser, term, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (keyword) {
      const titles = Array.from(document.querySelectorAll('.floor-title')).map((el) => (el.textContent || '').trim());
      const normalizedKeyword = (keyword || '').toLowerCase();
      const match = titles.some((title) => title.toLowerCase() === normalizedKeyword);
      return { match, first: titles[0] || '' };
    },
    [term],
    (result) => {
      const state = result && result.value ? result.value : { match: false, first: '' };
      if (state.match) {
        browser.assert.ok(true, `検索結果が一致しました: ${state.first}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `検索結果が一致しません: ${state.first}`);
        return;
      }
      browser.pause(500, () => waitForSearchMatch(browser, term, attempt + 1));
    }
  );
};

module.exports = {
  'フロア一覧を表示する': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Floor List Floor ${stamp}`;
    const roomTitle = `E2E Floor List Room ${stamp}`;
    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
        return;
      }

      openFloorList(browser);
      browser
        .waitForElementVisible('.card-wrapper', 10000)
        .waitForElementVisible('#search_floor_input', 10000)
        .clearValue('#search_floor_input')
        .setValue('#search_floor_input', floorTitle)
        .click('.search-floor-button');

      waitForSearchMatch(browser, floorTitle);
      browser.waitForElementVisible('.pager', 10000);
      assertAccessibilityIntegrity(browser, {
        rootSelector: '#app_container',
        label: 'フロア一覧',
        checkControlNames: true,
      });
      browser.end();
    });
  },
};
