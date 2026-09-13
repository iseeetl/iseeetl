const { getBaseUrl } = require('../../helpers/login');

module.exports = {
  '利用規約画面を表示する': (browser) => {
    const baseUrl = getBaseUrl(browser);
    const url = `${baseUrl.replace(/\/$/, '')}/terms`;
    browser.url(url).waitForElementVisible('.view-header h1', 10000).end();
  },
};
