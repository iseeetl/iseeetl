// provider-google-translateプロファイル専用。
const {
  clickSingleVisible,
  clickSingleVisibleAfterExactControls,
} = require('../../helpers/dialog-focus');
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm, clickExactFloorDialogSubmit } = require('../../helpers/role-helpers');

const waitForFloorTitle = (browser, title, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (targetTitle) {
      const matches = Array.from(document.querySelectorAll('h2.floor-title')).filter(
        (node) => node.textContent && node.textContent.trim() === targetTitle
      );
      return { count: matches.length };
    },
    [title],
    (result) => {
      const count = result && result.value ? result.value.count : -1;
      if (count === 1) {
        browser.assert.ok(true, `翻訳済みのフロアを作成しました: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.strictEqual(count, 1, `翻訳済みのフロアの件数: ${title}`);
        return;
      }
      browser.pause(500, () => waitForFloorTitle(browser, title, attempt + 1));
    }
  );
};

const closeSoundCautionIfVisible = (browser) => {
  browser.execute(
    function () {
      const dialog = document.querySelector('[data-testid="dialog-sound-caution"]');
      return Boolean(dialog && dialog.getClientRects().length);
    },
    [],
    (result) => {
      if (result && result.value) {
        clickSingleVisibleAfterExactControls(browser, {
          anchorSelector: '#sound_caution_confirm_title',
          expectedControls: [],
          submitSelector: '[data-testid="dialog-sound-caution-confirm"]',
          label: '音声に関する注意を確認',
        });
        browser.waitForElementNotVisible('[data-testid="dialog-sound-caution"]', 10000);
      }
    }
  );
};

module.exports = {
  '@tags': ['provider-google-translate'],

  'フロアの入力内容を自動翻訳する': (browser) => {
    const mail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const password = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const title = `E2E Translate Floor ${String(Date.now()).slice(-8)}`;

    loginByForm(browser, { mail, password });
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    closeSoundCautionIfVisible(browser);
    navigateToApp(browser, getBaseUrl(browser)).waitForElementVisible('#search_floor_input', 10000);
    clickSingleVisible(browser, '[data-testid="floor-list-create-button"]', '作成ダイアログを開く');
    browser.waitForElementVisible('#edit_floor_title', 10000);
    browser
      .clearValue('#edit_floor_title')
      .setValue('#edit_floor_title', title)
      .clearValue('#edit_floor_description')
      .setValue('#edit_floor_description', 'E2E Google translate provider Floor.');
    browser.execute(
      function () {
        const fieldsets = Array.from(document.querySelectorAll('fieldset')).filter((fieldset) => {
          const legend = fieldset.querySelector('legend');
          return legend && legend.textContent && legend.textContent.trim().includes('自動翻訳');
        });
        const checkboxes = fieldsets.length === 1
          ? Array.from(fieldsets[0].querySelectorAll('input[type="checkbox"][value="fr"]'))
          : [];
        if (fieldsets.length !== 1 || checkboxes.length !== 1) {
          return { selected: false, fieldsetCount: fieldsets.length, checkboxCount: checkboxes.length };
        }
        const wasSelected = checkboxes[0].checked;
        checkboxes[0].click();
        return {
          selected: !wasSelected && checkboxes[0].checked,
          fieldsetCount: fieldsets.length,
          checkboxCount: checkboxes.length,
        };
      },
      [],
      (result) => {
        const state = result && result.value
          ? result.value
          : { selected: false, fieldsetCount: -1, checkboxCount: -1 };
        browser.assert.strictEqual(state.fieldsetCount, 1, '自動翻訳の項目グループが1件表示されています。');
        browser.assert.strictEqual(state.checkboxCount, 1, 'フランス語の自動翻訳の選択肢が1件あります。');
        browser.assert.ok(state.selected, 'フランス語の自動翻訳を選択できます。');
      }
    );
    clickExactFloorDialogSubmit(browser, {
      title,
      description: 'E2E Google translate provider Floor.',
      targetLangs: ['ja', 'en', 'fr'],
      displayHidden: false,
      filesLength: 0,
      imageState: 'none',
      label: '翻訳付きのフロアを作成',
    });
    browser.waitForElementNotVisible('#edit_floor_title', 10000);
    waitForFloorTitle(browser, title);
    browser.end();
  },
};
