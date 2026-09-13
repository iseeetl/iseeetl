const { openResourceQuickTextDialog, saveResourceQuickTextForm } = require('../../helpers/resource-quicktext-dialog');
const { findOptionalElement, getBaseUrl, navigateToApp } = require('../../helpers/login');
const {
  loginByForm,
  clickExactFloorDialogSubmit,
  clickExactRoomDialogSubmit,
} = require('../../helpers/role-helpers');
const {
  clickFirstVisible,
  focusAndClickSingleVisible,
  assertTabCycle,
  assertDialogInert,
  sendKeysToActiveElement,
  assertDialogKeyboardBehavior,
  waitForDialogClosed,
} = require('../../helpers/dialog-focus');

const openFloorList = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, base).waitForElementVisible('#search_floor_input', 10000);
};

const waitForRoomListVisible = (browser, onReady, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const roomList = document.querySelector('.room-list');
      return !!(roomList && roomList.offsetParent !== null);
    },
    [],
    (result) => {
      const visible = !!(result && result.value === true);
      if (visible) {
        if (typeof onReady === 'function') onReady(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ルームダイアログの検証に失敗しました。ルーム一覧が表示されていません。');
        if (typeof onReady === 'function') onReady(false);
        return;
      }
      browser.pause(500, () => waitForRoomListVisible(browser, onReady, attempt + 1));
    }
  );
};

const openRoomList = (browser, floorId, onReady) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/floor/${encodeURIComponent(floorId)}`);
  waitForRoomListVisible(browser, onReady);
};

const clickButtonByText = (browser, text, label, options = {}) => {
  const onResult = typeof options.onResult === 'function' ? options.onResult : null;
  browser.execute(
    function (payload) {
      const root = payload.root ? document.querySelector(payload.root) : document;
      if (!root) return { clicked: false, reason: 'root-not-found' };
      const selectorByText = {
        フロア作成: '[data-testid="floor-list-create-button"]',
        ルーム作成: '[data-testid="room-list-create-button"]',
        全フロア非表示: '[data-testid="floor-list-hide-all-button"]',
        全ルーム非表示: '[data-testid="room-list-hide-all-button"]',
        フロアタグ: '[data-testid="room-floor-tag-button"]',
        ルームタグ: '[data-testid^="room-tag-button-"]',
        キック済みユーザ一覧: '[data-testid="room-kicked-user-list-button"]',
      };
      const mappedSelector = selectorByText[payload.text];
      if (mappedSelector) {
        const mappedNodes = Array.from(root.querySelectorAll(mappedSelector)).filter((node) => {
          if (node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
          return !!(node.offsetParent || node.getClientRects().length);
        });
        if (mappedNodes.length !== 1) {
          return { clicked: false, reason: `mapped-button-count:${mappedNodes.length}` };
        }
        mappedNodes[0].click();
        return { clicked: true };
      }
      const buttons = Array.from(root.querySelectorAll('button')).filter((button) => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
        if (!(button.offsetParent || button.getClientRects().length)) return false;
        return button.textContent && button.textContent.trim() === payload.text;
      });
      if (buttons.length !== 1) return { clicked: false, reason: `button-count:${buttons.length}` };
      buttons[0].click();
      return { clicked: true };
    },
    [{ text, root: null }],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        const suffix = label ? ` (${label})` : '';
        browser.assert.ok(false, `ボタンをクリックできませんでした${suffix}: ${reason}`);
        if (onResult) onResult(false);
        return;
      }
      if (onResult) onResult(true);
    }
  );
};

const waitForFloorTitle = (browser, title, shouldExist, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      return titles.some((node) => node.textContent && node.textContent.trim() === targetTitle);
    },
    [title],
    (result) => {
      const found = result && typeof result.value === 'boolean' ? result.value : false;
      if (found === shouldExist) {
        browser.assert.ok(true, `フロア名の確認結果=${shouldExist ? '存在' : '削除済み'}: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `フロア名の確認結果=${shouldExist ? '未検出' : '残存'}: ${title}`);
        return;
      }
      browser.pause(500, () => waitForFloorTitle(browser, title, shouldExist, attempt + 1));
    }
  );
};

