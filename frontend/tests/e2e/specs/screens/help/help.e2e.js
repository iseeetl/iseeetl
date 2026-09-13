const { getBaseUrl } = require('../../helpers/login');
const { clickSingleVisible, sendKeysToActiveElement } = require('../../helpers/dialog-focus');
const { openAppMenu } = require('../../helpers/profile-helpers');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');

const HELP_CONTENT_SELECTOR =
  '#app_content > .view > .view-content > [data-testid="help-content"]';
const HELP_DIALOG_SELECTOR = '[data-testid="dialog-help"]';
const HELP_DIALOG_PANEL_SELECTOR = `${HELP_DIALOG_SELECTOR} [role="dialog"]`;
const HELP_TRIGGER_SELECTOR = '[data-testid="app-menu-button"]';
const HELP_TITLE_KEY = 'ヘルプ及びショートカット一覧';
const HELP_TITLES_BY_LOCALE = {
  de: require('../../../../../src/locales/de.json')[HELP_TITLE_KEY],
  en: require('../../../../../src/locales/en.json')[HELP_TITLE_KEY],
  es: require('../../../../../src/locales/es.json')[HELP_TITLE_KEY],
  fr: require('../../../../../src/locales/fr.json')[HELP_TITLE_KEY],
  he: require('../../../../../src/locales/he.json')[HELP_TITLE_KEY],
  hi: require('../../../../../src/locales/hi.json')[HELP_TITLE_KEY],
  it: require('../../../../../src/locales/it.json')[HELP_TITLE_KEY],
  ja: require('../../../../../src/locales/ja.json')[HELP_TITLE_KEY],
  ko: require('../../../../../src/locales/ko.json')[HELP_TITLE_KEY],
  pt: require('../../../../../src/locales/pt.json')[HELP_TITLE_KEY],
  ru: require('../../../../../src/locales/ru.json')[HELP_TITLE_KEY],
  sv: require('../../../../../src/locales/sv.json')[HELP_TITLE_KEY],
  tr: require('../../../../../src/locales/tr.json')[HELP_TITLE_KEY],
  uk: require('../../../../../src/locales/uk.json')[HELP_TITLE_KEY],
  vi: require('../../../../../src/locales/vi.json')[HELP_TITLE_KEY],
  zh: require('../../../../../src/locales/zh.json')[HELP_TITLE_KEY],
};

const assertLocalizedHelpTitle = (browser, label) => {
  browser.execute(
    function () {
      const titles = Array.from(document.querySelectorAll('.view-header h1.view-title'));
      const locale = String(document.documentElement.lang || '').trim();
      return {
        count: titles.length,
        locale,
        title: titles.length === 1 ? titles[0].textContent.trim() : '',
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { count: 0, locale: '', title: '' };
      browser.assert.equal(state.count, 1, `${label}: ヘルプの見出しが1件だけあります`);
      const expectedTitle = HELP_TITLES_BY_LOCALE[state.locale];
      browser.assert.ok(
        Boolean(expectedTitle),
        `${label}: ドキュメントの言語が対応言語です（${state.locale || 'missing'}）`
      );
      if (!expectedTitle) return;
      browser.assert.equal(state.title, expectedTitle, `${label}: 翻訳されたヘルプの見出しがドキュメントの言語と一致します`);
    }
  );
};

const waitForHelpContentResult = (browser, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const body = document.querySelector('[data-testid="help-content-body"]');
      const error = document.querySelector('[data-testid="help-content-error"]');
      const bodyText = body ? body.textContent.trim() : '';
      const errorText = error ? error.textContent.trim() : '';
      return {
        ready: bodyText.length > 0 || errorText.length > 0,
        result: bodyText.length > 0 ? 'body' : errorText.length > 0 ? 'error' : 'pending',
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ready: false, result: 'execute-failed' };
      if (state.ready) {
        browser.assert.equal(state.result, 'body', `${label}: ヘルプ本文を表示します`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${label}: ヘルプの表示が完了しませんでした（${state.result}）`);
        return;
      }
      browser.pause(250, () => waitForHelpContentResult(browser, label, attempt + 1));
    }
  );
};

const sendKeyToActiveElement = (browser, key, label) => {
  browser.perform((done) => {
    sendKeysToActiveElement(browser, key, (keyState) => {
      browser.assert.ok(
        keyState.ok,
        keyState.ok
          ? `${label}: アクティブ要素へキーを送信する`
          : `${label}: アクティブ要素へキーを送信できない (${keyState.reason})`
      );
      done();
    });
  });
};

const waitForFocus = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (targetSelector) {
      const target = document.querySelector(targetSelector);
      const active = document.activeElement;
      return {
        focused: !!target && active === target,
        active:
          (active &&
            (active.getAttribute('data-testid') || active.getAttribute('aria-label') || active.id || active.tagName)) ||
          'none',
      };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { focused: false, active: 'execute-failed' };
      if (state.focused) {
        browser.assert.ok(true, label);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${label} (active=${state.active})`);
        return;
      }
      browser.pause(100, () => waitForFocus(browser, selector, label, attempt + 1));
    }
  );
};

