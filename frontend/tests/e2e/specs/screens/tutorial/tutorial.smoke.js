const { getBaseUrl } = require('../../helpers/login');

module.exports = {
  'チュートリアル画面を表示する': (browser) => {
    const base = getBaseUrl(browser);
    const url = `${base.replace(/\/$/, '')}/tutorial`;
    browser.url(url).waitForElementVisible('.view-header h1.view-title', 10000).end();
  },
};
