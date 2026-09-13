const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm, openFloorList, openRoomList } = require('../../helpers/role-helpers');
const { logoutIfPossible } = require('../../helpers/guest-helpers');
const { clickSingleVisible } = require('../../helpers/dialog-focus');

const CATEGORY_TAG_DIALOG_TITLE_ID = 'category-tag-management-dialog-title';
const CATEGORY_TAG_DIALOG_SELECTOR =
  `[role="dialog"][aria-labelledby="${CATEGORY_TAG_DIALOG_TITLE_ID}"]`;
const CATEGORY_TAG_SUBMIT_SELECTOR =
  `${CATEGORY_TAG_DIALOG_SELECTOR} [data-testid="management-categorytag-submit"]:not([disabled])`;
const FLOOR_TAG_DIALOG_TITLE_ID = 'floor_tag_dialog_title';
const ROOM_TAG_DIALOG_TITLE_ID = 'room_tag_dialog_title';

const buildPostXpath = (text) =>
  `//article[./div[contains(concat(" ", normalize-space(@class), " "), " post ")]]` +
  `[.//div[contains(@class,"text") and contains(., "${text}")]]`;
const buildReplyXpath = (text) =>
  `//article[contains(concat(" ", normalize-space(@class), " "), " wrapper ")]` +
  `[.//div[contains(@class,"text") and contains(., "${text}")]]`;

const clickFirstVisible = clickSingleVisible;

const clickButtonByText = (browser, text, label) => {
  browser.execute(
    function (targetText) {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find(
        (btn) => btn.textContent && btn.textContent.trim() === targetText && btn.offsetParent !== null
      );
      if (!target) return { clicked: false, reason: 'button-not-found' };
      target.click();
      return { clicked: true };
    },
    [text],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        const suffix = label ? ` (${label})` : '';
        browser.assert.ok(false, `ボタンをクリックできませんでした${suffix}: ${reason}`);
      }
    }
  );
};

const waitForDialogToClose = (browser, dialogSelector, label) => {
  browser.useCss().waitForElementNotVisible(dialogSelector, 15000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `ダイアログが閉じませんでした${label ? ` (${label})` : ''}: ${dialogSelector}`);
    }
  });
};

const waitForXpathVisible = (browser, xpath, label) => {
  browser.useXpath().waitForElementVisible(xpath, 10000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `要素が表示されていません${label ? ` (${label})` : ''}: ${xpath}`);
    }
  });
  browser.useCss();
};

const waitForTimelineReady = (browser, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      const node = document.querySelector('[data-testid="timeline-connected"]');
      const visible = !!(node && (node.offsetParent || node.getClientRects().length));
      return { visible };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { visible: false };
      if (state.visible) {
        browser.assert.ok(true, 'タイムラインに接続しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'タイムラインに接続されていません。');
        return;
      }
      browser.pause(1000, () => waitForTimelineReady(browser, attempt + 1));
    }
  );
};

const waitForUserRole = (browser, expectedRole, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function () {
      try {
        const raw = localStorage.getItem('iseeetl_store');
        if (!raw) return { ok: false, role: null };
        const data = JSON.parse(raw);
        return { ok: true, role: data && data.user ? data.user.role : null };
      } catch (_) {
        return { ok: false, role: null };
      }
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, role: null };
      if (state.ok && state.role === expectedRole) {
        browser.assert.ok(true, `ユーザの権限を確認しました: ${expectedRole}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ユーザの権限が一致しません: 期待値=${expectedRole} 実際=${state.role || 'unknown'}`);
        return;
      }
      browser.pause(500, () => waitForUserRole(browser, expectedRole, attempt + 1));
    }
  );
};

