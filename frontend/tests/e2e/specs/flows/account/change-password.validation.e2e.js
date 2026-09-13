const { requireEnv } = require('../../helpers/login');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');
const { openProfileFromMenu } = require('../../helpers/profile-helpers');
const { clickExactAccountSubmit } = require('../../helpers/account-submit');

const CONFIRM_PASSWORD_MISMATCH_MESSAGE = '新しいパスワードと一致しません';

const openChangePassword = (browser) => {
  openProfileFromMenu(browser);
  browser.waitForElementVisible('.password-change-button', 10000).click('.password-change-button');
  browser.waitForElementVisible('#old-password', 10000);
};

const waitForConfirmPasswordError = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const input = document.querySelector('#confirm-password');
      if (!input) return { visible: false, text: '' };
      const describedBy = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const error = describedBy
        .map((id) => document.getElementById(id))
        .find((node) => node && node.getAttribute('role') === 'alert');
      const text = error && error.textContent ? error.textContent.trim() : '';
      const visible = !!error && error.offsetParent !== null && text.length > 0;
      return { visible, text };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { visible: false, text: '' };
      if (state.visible) {
        browser.assert.equal(
          state.text,
          CONFIRM_PASSWORD_MISMATCH_MESSAGE,
          '確認用パスワードの不一致メッセージが表示されています。'
        );
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '確認用パスワードのエラーが表示されませんでした。');
        return;
      }
      browser.pause(500, () => waitForConfirmPasswordError(browser, attempt + 1));
    }
  );
};

module.exports = {
  '確認用パスワードが一致しない場合は変更できない': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');

    loginByForm(browser, { mail, password });
    waitForUserRole(browser, 'Author');
    openChangePassword(browser);

    browser
      .setValue('#old-password', password)
      .setValue('#new-password', 'NewPass123')
      .setValue('#confirm-password', 'NewPass321');
    clickExactAccountSubmit(browser, {
      expectedInputs: [
        { selector: '#old-password', value: password },
        { selector: '#new-password', value: 'NewPass123' },
        { selector: '#confirm-password', value: 'NewPass321' },
      ],
      submitSelector: '[data-testid="account-submit"]',
      label: 'パスワード変更の入力検証',
    });

    waitForConfirmPasswordError(browser);
    browser.end();
  },
};
