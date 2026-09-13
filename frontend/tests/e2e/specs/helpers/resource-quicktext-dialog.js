const { getBaseUrl, navigateToApp } = require('./login');
const { focusAndClickSingleVisible, clickSingleVisible, clickSingleVisibleAfterExactControls } = require('./dialog-focus');

const dialogSelector = (resource) => `[data-testid="resource-quicktext-dialog-${resource}"]`;
const triggerSelector = (resource, roomId) => resource === 'floor'
  ? '[data-testid="room-floor-quicktext-button"]'
  : `[data-testid="room-quicktext-button-${roomId}"]`;

const openResourceQuickTextDialog = (browser, { resource, floorId, roomId }) => {
  const path = `/floor/${encodeURIComponent(floorId)}`;
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const trigger = triggerSelector(resource, roomId);
  navigateToApp(browser, `${base}${path}`).waitForElementVisible(trigger, 10000);
  focusAndClickSingleVisible(browser, trigger, '単語管理を開く');
  browser.waitForElementVisible(`${dialogSelector(resource)} [data-testid="quicktext-dialog-create-group"]:not([disabled])`, 10000);
  browser.assert.urlEquals(`${base}${path}`, '単語管理を開いてもルーム一覧のURLを維持します。');
};

const closeResourceQuickTextDialog = (browser, { resource, floorId, roomId }) => {
  clickSingleVisible(browser, `${dialogSelector(resource)} [data-testid="quicktext-dialog-close"]`, '単語管理を閉じる');
  browser.waitForElementNotPresent(dialogSelector(resource), 10000);
  browser.execute(
    function (expected) {
      return {
        samePath: window.location.pathname === expected.path,
        focused: document.activeElement === document.querySelector(expected.trigger),
      };
    },
    [{ path: `/floor/${encodeURIComponent(floorId)}`, trigger: triggerSelector(resource, roomId) }],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(state.samePath, '閉じた後もルーム一覧のURLを維持します。');
      browser.assert.ok(state.focused, '単語管理を開いたボタンへフォーカスが戻ります。');
    }
  );
};

const saveResourceQuickTextForm = (browser, resource, kind, value) => {
  const input = `#resource-quicktext-${resource}-${kind}-value`;
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: input,
    submitSelector: '[data-testid="quicktext-dialog-save"]',
    expectedControls: [{ selector: input, property: 'value', value }],
    label: '単語管理の入力を保存',
  });
  browser.waitForElementNotPresent(input, 10000);
  browser.waitForElementVisible(`${dialogSelector(resource)} [data-testid="quicktext-dialog-create-group"]:not([disabled])`, 10000);
};

const waitForResourceQuickTextDeletion = (browser, resource) => {
  browser.waitForElementNotVisible('.quicktext-delete-details', 10000);
  // 件数の表示は一覧取得成功時だけ現れ、最後のグループを削除した場合も残る。
  browser.waitForElementVisible(
    `${dialogSelector(resource)} [data-testid="quicktext-dialog-list-screen"][aria-busy="false"] .quicktext-summary`,
    10000
  );
};

module.exports = { openResourceQuickTextDialog, closeResourceQuickTextDialog, saveResourceQuickTextForm, waitForResourceQuickTextDeletion };
