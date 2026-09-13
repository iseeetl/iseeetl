const { getBaseUrl } = require('../../helpers/login');
const { clickExactAccountSubmit } = require('../../helpers/account-submit');

const COOKIE_POLICY_LINK_SELECTOR = '[data-testid="register-cookie-policy-link"]';

const openRegister = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/register`;
  browser.url(url).waitForElementVisible('#username', 10000);
};

const verifyCookiePolicyLink = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const expectedCookieUrl = `${base}/cookie`;

  browser
    .waitForElementVisible(COOKIE_POLICY_LINK_SELECTOR, 10000)
    .execute(
      function (selector, expectedUrl) {
        const visibleLinks = Array.from(document.querySelectorAll(selector)).filter(
          (node) => node.offsetParent || node.getClientRects().length
        );
        const link = visibleLinks.length === 1 ? visibleLinks[0] : null;
        const terms = document.querySelector('#terms');
        const termsLabel = terms ? document.querySelector('label[for="terms"]') : null;
        const linkText = link?.textContent?.trim() || '';
        let destination = null;
        try {
          destination = link ? new URL(link.href, window.location.origin) : null;
        } catch (_error) {
          destination = null;
        }
        const relTokens = new Set((link?.rel || '').split(/\s+/).filter(Boolean));
        const termsText = `${terms?.getAttribute('aria-label') || ''} ${
          termsLabel?.textContent || ''
        }`;
        return {
          exactlyOneVisible: visibleLinks.length === 1,
          exactDestination: destination?.href === expectedUrl,
          sameOrigin: destination?.origin === window.location.origin,
          noCredentials: Boolean(destination && !destination.username && !destination.password),
          noQueryOrHash: destination?.search === '' && destination?.hash === '',
          opensSafely:
            link?.target === '_blank' && relTokens.has('noopener') && relTokens.has('noreferrer'),
          includedInRequiredConsent: Boolean(
            link && !link.closest('label') && linkText && termsText.includes(linkText)
          ),
          noAnalyticsConsentInput: !document.querySelector(
            '[data-testid="analytics-consent-banner"], input[name="analytics-consent"]'
          ),
        };
      },
      [COOKIE_POLICY_LINK_SELECTOR, expectedCookieUrl],
      (result) => {
        const state = result?.value || {};
        browser.assert.equal(
          state.exactlyOneVisible &&
            state.exactDestination &&
            state.sameOrigin &&
            state.noCredentials &&
            state.noQueryOrHash &&
            state.opensSafely &&
            state.includedInRequiredConsent &&
            state.noAnalyticsConsentInput,
          true,
          '登録画面の必須の同意欄に、同一オリジンの安全なCookieポリシーリンクが1件あります。'
        );
      }
    );
};

const openCookiePolicy = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const expectedCookieUrl = `${base}/cookie`;
  browser
    .url(expectedCookieUrl)
    .assert.urlEquals(expectedCookieUrl)
    .waitForElementVisible('.view-title', 10000)
    .waitForElementVisible(
      '.view-content a[href^="https://policies.google.com/technologies/partner-sites"]',
      10000
    );
};

const installSnackbarWatcher = (browser) => {
  browser.execute(function () {
    if (window.__snackbarWatcherInstalled) return;
    window.__snackbarMessages = window.__snackbarMessages || [];
    const collectMessages = () => {
      ['[data-testid="app-snackbar"] span', '.screen-reader-only[role="alert"]'].forEach((selector) => {
        const node = document.querySelector(selector);
        const message = node && node.textContent ? node.textContent.trim() : '';
        if (message && window.__snackbarMessages[window.__snackbarMessages.length - 1] !== message) {
          window.__snackbarMessages.push(message);
        }
      });
    };
    window.__snackbarWatcherInstalled = true;
    new MutationObserver(collectMessages).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    collectMessages();
  });
};

const waitForSubmitEnabled = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const button = document.querySelector('[data-testid="account-submit"]');
      return { present: !!button, disabled: button ? button.hasAttribute('disabled') : null };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { present: false, disabled: null };
      if (state.present && state.disabled === false) {
        browser.assert.ok(true, '登録ボタンが有効です。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `登録ボタンが有効になりませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForSubmitEnabled(browser, attempt + 1));
    }
  );
};