const waitForRoomTitle = (browser, title, shouldExist, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.room-title'));
      return titles.some((node) => node.textContent && node.textContent.trim() === targetTitle);
    },
    [title],
    (result) => {
      const found = result && typeof result.value === 'boolean' ? result.value : false;
      if (found === shouldExist) {
        browser.assert.ok(true, `ルーム名の確認結果=${shouldExist ? '存在' : '削除済み'}: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ルーム名の確認結果=${shouldExist ? '未検出' : '残存'}: ${title}`);
        return;
      }
      browser.pause(500, () => waitForRoomTitle(browser, title, shouldExist, attempt + 1));
    }
  );
};

const findFloorIdByTitle = (browser, title, onFound) => {
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      const targetTitleNode = titles.find((node) => node.textContent && node.textContent.trim() === targetTitle);
      if (!targetTitleNode) return { ok: false, reason: 'title-not-found' };
      const link = targetTitleNode.closest('a');
      const href = link ? link.getAttribute('href') : null;
      return { ok: !!href, href };
    },
    [title],
    (result) => {
      const value = result && result.value ? result.value : {};
      const href = value.href || '';
      const match = href.match(/\/floor\/([^/?#]+)/);
      const floorId = match ? match[1] : '';
      if (!floorId) {
        const reason = value.reason || 'floor-id-not-found';
        browser.assert.ok(false, `フロアIDを取得できませんでした: ${reason}`);
      }
      if (typeof onFound === 'function') onFound(floorId);
    }
  );
};

const findRoomIdByTitle = (browser, title, onFound) => {
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.room-title'));
      const targetTitleNode = titles.find((node) => node.textContent && node.textContent.trim() === targetTitle);
      if (!targetTitleNode) return { ok: false, reason: 'title-not-found' };
      const link = targetTitleNode.closest('a');
      const href = link ? link.getAttribute('href') : null;
      return { ok: !!href, href };
    },
    [title],
    (result) => {
      const value = result && result.value ? result.value : {};
      const href = value.href || '';
      const match = href.match(/\/room\/([^/?#]+)/);
      const roomId = match ? match[1] : '';
      if (!roomId) {
        const reason = value.reason || 'room-id-not-found';
        browser.assert.ok(false, `ルームIDを取得できませんでした: ${reason}`);
      }
      if (typeof onFound === 'function') onFound(roomId);
    }
  );
};

const clickFloorAction = (browser, title, actionLabel) => {
  browser.execute(
    function (payload) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      const targetTitle = titles.find((node) => node.textContent && node.textContent.trim() === payload.title);
      if (!targetTitle) return { clicked: false, reason: 'title-not-found' };
      const card = targetTitle.closest('article.floor-card');
      if (!card) return { clicked: false, reason: 'card-not-found' };
      const actions = card.querySelector('footer.floor-card__actions');
      if (!actions) return { clicked: false, reason: 'actions-not-found' };
      const buttons = Array.from(actions.querySelectorAll('button'));
      const target = buttons.find((btn) => btn.textContent && btn.textContent.trim() === payload.action);
      if (!target) return { clicked: false, reason: 'button-not-found' };
      target.click();
      return { clicked: true };
    },
    [{ title, action: actionLabel }],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `フロアの操作をクリックできませんでした（${actionLabel}）: ${reason}`);
      }
    }
  );
};

const clickRoomAction = (browser, title, actionLabel) => {
  browser.execute(
    function (payload) {
      const titles = Array.from(document.querySelectorAll('h2.room-title'));
      const targetTitle = titles.find((node) => node.textContent && node.textContent.trim() === payload.title);
      if (!targetTitle) return { clicked: false, reason: 'title-not-found' };
      const card = targetTitle.closest('li');
      if (!card) return { clicked: false, reason: 'card-not-found' };
      const actions = card.querySelector('.room-action');
      if (!actions) return { clicked: false, reason: 'actions-not-found' };
      const buttons = Array.from(actions.querySelectorAll('button'));
      const target = buttons.find((btn) => btn.textContent && btn.textContent.trim() === payload.action);
      if (!target) return { clicked: false, reason: 'button-not-found' };
      target.click();
      return { clicked: true };
    },
    [{ title, action: actionLabel }],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `ルームの操作をクリックできませんでした（${actionLabel}）: ${reason}`);
      }
    }
  );
};

