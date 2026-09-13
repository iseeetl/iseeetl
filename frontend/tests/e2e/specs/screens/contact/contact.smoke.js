const { getBaseUrl } = require('../../helpers/login');

module.exports = {
  'お問い合わせ画面を表示する': (browser) => {
    const base = getBaseUrl(browser);
    const url = `${base.replace(/\/$/, '')}/contact`;
    browser.url(url).waitForElementVisible('.view-header h1.view-title', 10000).end();
  },
};
