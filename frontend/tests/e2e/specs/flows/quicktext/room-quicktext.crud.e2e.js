const { openResourceQuickTextDialog, closeResourceQuickTextDialog, saveResourceQuickTextForm, waitForResourceQuickTextDeletion } = require('../../helpers/resource-quicktext-dialog');
const { runEditorFlowWithPreparedFloorRoom } = require('../../helpers/editor-flow');
const { clickSingleVisible, waitForConfirmDialog } = require('../../helpers/dialog-focus');

const CONFIRM_DIALOG_ROOT = '[data-testid="confirm-dialog"]';
const CONFIRM_SELECTOR = `${CONFIRM_DIALOG_ROOT} [role="dialog"] [data-testid="confirm-dialog-confirm"]:not([disabled])`;

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

const clickItemAction = (browser, groupTitle, itemLabel, actionSelector) => {
  browser.execute(
    function (title, label, selector) {
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
      const button = entry.querySelector(selector);
      if (!button) return { clicked: false, reason: 'button-not-found' };
      button.click();
      return { clicked: true };
    },
    [groupTitle, itemLabel, actionSelector],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `項目の操作をクリックできませんでした: ${reason}`);
      }
    }
  );
};

const confirmDelete = (browser) => {
  waitForConfirmDialog(browser, CONFIRM_DIALOG_ROOT, 'ルームの単語の確認ダイアログ');
  clickSingleVisible(browser, CONFIRM_SELECTOR, 'ルームの単語の変更を確定');
  waitForResourceQuickTextDeletion(browser, 'room');
};

const createGroupAndItem = (browser, groupTitle, itemLabel) => {
  clickSingleVisible(browser, '[data-testid="quicktext-dialog-create-group"]', '単語グループを作成');
  browser
    .waitForElementVisible('#resource-quicktext-room-group-value', 10000)
    .setValue('#resource-quicktext-room-group-value', groupTitle);
  saveResourceQuickTextForm(browser, 'room', 'group', groupTitle);
  waitForGroupPresence(browser, groupTitle, true);

  clickGroupAction(browser, groupTitle, '.group-top-actions .items-create-btn', '項目を作成');
  browser.waitForElementVisible('#resource-quicktext-room-item-value', 10000).setValue('#resource-quicktext-room-item-value', itemLabel);
  saveResourceQuickTextForm(browser, 'room', 'item', itemLabel);
  waitForItemPresence(browser, groupTitle, itemLabel, true);
};

module.exports = {
  'ルームの単語を作成・編集・削除できる': (browser) => {
    runEditorFlowWithPreparedFloorRoom(browser, 'Room QuickText CRUD', ({ floorId, roomId, finish }) => {
      openResourceQuickTextDialog(browser, { resource: 'room', floorId, roomId });

      const stamp = Date.now();
      const groupTitleA = `E2ERoomGroupA${stamp}`;
      const groupTitleB = `E2ERoomGroupB${stamp}`;
      const itemLabelA = `E2ERoomItemA${stamp}`;
      const itemLabelB = `E2ERoomItemB${stamp}`;

      createGroupAndItem(browser, groupTitleA, itemLabelA);
      createGroupAndItem(browser, groupTitleB, itemLabelB);

      const editedGroupTitle = `${groupTitleB}Edited`;
      const editedItemLabel = `${itemLabelB}Edited`;
      clickGroupAction(browser, groupTitleB, '[data-testid="quicktext-group-edit"]', 'グループ名を編集');
      browser.waitForElementVisible('#resource-quicktext-room-group-value', 10000)
        .clearValue('#resource-quicktext-room-group-value').setValue('#resource-quicktext-room-group-value', editedGroupTitle);
      saveResourceQuickTextForm(browser, 'room', 'group', editedGroupTitle);
      waitForGroupPresence(browser, editedGroupTitle, true);
      waitForGroupPresence(browser, groupTitleB, false);
      clickItemAction(browser, editedGroupTitle, itemLabelB, '[data-testid="quicktext-item-edit"]');
      browser.waitForElementVisible('#resource-quicktext-room-item-value', 10000)
        .clearValue('#resource-quicktext-room-item-value').setValue('#resource-quicktext-room-item-value', editedItemLabel);
      saveResourceQuickTextForm(browser, 'room', 'item', editedItemLabel);
      waitForItemPresence(browser, editedGroupTitle, editedItemLabel, true);
      waitForItemPresence(browser, editedGroupTitle, itemLabelB, false);


      clickGroupAction(browser, groupTitleA, '[data-testid="quicktext-group-delete"]', 'グループAを削除');
      confirmDelete(browser);
      waitForGroupPresence(browser, groupTitleA, false);

      openResourceQuickTextDialog(browser, { resource: 'room', floorId, roomId });
      waitForGroupPresence(browser, editedGroupTitle, true);
      waitForItemPresence(browser, editedGroupTitle, editedItemLabel, true);
      waitForGroupPresence(browser, groupTitleA, false);

      clickItemAction(browser, editedGroupTitle, editedItemLabel, '[data-testid="quicktext-item-delete"]');
      confirmDelete(browser);
      waitForItemPresence(browser, editedGroupTitle, editedItemLabel, false);

      clickGroupAction(browser, editedGroupTitle, '[data-testid="quicktext-group-delete"]', 'グループBを削除');
      confirmDelete(browser);
      waitForGroupPresence(browser, editedGroupTitle, false);

      closeResourceQuickTextDialog(browser, { resource: 'room', floorId, roomId });
      finish();
    });
  },
};