const createFloor = (browser, title) => {
  clickButtonByText(browser, 'フロア作成', 'フロアの作成画面を開く');
  browser.waitForElementVisible('#edit_floor_title', 10000);
  browser.clearValue('#edit_floor_title').setValue('#edit_floor_title', title);
  browser.clearValue('#edit_floor_description').setValue('#edit_floor_description', 'E2E floor for dialog focus.');
  clickExactFloorDialogSubmit(browser, {
    title,
    description: 'E2E floor for dialog focus.',
    filesLength: 0,
    imageState: 'none',
    label: 'フロアの作成を確定',
  });
  waitForDialogClosed(browser, '#edit_floor_title', 'フロアを作成');
};

const createRoom = (browser, title) => {
  clickButtonByText(browser, 'ルーム作成', 'ルームの作成画面を開く');
  browser.waitForElementVisible('#room_title', 10000);
  browser.clearValue('#room_title').setValue('#room_title', title);
  browser.clearValue('#room_description').setValue('#room_description', 'E2E room for dialog focus.');
  clickExactRoomDialogSubmit(browser, {
    title,
    description: 'E2E room for dialog focus.',
    filesLength: 0,
    imageState: 'none',
    label: 'ルームの作成を確定',
  });
  waitForDialogClosed(browser, '#room_title', 'ルームを作成');
};

