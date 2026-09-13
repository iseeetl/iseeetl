const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { runManagementFlowWithPreparedFloorRoom } = require('../../helpers/management-flow');
const { clickSingleVisible, waitForConfirmDialog } = require('../../helpers/dialog-focus');

const CONFIRM_DIALOG_ROOT = '[data-testid="confirm-dialog"]';
const CONFIRM_SELECTOR = `${CONFIRM_DIALOG_ROOT} [role="dialog"] [data-testid="confirm-dialog-confirm"]:not([disabled])`;

const openQuickTextManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/quicktext`;
  navigateToApp(browser, url).waitForElementVisible('[data-testid="quicktext-group-create"]:not([disabled])', 10000);
};

const clickFirstVisible = clickSingleVisible;

const waitForDialogToClose = (browser, selector, label) => {
  browser.waitForElementNotVisible(selector, 10000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `ダイアログが閉じませんでした${label ? ` (${label})` : ''}: ${selector}`);
    }
  });
};

const waitForGroupPresence = (browser, title, shouldExist, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (groupTitle) {
      const items = Array.from(document.querySelectorAll('.group-item'));
      const group = items.find((item) => {
        const titleNode = item.querySelector('.group-top .field-value');
        return titleNode && titleNode.textContent.trim() === groupTitle;
      });
      return { exists: !!group };
    },
    [title],
    (result) => {
      const exists = result && result.value ? result.value.exists : false;
      if (exists === shouldExist) {
        browser.assert.ok(true, `グループの有無が一致しました: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `グループの有無が一致しません: ${title}`);
        return;
      }
      browser.pause(500, () => waitForGroupPresence(browser, title, shouldExist, attempt + 1));
    }
  );
};

const waitForItemPresence = (browser, groupTitle, itemLabel, shouldExist, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (title, label) {
      const items = Array.from(document.querySelectorAll('.group-item'));
      const group = items.find((item) => {
        const titleNode = item.querySelector('.group-top .field-value');
        return titleNode && titleNode.textContent.trim() === title;
      });
      if (!group) return { exists: false, group: false };
      const entry = Array.from(group.querySelectorAll('.item-title')).find((node) => node.textContent.trim() === label);
      return { exists: !!entry, group: true };
    },
    [groupTitle, itemLabel],
    (result) => {
      const state = result && result.value ? result.value : { exists: false, group: false };
      if (!state.group) {
        browser.assert.ok(false, `項目の所属グループが見つかりません: ${groupTitle}`);
        return;
      }
      if (state.exists === shouldExist) {
        browser.assert.ok(true, `項目の有無が一致しました: ${itemLabel}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `項目の有無が一致しません: ${itemLabel}`);
        return;
      }
      browser.pause(500, () => waitForItemPresence(browser, groupTitle, itemLabel, shouldExist, attempt + 1));
    }
  );
};

const clickGroupAction = (browser, title, selector, label) => {
  browser.waitForElementVisible('.management-view[aria-busy="false"]', 10000);
  browser.execute(
    function (groupTitle, actionSelector) {
      const items = Array.from(document.querySelectorAll('.group-item'));
      const group = items.find((item) => {
        const titleNode = item.querySelector('.group-top .field-value');
        return titleNode && titleNode.textContent.trim() === groupTitle;
      });
      if (!group) return { clicked: false, reason: 'group-not-found' };
      const button = group.querySelector(actionSelector);
      if (!button) return { clicked: false, reason: 'button-not-found' };
      if (button.disabled || !button.getClientRects().length) return { clicked: false, reason: 'button-not-ready' };
      button.click();
      return { clicked: true };
    },
    [title, selector],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `グループの操作をクリックできませんでした${label ? ` (${label})` : ''}: ${reason}`);
      }
    }
  );
};

const clickItemDelete = (browser, groupTitle, itemLabel) => {
  browser.waitForElementVisible('.management-view[aria-busy="false"]', 10000);
  browser.execute(
    function (title, label) {
      const items = Array.from(document.querySelectorAll('.group-item'));
      const group = items.find((item) => {
        const titleNode = item.querySelector('.group-top .field-value');
        return titleNode && titleNode.textContent.trim() === title;
      });
      if (!group) return { clicked: false, reason: 'group-not-found' };
      const entry = Array.from(group.querySelectorAll('.qt-item-li')).find((li) => {
        const node = li.querySelector('.item-title');
        return node && node.textContent.trim() === label;
      });
      if (!entry) return { clicked: false, reason: 'item-not-found' };
      const button = entry.querySelector('[data-testid="quicktext-item-delete"]');
      if (!button) return { clicked: false, reason: 'button-not-found' };
      if (button.disabled || !button.getClientRects().length) return { clicked: false, reason: 'button-not-ready' };
      button.click();
      return { clicked: true };
    },
    [groupTitle, itemLabel],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `項目の削除をクリックできませんでした: ${reason}`);
      }
    }
  );
};

const confirmDelete = (browser) => {
  waitForConfirmDialog(browser, CONFIRM_DIALOG_ROOT, '単語管理の確認ダイアログ');
  clickSingleVisible(browser, CONFIRM_SELECTOR, '単語管理の変更を確定');
};

module.exports = {
  '単語管理で作成・編集・削除ができる': (browser) => {
    runManagementFlowWithPreparedFloorRoom(browser, 'QuickText Management CRUD', ({ finish }) => {
      openQuickTextManagement(browser);

      const stamp = Date.now();
      const groupTitle = `E2EGroup${stamp}`;
      const itemLabel = `E2EItem${stamp}`;

      browser
        .waitForElementVisible('[data-testid="quicktext-group-create"]', 10000)
        .click('[data-testid="quicktext-group-create"]')
        .waitForElementVisible('#qt_group_title', 10000)
        .setValue('#qt_group_title', groupTitle);
      clickFirstVisible(browser, '[data-testid="quicktext-dialog-submit"]', 'グループの入力を送信');
      waitForDialogToClose(browser, '#qt_group_title', 'グループ');
      waitForGroupPresence(browser, groupTitle, true);

      clickGroupAction(browser, groupTitle, '.group-top-actions .items-create-btn', '項目を作成');
      browser.waitForElementVisible('#qt_item_label', 10000).setValue('#qt_item_label', itemLabel);
      clickFirstVisible(browser, '[data-testid="quicktext-dialog-submit"]', '項目の入力を送信');
      waitForDialogToClose(browser, '#qt_item_label', '項目');
      waitForItemPresence(browser, groupTitle, itemLabel, true);

      clickItemDelete(browser, groupTitle, itemLabel);
      confirmDelete(browser);
      waitForItemPresence(browser, groupTitle, itemLabel, false);

      clickGroupAction(browser, groupTitle, '[data-testid="quicktext-group-delete"]', 'グループを削除');
      confirmDelete(browser);
      waitForGroupPresence(browser, groupTitle, false);

      finish();
    });
  },
};
