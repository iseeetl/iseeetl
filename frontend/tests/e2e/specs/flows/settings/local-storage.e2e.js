const { getBaseUrl } = require('../../helpers/login');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const openSettings = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/setting`;
  browser.url(url).waitForElementVisible('#timeline_font_family', 10000);
};

const selectOption = (browser, selector, value, label) => {
  browser.execute(
    function (selectSelector, optionValue) {
      const select = document.querySelector(selectSelector);
      if (!select) return { selected: false, reason: 'select-not-found' };
      const option = Array.from(select.options).find((opt) => opt.value === optionValue);
      if (!option) return { selected: false, reason: 'option-not-found' };
      select.value = optionValue;
      select.dispatchEvent(new Event('change'));
      return { selected: true };
    },
    [selector, value],
    (result) => {
      const selected = result && result.value ? result.value.selected : false;
      if (!selected) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        const suffix = label ? ` (${label})` : '';
        browser.assert.ok(false, `選択肢を選べませんでした${suffix}: ${reason}`);
      }
    }
  );
};

const readSettingStorage = (browser, callback) => {
  browser.execute(
    function () {
      try {
        const raw = localStorage.getItem('iseeetl_setting');
        if (!raw) return { valid: false, family: '', size: '' };
        const settings = JSON.parse(raw);
        return {
          valid: !!settings && typeof settings === 'object',
          family: settings && typeof settings.timelineFontFamily === 'string' ? settings.timelineFontFamily : '',
          size: settings && typeof settings.timelineFontSize === 'string' ? settings.timelineFontSize : '',
        };
      } catch (_) {
        return { valid: false, family: '', size: '' };
      }
    },
    [],
    (result) => callback(result && result.value ? result.value : { valid: false, family: '', size: '' })
  );
};

const waitForSettingUpdate = (browser, expectedFamily, expectedSize, attempt = 0, onDone) => {
  const maxAttempts = 10;
  readSettingStorage(browser, (settings) => {
    if (settings.valid && settings.family === expectedFamily && settings.size === expectedSize) {
      browser.assert.equal(settings.family, expectedFamily, 'フォントの種類がlocalStorageに保存されました。');
      browser.assert.equal(settings.size, expectedSize, '文字サイズがlocalStorageに保存されました。');
      if (onDone) onDone(true);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(
        false,
        `設定が正しく保存されていません: family=${settings.family || '(empty)'} size=${settings.size || '(empty)'}`
      );
      if (onDone) onDone(false);
      return;
    }
    browser.pause(300, () => waitForSettingUpdate(browser, expectedFamily, expectedSize, attempt + 1, onDone));
  });
};

module.exports = {
  '設定をlocalStorageへ保存する': (browser) => {
    openSettings(browser);

    selectOption(browser, '#timeline_font_family', 'Helvetica', 'フォントの種類');
    selectOption(browser, '#timeline_font_size', '18px', '文字サイズ');
    clickSingleVisibleAfterExactControls(browser, {
      rootSelector: '.view',
      expectedControls: [
        { selector: '#timeline_font_family', property: 'value', value: 'Helvetica' },
        { selector: '#timeline_font_size', property: 'value', value: '18px' },
      ],
      submitSelector: '[data-testid="settings-submit"]',
      label: '設定の保存',
    });

    waitForSettingUpdate(browser, 'Helvetica', '18px', 0, () => browser.end());
  },
};