const waitForQuickTextGroup = (browser, title, shouldExist, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (groupTitle) {
      const groups = Array.from(document.querySelectorAll('.group-item'));
      return groups.some((group) => {
        const titleNode = group.querySelector('.group-top .field-value');
        return titleNode && titleNode.textContent.trim() === groupTitle;
      });
    },
    [title],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      if (exists === shouldExist) {
        browser.assert.ok(true, `単語グループの確認結果=${shouldExist ? '作成済み' : '削除済み'}: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `単語グループの有無が一致しません: ${title}`);
        return;
      }
      browser.pause(500, () => waitForQuickTextGroup(browser, title, shouldExist, attempt + 1));
    }
  );
};

const clickQuickTextGroupAction = (browser, title, actionSelector, label) => {
  browser.execute(
    function (payload) {
      const groups = Array.from(document.querySelectorAll('.group-item'));
      const group = groups.find((entry) => {
        const titleNode = entry.querySelector('.group-top .field-value');
        return titleNode && titleNode.textContent.trim() === payload.title;
      });
      if (!group) return { clicked: false, reason: 'group-not-found' };
      const target = group.querySelector(payload.actionSelector);
      if (!target) return { clicked: false, reason: 'button-not-found' };
      target.focus();
      target.click();
      return { clicked: true };
    },
    [{ title, actionSelector }],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'execute-failed' };
      browser.assert.ok(state.clicked, `単語グループの操作をクリックしました（${label}）: ${state.reason || 'ok'}`);
    }
  );
};

const assertQuickTextEditorKeyboard = (browser, resource, kind, label) => {
  const dialog = `[data-testid="resource-quicktext-dialog-${resource}"]`;
  const input = `#resource-quicktext-${resource}-${kind}-value`;
  browser.waitForElementVisible(input, 10000);
  browser.assert.hasAttribute(input, 'required', `${label}: 必須入力です。`);
  assertDialogInert(browser, dialog, label);
  assertTabCycle(browser, dialog, label);
  browser.perform((done) => {
    sendKeysToActiveElement(browser, browser.Keys.ESCAPE, (state) => {
      browser.assert.ok(state.ok, `${label}: Escapeキーで一覧へ戻ります。`);
      done();
    });
  });
  browser.waitForElementNotPresent(input, 10000);
  browser.waitForElementVisible(`${dialog} [data-testid="quicktext-dialog-list-screen"]`, 10000);
  browser.execute(function (selector) {
    const target = document.querySelector(selector);
    return !!target && target.contains(document.activeElement);
  }, [`${dialog} [data-testid="quicktext-dialog-list-screen"]`], (result) => {
    browser.assert.ok(result.value, `${label}: 同じダイアログの一覧へフォーカスが戻ります。`);
  });
};

const openQuickTextDialogs = (browser, resource, labelPrefix, roomId) => {
  const dialog = `[data-testid="resource-quicktext-dialog-${resource}"]`;
  const groupInputSelector = `#resource-quicktext-${resource}-group-value`;
  const createSelector = `${dialog} [data-testid="quicktext-dialog-create-group"]`;
  const groupTitle = `E2EFocus${resource}${String(Date.now()).slice(-6)}`;

  focusAndClickSingleVisible(browser, createSelector, `${labelPrefix}のグループのフォーカス`);
  assertQuickTextEditorKeyboard(browser, resource, 'group', `${labelPrefix}のグループ入力`);

  focusAndClickSingleVisible(browser, createSelector, `${labelPrefix}のグループのテストデータ`);
  browser.waitForElementVisible(groupInputSelector, 10000).setValue(groupInputSelector, groupTitle);
  saveResourceQuickTextForm(browser, resource, 'group', groupTitle);
  waitForQuickTextGroup(browser, groupTitle, true);

  clickQuickTextGroupAction(browser, groupTitle, '[data-testid="quicktext-item-create"]', `${labelPrefix}の項目のフォーカス`);
  assertQuickTextEditorKeyboard(browser, resource, 'item', `${labelPrefix}の単語入力`);
  assertDialogKeyboardBehavior(browser, dialog, `${labelPrefix}の一覧`, {
    returnFocusSelector: resource === 'floor'
      ? '[data-testid="room-floor-quicktext-button"]'
      : `[data-testid="room-quicktext-button-${roomId}"]`,
  });
};

const openDialogByLabel = (browser, label, dialogSelector, actionLabel) => {
  clickButtonByText(browser, label, actionLabel || label, {
    onResult: (clicked) => {
      if (!clicked) return;
      browser.pause(300);
      assertDialogKeyboardBehavior(browser, dialogSelector, actionLabel || label);
    },
  });
};

module.exports = {
  'フロア編集ユーザがフロア・ルームのダイアログをキーボードで操作できる': (browser) => {
    const mail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const password = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    if (!mail || !password) {
      browser.assert.ok(false, 'フロア編集ユーザのダイアログのフォーカステストをスキップします。E2E_FLOOR_EDITOR_MAIL/PASSWORDが未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Dialog Floor ${stamp}`;
    const roomTitle = `E2E Dialog Room ${stamp}`;
    let floorId = '';
    let roomId = '';
    let roomListReady = false;

    loginByForm(browser, { mail, password });
    openFloorList(browser);

    clickButtonByText(browser, 'フロア作成', 'フロアのダイアログを開く');
    browser.waitForElementVisible('#edit_floor_title', 10000);
    assertDialogKeyboardBehavior(browser, '[role="dialog"]', 'フロアの作成ダイアログ');

    createFloor(browser, floorTitle);
    waitForFloorTitle(browser, floorTitle, true);
    findFloorIdByTitle(browser, floorTitle, (resolved) => {
      floorId = resolved;
    });

    openDialogByLabel(browser, '全フロア非表示', '[role="dialog"]', 'フロアの表示設定を確定');

    clickFloorAction(browser, floorTitle, '編集');
    browser.waitForElementVisible('#edit_floor_title', 10000);
    assertDialogKeyboardBehavior(browser, '[role="dialog"]', 'フロアの編集ダイアログ');

    clickFloorAction(browser, floorTitle, '削除');
    browser.waitForElementVisible('#delete_floor_dialog_description', 10000);
    assertDialogKeyboardBehavior(browser, '[role="dialog"]', 'フロアの削除ダイアログ');

    browser.perform(() => {
      if (!floorId) {
        browser.assert.ok(false, 'ルーム一覧用のフロアIDを取得できませんでした。');
      }
    });

    browser.perform(() => {
      if (floorId) {
        openRoomList(browser, floorId, (ready) => {
          roomListReady = ready;
        });
      }
    });

    browser.perform(() => {
      if (!roomListReady) {
        browser.assert.ok(false, 'ルームダイアログの検証に失敗しました。ルーム一覧を利用できません。');
        return;
      }

      clickButtonByText(browser, 'ルーム作成', 'ルームのダイアログを開く');
      browser.waitForElementVisible('#room_title', 10000);
      assertDialogKeyboardBehavior(browser, '[role="dialog"]', 'ルームの作成ダイアログ');

      createRoom(browser, roomTitle);
      waitForRoomTitle(browser, roomTitle, true);

      clickButtonByText(browser, '全ルーム非表示', 'ルームの表示設定を確定');
      browser.waitForElementVisible('#update_room_display_confirm_title', 10000);
      assertDialogKeyboardBehavior(
        browser,
        '[role="dialog"][aria-labelledby="update_room_display_confirm_title"]',
        'ルームの表示設定の確認ダイアログ'
      );

      findRoomIdByTitle(browser, roomTitle, (resolved) => {
        roomId = resolved;
      });

      clickRoomAction(browser, roomTitle, '編集');
      browser.waitForElementVisible('#room_title', 10000);
      assertDialogKeyboardBehavior(browser, '[role="dialog"]', 'ルームの編集ダイアログ');

      clickRoomAction(browser, roomTitle, '削除');
      browser.waitForElementVisible('#delete_room_dialog_description', 10000);
      assertDialogKeyboardBehavior(browser, '[role="dialog"]', 'ルームの削除ダイアログ');

      openDialogByLabel(browser, 'フロアタグ', '[role="dialog"]', 'フロアタグのダイアログ');
      openDialogByLabel(browser, 'ルームタグ', '[role="dialog"]', 'ルームタグのダイアログ');

      findOptionalElement(browser, '[data-testid="room-invite-floor-member-button"]', (result) => {
        if (result.status !== 0) {
          browser.assert.ok(false, 'フロアメンバーの招待ダイアログの検証に失敗しました。開くボタンが見つかりません。');
          return;
        }
        clickFirstVisible(browser, '[data-testid="room-invite-floor-member-button"]', 'フロアメンバーを招待');
        browser.waitForElementVisible('[data-testid="dialog-invite-floor-member"]', 10000);
        assertDialogKeyboardBehavior(
          browser,
          '[data-testid="dialog-invite-floor-member"]',
          'フロアメンバーの招待ダイアログ'
        );
      });

      findOptionalElement(browser, '[data-testid="room-floor-member-list-button"]', (result) => {
        if (result.status !== 0) {
          browser.assert.ok(false, 'フロアメンバー一覧のダイアログの検証に失敗しました。開くボタンが見つかりません。');
          return;
        }
        focusAndClickSingleVisible(browser, '[data-testid="room-floor-member-list-button"]', 'フロアメンバー一覧');
        browser.waitForElementVisible('[data-testid="dialog-floor-member-close-desktop"]', 10000);
        assertDialogKeyboardBehavior(browser, '[role="dialog"]', 'フロアメンバー一覧のダイアログ', {
          returnFocusSelector: '[data-testid="room-floor-member-list-button"]',
        });
      });

      clickButtonByText(browser, 'キック済みユーザ一覧', 'キックしたユーザのダイアログ', {
        onResult: (clicked) => {
          if (!clicked) return;
          const kickedUserDialogSelector = '[role="dialog"][aria-labelledby="kicked-user-dialog-title"]';
          browser.waitForElementVisible(kickedUserDialogSelector, 10000);
          assertDialogKeyboardBehavior(browser, kickedUserDialogSelector, 'キックしたユーザのダイアログ');
        },
      });

      browser.perform(() => {
        if (!floorId || !roomId) return;
        openResourceQuickTextDialog(browser, { resource: 'floor', floorId, roomId });
        openQuickTextDialogs(browser, 'floor', 'フロアの単語', roomId);
        openResourceQuickTextDialog(browser, { resource: 'room', floorId, roomId });
        openQuickTextDialogs(browser, 'room', 'ルームの単語', roomId);
      });
    });

    browser.end();
  },
};