const waitForFieldError = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (inputSelector) {
      const input = document.querySelector(inputSelector);
      if (!input) return { present: false, text: '' };
      const describedBy = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const error = describedBy
        .map((id) => document.getElementById(id))
        .find((node) => node && node.getAttribute('role') === 'alert');
      const text = error ? error.textContent.trim() : '';
      const visible = !!(error && (error.offsetParent || error.getClientRects().length));
      return { present: !!error, text, visible };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { present: false, text: '', visible: false };
      if (state.present && state.visible && state.text) {
        browser.assert.ok(true, `入力欄のエラーが表示されています${label ? ` (${label})` : ''}: ${state.text}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `入力欄のエラーが表示されませんでした${label ? ` (${label})` : ''}: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForFieldError(browser, selector, label, attempt + 1));
    }
  );
};

const waitForSnackbar = (browser, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const history = Array.isArray(window.__snackbarMessages) ? window.__snackbarMessages.slice(-5) : [];
      return { history };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      const history = Array.isArray(state.history) ? state.history : [];
      const message = history.find((entry) => Boolean(entry)) || '';
      if (message) {
        browser.assert.ok(true, `${label}: 入力検証の通知文を取得できました。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${label}: 入力検証の通知文を取得できませんでした。`);
        return;
      }
      browser.pause(500, () => waitForSnackbar(browser, label, attempt + 1));
    }
  );
};

const resetSnackbarHistory = (browser) => {
  browser.execute(function () {
    window.__snackbarMessages = [];
  });
};

const waitForTermsRejection = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const history = Array.isArray(window.__snackbarMessages) ? window.__snackbarMessages : [];
      const terms = document.querySelector('#terms');
      const visibleFieldErrors = Array.from(document.querySelectorAll('[role="alert"]')).filter((node) => {
        return node.closest('.ui-field') && (node.offsetParent || node.getClientRects().length);
      });
      return {
        feedbackAnnounced: history.some((entry) => Boolean(entry)),
        termsUnchecked: Boolean(terms && !terms.checked),
        visibleFieldErrorCount: visibleFieldErrors.length,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      const rejected = state.feedbackAnnounced && state.termsUnchecked && state.visibleFieldErrorCount === 0;
      if (rejected) {
        browser.assert.ok(true, '入力が正しくても規約への同意がない場合は登録を拒否し、理由を読み上げます。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `規約未同意による拒否を確認できませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForTermsRejection(browser, attempt + 1));
    }
  );
};

module.exports = {
  '@tags': ['mail-capture-enabled'],
  'ユーザ登録では必須項目の入力と利用規約への同意を求める': (browser) => {
    openRegister(browser);
    verifyCookiePolicyLink(browser);
    installSnackbarWatcher(browser);
    waitForSubmitEnabled(browser);
    clickExactAccountSubmit(browser, {
      expectedInputs: [
        { selector: '#username', value: '' },
        { selector: '#mail', value: '' },
        { selector: '#password', value: '' },
      ],
      expectedChecks: [{ selector: '#terms', checked: false }],
      submitSelector: '[data-testid="account-submit"]',
      label: '登録の必須項目の検証',
    });

    waitForFieldError(browser, '#username', 'username');
    waitForFieldError(browser, '#mail', 'mail');
    waitForFieldError(browser, '#password', 'password');
    waitForSnackbar(browser, '必須項目');

    browser
      .clearValue('#username')
      .setValue('#username', 'E2E User')
      .clearValue('#mail')
      .setValue('#mail', 'e2e@example.com')
      .clearValue('#password')
      .setValue('#password', 'Passw0rd');

    resetSnackbarHistory(browser);
    clickExactAccountSubmit(browser, {
      expectedInputs: [
        { selector: '#username', value: 'E2E User' },
        { selector: '#mail', value: 'e2e@example.com' },
        { selector: '#password', value: 'Passw0rd' },
      ],
      expectedChecks: [{ selector: '#terms', checked: false }],
      submitSelector: '[data-testid="account-submit"]',
      label: '登録の規約同意の検証',
    });
    waitForTermsRejection(browser);
    openCookiePolicy(browser);

    browser.end();
  },
};