const waitForFloorTitle = (browser, title, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      return titles.some((node) => node.textContent && node.textContent.trim() === targetTitle);
    },
    [title],
    (result) => {
      const found = result && typeof result.value === 'boolean' ? result.value : false;
      if (found) {
        browser.assert.ok(true, `フロア名が見つかりました: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `フロア名が見つかりません: ${title}`);
        return;
      }
      browser.pause(500, () => waitForFloorTitle(browser, title, attempt + 1));
    }
  );
};

const waitForRoomTitle = (browser, title, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (targetTitle) {
      const titles = Array.from(document.querySelectorAll('h2.room-title'));
      return titles.some((node) => node.textContent && node.textContent.trim() === targetTitle);
    },
    [title],
    (result) => {
      const found = result && typeof result.value === 'boolean' ? result.value : false;
      if (found) {
        browser.assert.ok(true, `ルーム名が見つかりました: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ルーム名が見つかりません: ${title}`);
        return;
      }
      browser.pause(500, () => waitForRoomTitle(browser, title, attempt + 1));
    }
  );
};

const openCategoryTagManagement = (browser, search) => {
  const base = getBaseUrl(browser);
  const query = search ? `?q=${encodeURIComponent(search)}` : '';
  const url = `${base.replace(/\/$/, '')}/management/categorytag${query}`;
  navigateToApp(browser, url).waitForElementVisible(
    '[data-testid="management-categorytag-create"]:not(:disabled)',
    10000
  );
};

const clickCreateButton = (browser) => {
  browser.execute(
    function () {
      const button = document.querySelector('[data-testid="management-categorytag-create"]');
      if (!button) return { clicked: false, reason: 'button-not-found' };
      button.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `作成ボタンをクリックできませんでした: ${reason}`);
      }
    }
  );
};

const waitForCategoryTagDialogVisible = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (selector) {
      const isVisible = (el) => !!(el && (el.offsetParent || el.getClientRects().length));
      const dialog = document.querySelector(selector);
      return { visible: isVisible(dialog) };
    },
    [CATEGORY_TAG_DIALOG_SELECTOR],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (visible) {
        browser.assert.ok(true, '共通タグのダイアログが表示されています。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '共通タグのダイアログが表示されていません。');
        return;
      }
      browser.pause(500, () => waitForCategoryTagDialogVisible(browser, attempt + 1));
    }
  );
};

const waitForCategoryTagDialogClosed = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (selector) {
      const isVisible = (el) => !!(el && (el.offsetParent || el.getClientRects().length));
      const dialog = document.querySelector(selector);
      return { visible: isVisible(dialog) };
    },
    [CATEGORY_TAG_DIALOG_SELECTOR],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (!visible) {
        browser.assert.ok(true, '共通タグのダイアログが閉じました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '共通タグのダイアログが閉じていません。');
        return;
      }
      browser.pause(500, () => waitForCategoryTagDialogClosed(browser, attempt + 1));
    }
  );
};

const setCategoryTagDialogValues = (browser, { order, name }) => {
  browser.execute(
    function (payload) {
      const dialog = document.querySelector(payload.dialogSelector);
      if (!dialog) return { ok: false, reason: 'dialog-not-found' };

      const numberInput = dialog.querySelector('#category-tag-order');
      const textInput = dialog.querySelector('#category-tag-name');
      if (!numberInput || !textInput) return { ok: false, reason: 'input-not-found' };

      numberInput.value = String(payload.order);
      numberInput.dispatchEvent(new Event('input', { bubbles: true }));
      textInput.value = payload.name;
      textInput.dispatchEvent(new Event('input', { bubbles: true }));

      return { ok: true };
    },
    [
      {
        dialogSelector: CATEGORY_TAG_DIALOG_SELECTOR,
        order,
        name,
      },
    ],
    (result) => {
      const ok = result && result.value ? result.value.ok : false;
      if (!ok) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `ダイアログの値を設定できませんでした: ${reason}`);
      }
    }
  );
};

const clickCategoryTagDialogSubmit = (browser) => {
  clickSingleVisible(browser, CATEGORY_TAG_SUBMIT_SELECTOR, '共通タグ管理の入力を送信');
};

const waitForFetchIdle = (browser, attempt = 0, done) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const view = document.querySelector('.view');
      return { fetching: view ? view.getAttribute('aria-busy') === 'true' : null };
    },
    [],
    (result) => {
      const fetching = result && result.value ? result.value.fetching : null;
      if (fetching === false || fetching === null) {
        if (done) done();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '取得処理が続いています。');
        return;
      }
      browser.pause(300, () => waitForFetchIdle(browser, attempt + 1, done));
    }
  );
};

const waitForCategoryTagInList = (browser, tagName, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (name) {
      const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
      return rows.some((row) => row.textContent && row.textContent.includes(name));
    },
    [tagName],
    (result) => {
      const found = result && typeof result.value === 'boolean' ? result.value : false;
      if (found) {
        browser.assert.ok(true, `共通タグが一覧に表示されています: ${tagName}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `共通タグが一覧に表示されていません: ${tagName}`);
        return;
      }
      browser.pause(500, () => waitForCategoryTagInList(browser, tagName, attempt + 1));
    }
  );
};

