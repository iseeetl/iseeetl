const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { waitForPath } = require('../../helpers/auth-security');

const INVALID_PAGE_PARAMS = ['foo', '0', '-1', '1.5'];

module.exports = {
  'フロア一覧のページ指定が不正なら有効な値へ補正する': (browser) => {
    const base = getBaseUrl(browser).replace(/\/$/, '');
    const search = '?q=e2e-invalid-page';

    INVALID_PAGE_PARAMS.forEach((page) => {
      navigateToApp(browser, `${base}/page/${encodeURIComponent(page)}${search}`).waitForElementVisible(
        '#search_floor_input',
        10000
      );
      waitForPath(browser, '/page/1', search);
    });

    browser.end();
  },
};
