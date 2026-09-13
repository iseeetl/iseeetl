// 既存データを変更せず、一致しない検索語での検索と解除で一覧表示を検証する。
const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { loginAsAdmin } = require('../../helpers/management-row-keyboard');

const VIEW_READY = '.view[aria-busy="false"]';
const RESULT_REGION = '#management-list-results';
const SEARCH_INPUT = '#management-search-input';
const SEARCH_SUBMIT = '[data-testid="management-search-submit"]';
const SEARCH_CLEAR = '[data-testid="management-search-clear"]';
const EMPTY = '[data-testid="management-list-empty"]';

const assertLayoutAndSemantics = (browser, label) => {
  browser.execute(
    function (selectors) {
      const input = document.querySelector(selectors.input);
      const form = input ? input.closest('form') : null;
      const submit = document.querySelector(selectors.submit);
      const region = document.querySelector(selectors.region);
      const labelElement = input && input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
      const pager = document.querySelector('.pager');
      const root = document.documentElement;
      const body = document.body;
      return {
        viewportWidth: window.innerWidth,
        documentFits: root.scrollWidth <= root.clientWidth && body.scrollWidth <= body.clientWidth,
        formFits: !form || form.scrollWidth <= form.clientWidth,
        regionFits: !region || region.scrollWidth <= region.clientWidth,
        hasRegion: !!region && region.getAttribute('role') === 'region',
        nativeSearchForm: !!form && form.getAttribute('role') === 'search' && input.type === 'search',
        labelled: !!labelElement,
        submitType: submit ? submit.getAttribute('type') : '',
        controlsResult:
          !!input &&
          !!submit &&
          input.getAttribute('aria-controls') === selectors.region.slice(1) &&
          submit.getAttribute('aria-controls') === selectors.region.slice(1),
        pagerFits: !pager || pager.scrollWidth <= pager.clientWidth,
      };
    },
    [{ input: SEARCH_INPUT, submit: SEARCH_SUBMIT, region: RESULT_REGION }],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(state.viewportWidth > 0 && state.viewportWidth <= 320, `${label}: 表示領域の幅は320 CSSピクセル以下です`);
      browser.assert.ok(state.documentFits, `${label}: ページ全体に横方向のはみ出しがありません`);
      browser.assert.ok(state.formFits, `${label}: 検索フォームに横方向のはみ出しがありません`);
      browser.assert.ok(state.regionFits, `${label}: 検索結果の領域に横方向のはみ出しがありません`);
      browser.assert.ok(state.hasRegion, `${label}: 検索結果の領域が表示されています`);
      browser.assert.ok(state.nativeSearchForm, `${label}: 検索フォームがHTMLのform要素で表示されています`);
      browser.assert.ok(state.labelled, `${label}: 入力欄がラベルと関連付けられています`);
      browser.assert.equal(state.submitType, 'submit', `${label}: 検索ボタンはtype=submitです`);
      browser.assert.ok(state.controlsResult, `${label}: 検索操作が検索結果の領域と関連付けられています`);
      browser.assert.ok(state.pagerFits, `${label}: ページ切り替えの表示時に横方向のはみ出しがありません`);
    }
  );
};

const assertClearedState = (browser, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (inputSelector) {
      const input = document.querySelector(inputSelector);
      const query = new URLSearchParams(window.location.search);
      const view = document.querySelector('.view');
      return {
        ready: !!view && view.getAttribute('aria-busy') === 'false',
        value: input ? input.value : null,
        hasQuery: query.has('q'),
        page: query.get('page'),
        focused: !!input && document.activeElement === input,
      };
    },
    [SEARCH_INPUT],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.ready && state.value === '' && !state.hasQuery && state.page === '1' && state.focused) {
        browser.assert.ok(true, 'クリア後に検索条件なしの1ページ目を取得し、入力欄へフォーカスを戻します');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `クリア後の状態が確定しませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(300, () => assertClearedState(browser, attempt + 1));
    }
  );
};

module.exports = {
  '管理一覧はデータを変更せず検索・条件解除ができ、狭い画面でも操作できる': (browser) => {
    const base = getBaseUrl(browser).replace(/\/$/, '');
    const term = `m${Date.now().toString(36).slice(-7)}`;

    loginAsAdmin(browser);
    navigateToApp(browser, `${base}/management/floor`)
      .waitForElementVisible(SEARCH_INPUT, 10000)
      .waitForElementVisible(RESULT_REGION, 10000)
      .waitForElementPresent(VIEW_READY, 20000)
      .resizeWindow(320, 800);

    assertLayoutAndSemantics(browser, '初期一覧');

    browser
      .clearValue(SEARCH_INPUT)
      .setValue(SEARCH_INPUT, term)
      .click(SEARCH_SUBMIT)
      .waitForElementVisible(EMPTY, 20000)
      .waitForElementPresent(VIEW_READY, 20000)
      .assert.urlContains('page=1')
      .assert.urlContains(`q=${encodeURIComponent(term)}`);

    assertLayoutAndSemantics(browser, '検索empty');
    browser.click(SEARCH_CLEAR);
    assertClearedState(browser);
    browser.end();
  },
};