const openFloorTagDialog = (browser) => {
  clickButtonByText(browser, 'フロアタグ', 'フロアタグのダイアログを開く');
  browser.waitForElementVisible(`#${FLOOR_TAG_DIALOG_TITLE_ID}`, 10000);
};

const openRoomTagDialog = (browser, roomId) => {
  browser
    .waitForElementVisible(`.roomtag-button-${roomId}`, 10000)
    .click(`.roomtag-button-${roomId}`)
    .waitForElementVisible(`#${ROOM_TAG_DIALOG_TITLE_ID}`, 10000);
};

const waitForTagInDialog = (browser, titleId, tagName, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (dialogTitleId, name) {
      const title = document.getElementById(dialogTitleId);
      if (!title) return { found: false, reason: 'title-not-found' };
      const dialog = title.closest('[role="dialog"]');
      if (!dialog) return { found: false, reason: 'dialog-not-found' };
      const rows = Array.from(dialog.querySelectorAll('table.tag-table tbody tr'));
      const found = rows.some((row) => row.textContent && row.textContent.includes(name));
      return { found };
    },
    [titleId, tagName],
    (result) => {
      const state = result && result.value ? result.value : { found: false };
      if (state.found) {
        browser.assert.ok(true, `ダイアログにタグが見つかりました: ${tagName}`);
        return;
      }
      if (attempt >= maxAttempts) {
        const reason = state.reason || 'not-found';
        browser.assert.ok(false, `ダイアログにタグが見つかりません: ${tagName}（${reason}）`);
        return;
      }
      browser.pause(500, () => waitForTagInDialog(browser, titleId, tagName, attempt + 1));
    }
  );
};

const closeDialogByText = (browser, titleId, label) => {
  browser.execute(
    function (id) {
      const title = document.getElementById(id);
      if (!title) return { clicked: false, reason: 'title-not-found' };
      const dialog = title.closest('[role="dialog"]');
      if (!dialog) return { clicked: false, reason: 'dialog-not-found' };
      const buttons = Array.from(dialog.querySelectorAll('button'));
      const closeButton = buttons.find((btn) => btn.textContent && btn.textContent.trim() === '閉じる');
      if (!closeButton) return { clicked: false, reason: 'close-not-found' };
      closeButton.click();
      return { clicked: true };
    },
    [titleId],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `ダイアログを閉じる操作をクリックできませんでした${label ? ` (${label})` : ''}: ${reason}`);
      }
    }
  );
};

const openEditPostDialog = (browser) => {
  browser
    .waitForElementVisible('[data-testid="timeline-post-button"]', 10000)
    .perform((done) => {
      clickFirstVisible(browser, '[data-testid="timeline-post-button"]', '投稿ボタン');
      done();
    })
    .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000);
};

const submitPost = (browser, text) => {
  openEditPostDialog(browser);
  browser
    .clearValue('#post_content')
    .setValue('#post_content', text)
    .perform((done) => {
      clickFirstVisible(browser, '.desktop-item[data-testid="dialog-edit-post-submit"]', '送信');
      done();
    });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', '投稿を送信');
};

