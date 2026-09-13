const { getBaseUrl } = require('../../helpers/login');

module.exports = {
  '@tags': ['core-all-off'],

  '無効な外部サービスのログイン操作を隠し、通常ログインは利用できる': (browser) => {
    const baseUrl = getBaseUrl(browser).replace(/\/$/, '');

    browser
      .url(`${baseUrl}/login`)
      .waitForElementVisible('#mail', 10000)
      .waitForElementVisible('#password', 10000)
      .waitForElementVisible('[data-testid="login-submit"]', 10000)
      .waitForElementVisible('[data-testid="login-consent-notice"]', 10000)
      .waitForElementVisible('[data-testid="login-consent-terms-link"]', 10000)
      .waitForElementVisible('[data-testid="login-consent-privacy-link"]', 10000)
      .waitForElementVisible('[data-testid="login-cookie-policy-link"]', 10000)
      .assert.not.elementPresent('.capability-error')
      .assert.not.elementPresent('.oauth-block')
      .assert.not.elementPresent('.line-login-btn')
      .end();
  },
};
