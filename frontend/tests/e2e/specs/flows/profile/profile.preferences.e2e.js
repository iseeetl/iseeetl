const fs = require('fs');
const path = require('path');
const { requireEnv } = require('../../helpers/login');
const {
  openProfileFromMenu,
  reopenProfileView,
  waitForSnackbar,
  clickExactProfileSave,
} = require('../../helpers/profile-helpers');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');

const SAMPLE_ICON_PATH = path.resolve(__dirname, '../../../fixtures/images/sample-image.png');

const readPreferenceState = (browser, onRead) => {
  browser.execute(
    function () {
      const lang = document.querySelector('#lang');
      const eye = document.querySelector('#eye_friendly_mode');
      return {
        lang: lang ? lang.value : '',
        eyeFriendlyMode: eye ? !!eye.checked : false,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { lang: '', eyeFriendlyMode: false };
      onRead(state);
    }
  );
};

const waitForPreferenceState = (browser, expected, onDone, attempt = 0) => {
  const maxAttempts = 12;
  readPreferenceState(browser, (state) => {
    const matched = state.lang === expected.lang && state.eyeFriendlyMode === expected.eyeFriendlyMode;
    if (matched) {
      browser.assert.ok(true, `表示設定を確認しました: lang=${state.lang} eyeFriendly=${state.eyeFriendlyMode}`);
      onDone(true);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `表示設定が一致しません: ${JSON.stringify(state)}`);
      onDone(false);
      return;
    }
    browser.pause(500, () => waitForPreferenceState(browser, expected, onDone, attempt + 1));
  });
};

const setLanguage = (browser, lang) => {
  browser.execute(
    function (nextLang) {
      const select = document.querySelector('#lang');
      if (!select) return { ok: false, reason: 'lang-select-not-found' };
      const hasOption = Array.from(select.options).some((opt) => opt.value === nextLang);
      if (!hasOption) return { ok: false, reason: 'lang-option-not-found' };
      select.value = nextLang;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: select.value };
    },
    [lang],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'unknown' };
      if (!state.ok || state.value !== lang) {
        browser.assert.ok(false, `言語を設定できませんでした: ${state.reason || state.value || 'unknown'}`);
      }
    }
  );
};

const setEyeFriendlyMode = (browser, enabled) => {
  browser.execute(
    function (nextValue) {
      const checkbox = document.querySelector('#eye_friendly_mode');
      if (!checkbox) return { ok: false, reason: 'eye-friendly-checkbox-not-found' };
      if (checkbox.checked !== !!nextValue) {
        checkbox.click();
      }
      return { ok: true, checked: !!checkbox.checked };
    },
    [enabled],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'unknown' };
      if (!state.ok || state.checked !== enabled) {
        browser.assert.ok(false, `目にやさしいモードを設定できませんでした: ${state.reason || state.checked}`);
      }
    }
  );
};

const verifyIconPreviewCycle = (browser) => {
  browser.setValue('#image-file', SAMPLE_ICON_PATH);
  browser.waitForElementVisible('.avatar-preview-wrapper img', 10000);
  browser.click('.avatar-preview-wrapper .avatar-remove-button');
  browser.waitForElementNotPresent('.avatar-preview-wrapper img', 10000);
  browser.assert.ok(true, 'プロフィール画像のプレビューの選択・削除が完了しました。');
};

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'プロフィールの言語・目に優しい表示・画像プレビューを変更できる': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');

    if (!fs.existsSync(SAMPLE_ICON_PATH)) {
      browser.assert.ok(false, `プロフィール画像のプレビュー用テストデータがありません: ${SAMPLE_ICON_PATH}`);
      browser.end();
      return;
    }

    loginByForm(browser, { mail, password });
    waitForUserRole(browser, 'Author');
    openProfileFromMenu(browser);
    verifyIconPreviewCycle(browser);

    readPreferenceState(browser, (original) => {
      const nextLang = original.lang === 'en' ? 'ja' : 'en';
      const nextEyeFriendly = !original.eyeFriendlyMode;

      setLanguage(browser, nextLang);
      setEyeFriendlyMode(browser, nextEyeFriendly);
      clickExactProfileSave(browser, {
        expectedControls: [
          { selector: '#lang', value: nextLang },
          { selector: '#eye_friendly_mode', property: 'checked', value: nextEyeFriendly },
        ],
        label: 'プロフィールの表示設定の更新',
      });
      waitForSnackbar(browser);
      reopenProfileView(browser);
      waitForPreferenceState(browser, { lang: nextLang, eyeFriendlyMode: nextEyeFriendly }, () => browser.end());
    });
  },
};