const waitForFocusWithin = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (targetSelector) {
      const target = document.querySelector(targetSelector);
      const active = document.activeElement;
      return { focused: !!target && !!active && target.contains(active) };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { focused: false };
      if (state.focused) {
        browser.assert.ok(true, label);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, label);
        return;
      }
      browser.pause(100, () => waitForFocusWithin(browser, selector, label, attempt + 1));
    }
  );
};

const waitForDialogClosed = (browser, selector, attempt = 0) => {
  const maxAttempts = 40;
  browser.execute(
    function (targetSelector) {
      const dialog = document.querySelector(targetSelector);
      return { closed: !dialog || !(dialog.offsetParent || dialog.getClientRects().length) };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { closed: false };
      if (state.closed) {
        browser.assert.ok(true, 'Escapeキーでヘルプダイアログが閉じます');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'Escapeキーでヘルプダイアログが閉じませんでした');
        return;
      }
      browser.pause(100, () => waitForDialogClosed(browser, selector, attempt + 1));
    }
  );
};

const focusElement = (browser, selector, label) => {
  browser.execute(
    function (targetSelector) {
      const target = document.querySelector(targetSelector);
      if (!target) return { focused: false };
      target.focus();
      return { focused: document.activeElement === target };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { focused: false };
      browser.assert.ok(state.focused, label);
    }
  );
};

const openFloorFromAppMenu = (browser, baseUrl, label) => {
  openAppMenu(browser);
  browser.waitForElementVisible('[data-testid="app-menu"] a[href="/"]', 10000);
  clickSingleVisible(browser, '[data-testid="app-menu"] a[href="/"]', label);
  browser.waitForElementVisible('#search_floor_input', 10000).assert.urlEquals(`${baseUrl}/`);
};

module.exports = {
  'ヘルプ画面への直接アクセス、メニューからの遷移、ダイアログのキーボード操作を確認する': (browser) => {
    const baseUrl = getBaseUrl(browser).replace(/\/$/, '');

    browser
      .url(`${baseUrl}/help`)
      .waitForElementVisible('.view-header h1.view-title', 10000)
      .waitForElementVisible(HELP_CONTENT_SELECTOR, 10000)
      .assert.urlContains('/help');
    assertLocalizedHelpTitle(browser, '直接URL');
    waitForHelpContentResult(browser, '直接URL');
    assertAccessibilityIntegrity(browser, {
      rootSelector: '#app_container',
      label: 'ヘルプのページ',
      checkControlNames: true,
    });

    openFloorFromAppMenu(browser, baseUrl, 'Help直リンクからフロア一覧へ移動');
    openAppMenu(browser);
    browser
      .waitForElementVisible('[data-testid="app-menu-help"]', 10000)
      .click('[data-testid="app-menu-help"]')
      .waitForElementVisible('.view-header h1.view-title', 10000)
      .waitForElementVisible(HELP_CONTENT_SELECTOR, 10000)
      .assert.urlContains('/help');
    assertLocalizedHelpTitle(browser, 'AppMenu導線');
    waitForHelpContentResult(browser, 'AppMenu導線');

    openFloorFromAppMenu(browser, baseUrl, 'Help画面からフロア一覧へ移動');
    focusElement(browser, HELP_TRIGGER_SELECTOR, '?キーの起点へフォーカスする');
    sendKeyToActiveElement(browser, '?', '?キー');
    browser
      .waitForElementVisible(HELP_DIALOG_SELECTOR, 10000)
      .waitForElementVisible(HELP_DIALOG_PANEL_SELECTOR, 10000)
      .assert.attributeEquals(HELP_DIALOG_PANEL_SELECTOR, 'role', 'dialog')
      .assert.attributeEquals(HELP_DIALOG_PANEL_SELECTOR, 'aria-modal', 'true')
      .waitForElementVisible('[data-testid="dialog-help-close-desktop"]', 10000);
    waitForFocusWithin(browser, HELP_DIALOG_SELECTOR, 'Helpダイアログ内の初期フォーカスを確認する');
    waitForHelpContentResult(browser, '?キーダイアログ');
    assertAccessibilityIntegrity(browser, {
      rootSelector: HELP_DIALOG_SELECTOR,
      label: 'ヘルプのダイアログ',
      checkControlNames: true,
    });

    sendKeyToActiveElement(browser, browser.Keys.ESCAPE, 'ESCキー');
    waitForDialogClosed(browser, HELP_DIALOG_SELECTOR);
    waitForFocus(browser, HELP_TRIGGER_SELECTOR, 'Helpダイアログを開いた起点へフォーカスが戻る');

    browser.end();
  },
};
