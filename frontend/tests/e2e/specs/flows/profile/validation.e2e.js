const { requireEnv } = require('../../helpers/login');
const { openProfileFromMenu, clickExactProfileSave } = require('../../helpers/profile-helpers');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');

const waitForUsernameStable = (browser, attempt, lastValue, onReady) => {
  const maxAttempts = 10;
  browser.getValue('#username', (result) => {
    const current = result && typeof result.value === 'string' ? result.value : '';
    if (lastValue !== null && current === lastValue) {
      if (onReady) onReady();
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, 'ユーザ名の値が確定しませんでした。');
      if (onReady) onReady();
      return;
    }
    browser.pause(500, () => waitForUsernameStable(browser, attempt + 1, current, onReady));
  });
};

const clearUsername = (browser, onCleared) => {
  browser.execute(
    function () {
      const input = document.querySelector('#username');
      if (!input) return { ok: false };
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('blur', { bubbles: true }));
      return { ok: true, value: input.value };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false };
      if (!state.ok) {
        browser.assert.ok(false, 'ユーザ名の入力欄が見つかりません。');
        return;
      }
      if (state.value !== '') {
        browser.assert.ok(false, 'ユーザ名の入力欄が空になりませんでした。');
      }
      if (onCleared) onCleared();
    }
  );
};

const waitForValidationFeedback = (browser) => {
  browser.waitForElementVisible('#username-error', 5000).getText('#username-error', (result) => {
    const text = result && typeof result.value === 'string' ? result.value.trim() : '';
    browser.assert.ok(Boolean(text), 'ユーザ名のエラーメッセージが空ではありません。');
  });
  browser.getAttribute('#username', 'aria-invalid', (result) => {
    browser.assert.equal(result && result.value, 'true', 'ユーザ名が無効として示されています。');
  });
  browser.getAttribute('#username', 'aria-describedby', (result) => {
    const describedBy = result && typeof result.value === 'string' ? result.value.split(/\s+/).filter(Boolean) : [];
    browser.assert.ok(describedBy.includes('username-error'), 'ユーザ名の入力欄がエラーメッセージを参照しています。');
  });
};

module.exports = {
  'プロフィールのユーザ名を空にして保存できない': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');

    loginByForm(browser, { mail, password });
    waitForUserRole(browser, 'Author');
    openProfileFromMenu(browser);
    assertAccessibilityIntegrity(browser, {
      rootSelector: '#app_container',
      label: 'プロフィールのフォーム',
      checkControlNames: true,
    });

    waitForUsernameStable(browser, 0, null, () => {
      clearUsername(browser, () => {
        clickExactProfileSave(browser, {
          expectedControls: [{ selector: '#username', value: '' }],
          label: 'プロフィールのユーザ名の入力検証',
        });
        waitForValidationFeedback(browser);
        browser.end();
      });
    });
  },
};
