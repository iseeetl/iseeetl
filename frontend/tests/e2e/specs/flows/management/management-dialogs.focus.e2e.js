const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { assertDialogKeyboardBehavior } = require('../../helpers/dialog-focus');
const {
  ACTION_SELECTOR,
  buildManagementRowScenario,
  ensureManagementRow,
  loginAsAdmin,
  managementDialogSelector,
  prepareManagementRowFixtures,
  waitForManagementView,
} = require('../../helpers/management-row-keyboard');
const { assertAccessibilityIntegrity } = require('../../helpers/accessibility');

const buildManagementUrl = (browser, path) => `${getBaseUrl(browser).replace(/\/$/, '')}${path}`;

const focusAndOpenDialog = (browser, testCase) => {
  const dialogSelector = managementDialogSelector(testCase);
  browser.execute(
    function (selector) {
      const target = document.querySelector(selector);
      if (!target) return { focused: false, reason: '操作ボタンが見つかりません' };
      target.focus();
      return { focused: document.activeElement === target };
    },
    [ACTION_SELECTOR],
    (result) => {
      const state = result && result.value ? result.value : { focused: false, reason: '実行に失敗しました' };
      browser.assert.ok(
        state.focused,
        state.focused
          ? `${testCase.label}: ダイアログの起点へフォーカスする`
          : `${testCase.label}: ダイアログの起点へフォーカスできない (${state.reason})`
      );
    }
  );

  browser.click(ACTION_SELECTOR).waitForElementVisible(dialogSelector, 10000);
  assertDialogKeyboardBehavior(browser, dialogSelector, testCase.label, {
    returnFocusSelector: ACTION_SELECTOR,
  });
};

module.exports = {
  '管理者が管理ダイアログをキーボードで操作できる': (browser) => {
    const scenario = buildManagementRowScenario();
    loginAsAdmin(browser);
    prepareManagementRowFixtures(browser, scenario.fixture);

    scenario.cases.forEach((testCase) => {
      navigateToApp(browser, buildManagementUrl(browser, testCase.path));
      waitForManagementView(browser, testCase);

      ensureManagementRow(browser, testCase);
      browser.waitForElementVisible(ACTION_SELECTOR, 10000);

      if (testCase.path === '/management/user') {
        assertAccessibilityIntegrity(browser, {
          rootSelector: '#app_container',
          label: 'ユーザ管理の一覧',
          checkControlNames: true,
        });
      }

      focusAndOpenDialog(browser, testCase);
    });

    browser.end();
  },
};