const openReplyDialogByXpath = (browser, postXpath) => {
  browser
    .useXpath()
    .waitForElementVisible(postXpath, 10000)
    .click(`${postXpath}//button[@data-testid='timeline-post-reply-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-edit-reply"]', 10000);
};

const submitReply = (browser, postXpath, text) => {
  openReplyDialogByXpath(browser, postXpath);
  browser
    .clearValue('#reply_content')
    .setValue('#reply_content', text)
    .perform((done) => {
      clickFirstVisible(browser, '.desktop-item[data-testid="dialog-edit-reply-submit"]', '返信を送信');
      done();
    });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-reply"]', '返信を送信');
};

const openTagDialogForPost = (browser, postXpath) => {
  browser.execute(
    function (xpathExpr) {
      const result = document.evaluate(xpathExpr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength === 0) return { clicked: false, reason: 'post-not-found' };
      const post = result.snapshotItem(0);
      const button = post.querySelector('[data-testid="timeline-post-tag-button"]');
      if (!button) return { clicked: false, reason: 'button-not-found' };
      button.click();
      return { clicked: true };
    },
    [postXpath],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `投稿のタグボタンをクリックできませんでした: ${reason}`);
      }
    }
  );
  browser.waitForElementVisible('[data-testid="dialog-edit-tag"]', 10000);
};

const openTagDialogForReply = (browser, replyXpath) => {
  browser.execute(
    function (xpathExpr) {
      const result = document.evaluate(xpathExpr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength === 0) return { clicked: false, reason: 'reply-not-found' };
      const reply = result.snapshotItem(0);
      const button = reply.querySelector('button[aria-label="タグ更新"]');
      if (!button) return { clicked: false, reason: 'button-not-found' };
      button.click();
      return { clicked: true };
    },
    [replyXpath],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `返信のタグボタンをクリックできませんでした: ${reason}`);
      }
    }
  );
  browser.waitForElementVisible('[data-testid="dialog-edit-tag"]', 10000);
};

const selectTagByNameInDialog = (browser, tagName) => {
  browser.execute(
    function (name) {
      const dialog = document.querySelector('[data-testid="dialog-edit-tag"]');
      if (!dialog) return { clicked: false, reason: 'dialog-not-found' };
      const labels = Array.from(dialog.querySelectorAll('.checkbox-label'));
      const label = labels.find((node) => node.textContent && node.textContent.trim() === name);
      if (!label) return { clicked: false, reason: 'label-not-found' };
      const id = label.getAttribute('for');
      const checkbox = id
        ? Array.from(dialog.querySelectorAll('input[type="checkbox"]')).find((node) => node.id === id)
        : null;
      if (!checkbox) return { clicked: false, reason: 'checkbox-not-found' };
      checkbox.click();
      return { clicked: true, checked: checkbox.checked };
    },
    [tagName],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (!state.clicked) {
        const reason = state.reason || 'unknown';
        browser.assert.ok(false, `タグのチェックボックスをクリックできませんでした: ${reason}`);
        return;
      }
      browser.assert.ok(state.checked, `タグのチェックボックスを選択しました: ${tagName}`);
    }
  );
};

const submitTagDialog = (browser, label) => {
  clickFirstVisible(browser, '[data-testid="dialog-edit-tag-submit-desktop"]', label || 'タグの入力を送信');
  waitForDialogToClose(browser, '[data-testid="dialog-edit-tag"]', 'タグの入力を送信');
};

const waitForTagDisplayedInItemByXpath = (browser, xpath, tagName, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (xpathExpr, name) {
      const result = document.evaluate(xpathExpr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength === 0) return { found: false, reason: 'item-not-found' };
      const items = Array.from({ length: result.snapshotLength }, (_, index) => result.snapshotItem(index));
      const tags = items.flatMap((item) => Array.from(item.querySelectorAll('.tag-button')));
      const found = tags.some((node) => node.textContent && node.textContent.trim() === `#${name}`);
      return {
        found,
        reason: found ? null : 'tag-not-found',
        itemCount: items.length,
        tagContainerCount: items.filter((item) => item.querySelector('.tags')).length,
        tagButtonCount: tags.length,
      };
    },
    [xpath, tagName],
    (result) => {
      const state = result && result.value ? result.value : { found: false, reason: 'unknown' };
      if (state.found) {
        browser.assert.ok(true, `タグが表示されています${label ? ` (${label})` : ''}: ${tagName}`);
        return;
      }
      if (attempt >= maxAttempts) {
        const detail = `items=${state.itemCount || 0} containers=${state.tagContainerCount || 0} buttons=${
          state.tagButtonCount || 0
        }`;
        browser.assert.ok(false, `タグが表示されていません${label ? ` (${label})` : ''}: ${state.reason}（${detail}）`);
        return;
      }
      browser.pause(500, () => waitForTagDisplayedInItemByXpath(browser, xpath, tagName, label, attempt + 1));
    }
  );
};

const openTimeline = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const url = `${base}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
  navigateToApp(browser, url).waitForElementVisible('.timeline-page', 20000);
  waitForTimelineReady(browser);
};

module.exports = {
  '共通タグをフロア・ルームへコピーし、投稿と返信で利用できる': (browser) => {
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const tagName = `E2E Common Tag ${stamp}`;
    const floorTitle = `E2E Tag Floor ${stamp}`;
    const roomTitle = `E2E Tag Room ${stamp}`;
    const postText = `E2E Tag Post ${stamp}`;
    const replyText = `E2E Tag Reply ${stamp}`;
    loginByForm(browser, { mail: adminMail, password: adminPassword });
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    openCategoryTagManagement(browser);
    clickCreateButton(browser);
    waitForCategoryTagDialogVisible(browser);
    setCategoryTagDialogValues(browser, { order: 1, name: tagName });
    clickCategoryTagDialogSubmit(browser);
    waitForCategoryTagDialogClosed(browser);
    waitForFetchIdle(browser, 0, () => {
      // タグ追加後の表示反映を待つため、管理一覧を再取得する。
      openCategoryTagManagement(browser, tagName);
      waitForFetchIdle(browser, 0, () => waitForCategoryTagInList(browser, tagName));
    });

    logoutIfPossible(browser);
    loginByForm(browser, { mail: editorMail, password: editorPassword });
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    openFloorList(browser);
    browser.waitForElementVisible('[data-testid="floor-list-create-button"]', 10000);
    clickFirstVisible(browser, '[data-testid="floor-list-create-button"]', 'フロアの作成画面を開く');
    browser
      .waitForElementVisible('#edit_floor_title', 10000)
      .clearValue('#edit_floor_title')
      .setValue('#edit_floor_title', floorTitle)
      .clearValue('#edit_floor_description')
      .setValue('#edit_floor_description', 'E2E tag propagation floor');
    clickFirstVisible(browser, '[data-testid="base-edit-dialog-confirm"]', 'フロアの作成を確定');
    waitForDialogToClose(browser, '#edit_floor_title', 'フロアを作成');
    waitForFloorTitle(browser, floorTitle);

    let floorId = '';
    let roomId = '';
    browser.execute(
      function (title) {
        const titles = Array.from(document.querySelectorAll('h2.floor-title'));
        const target = titles.find((node) => node.textContent && node.textContent.trim() === title);
        if (!target) return { ok: false, reason: 'title-not-found' };
        const link = target.closest('a');
        const href = link ? link.getAttribute('href') : null;
        return { ok: !!href, href };
      },
      [floorTitle],
      (result) => {
        const value = result && result.value ? result.value : {};
        const href = value.href || '';
        const match = href.match(/\/floor\/([^/?#]+)/);
        floorId = match ? match[1] : '';
        if (!floorId) {
          const reason = value.reason || 'floor-id-not-found';
          browser.assert.ok(false, `フロアIDを取得できませんでした: ${reason}`);
        }
      }
    );

    browser.perform(() => {
      if (!floorId) {
        browser.assert.ok(false, 'フロアIDが空です。');
        return;
      }
      openRoomList(browser, floorId);
      browser.waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
      clickFirstVisible(browser, '[data-testid="room-list-create-button"]', 'ルームの作成画面を開く');
      browser
        .waitForElementVisible('#room_title', 10000)
        .clearValue('#room_title')
        .setValue('#room_title', roomTitle)
        .clearValue('#room_description')
        .setValue('#room_description', 'E2E tag propagation room');
      clickFirstVisible(browser, '[data-testid="base-edit-dialog-confirm"]', 'ルームの作成を確定');
      waitForDialogToClose(browser, '#room_title', 'ルームを作成');
      waitForRoomTitle(browser, roomTitle);

      browser.execute(
        function (title) {
          const titles = Array.from(document.querySelectorAll('h2.room-title'));
          const target = titles.find((node) => node.textContent && node.textContent.trim() === title);
          if (!target) return { ok: false, reason: 'title-not-found' };
          const link = target.closest('a');
          const href = link ? link.getAttribute('href') : null;
          return { ok: !!href, href };
        },
        [roomTitle],
        (result) => {
          const value = result && result.value ? result.value : {};
          const href = value.href || '';
          const match = href.match(/\/room\/([^/?#]+)/);
          roomId = match ? match[1] : '';
          if (!roomId) {
            const reason = value.reason || 'room-id-not-found';
            browser.assert.ok(false, `ルームIDを取得できませんでした: ${reason}`);
          }
        }
      );
    });

    browser.perform(() => {
      openFloorTagDialog(browser);
      waitForTagInDialog(browser, FLOOR_TAG_DIALOG_TITLE_ID, tagName);
      closeDialogByText(browser, FLOOR_TAG_DIALOG_TITLE_ID, 'フロアタグの画面を閉じる');
      browser.waitForElementNotVisible(`#${FLOOR_TAG_DIALOG_TITLE_ID}`, 10000);
    });

    browser.perform(() => {
      if (!roomId) {
        browser.assert.ok(false, 'ルームIDが空です。');
        return;
      }
      openRoomTagDialog(browser, roomId);
      waitForTagInDialog(browser, ROOM_TAG_DIALOG_TITLE_ID, tagName);
      closeDialogByText(browser, ROOM_TAG_DIALOG_TITLE_ID, 'ルームタグの画面を閉じる');
      browser.waitForElementNotVisible(`#${ROOM_TAG_DIALOG_TITLE_ID}`, 10000);
    });

    browser.perform(() => {
      if (!floorId || !roomId) {
        browser.assert.ok(false, 'タイムラインに必要なフロアIDまたはルームIDがありません。');
        return;
      }
      openTimeline(browser, floorId, roomId);
      submitPost(browser, postText);
      const postXpath = buildPostXpath(postText);
      waitForXpathVisible(browser, postXpath, 'タグ付き投稿');
      submitReply(browser, postXpath, replyText);
      const replyXpath = buildReplyXpath(replyText);
      waitForXpathVisible(browser, replyXpath, 'タグ付き返信');
    });

    // 他者の投稿・返信へのタグ変更を検証するため、投稿者と異なる管理者で操作する。
    browser.perform(() => {
      if (!floorId || !roomId) {
        browser.assert.ok(false, '管理者のタイムラインに必要なフロアIDまたはルームIDがありません。');
        return;
      }
      logoutIfPossible(browser);
      loginByForm(browser, { mail: adminMail, password: adminPassword });
      browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
      waitForUserRole(browser, 'Administrator');
      openTimeline(browser, floorId, roomId);
      const postXpath = buildPostXpath(postText);
      waitForXpathVisible(browser, postXpath, '管理者のタグ付き投稿');
      openTagDialogForPost(browser, postXpath);
      selectTagByNameInDialog(browser, tagName);
      submitTagDialog(browser, '投稿のタグを送信');
      waitForTagDisplayedInItemByXpath(browser, postXpath, tagName, '投稿のタグ');

      const replyXpath = buildReplyXpath(replyText);
      waitForXpathVisible(browser, replyXpath, '管理者のタグ付き返信');
      openTagDialogForReply(browser, replyXpath);
      selectTagByNameInDialog(browser, tagName);
      submitTagDialog(browser, '返信のタグを送信');
      waitForTagDisplayedInItemByXpath(browser, replyXpath, tagName, '返信のタグ');
    });

    browser.end();
  },
};
