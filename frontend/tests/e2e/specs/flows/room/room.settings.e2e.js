// 返信の「全員へ通知する」による到達確認は2セッションが必要なため、このテストでは扱わない。
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const {
  loginByForm,
  openFloorList,
  openRoomList,
  clickExactFloorDialogSubmit,
  clickExactRoomDialogSubmit,
} = require('../../helpers/role-helpers');
const { logoutIfPossible, openGuestPostDialog } = require('../../helpers/guest-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const buildPostXpath = (text) => `//article[.//div[contains(@class,'text') and contains(., "${text}")]]`;

const clickFirstVisible = clickSingleVisible;

const waitForDialogClosed = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (sel) {
      const node = document.querySelector(sel);
      const visible = !!(node && (node.offsetParent || node.getClientRects().length));
      return { visible };
    },
    [selector],
    (result) => {
      const visible = result && result.value ? result.value.visible : false;
      if (!visible) {
        browser.assert.ok(true, `ダイアログが閉じました${label ? ` (${label})` : ''}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ダイアログが閉じていません${label ? ` (${label})` : ''}。`);
        return;
      }
      browser.pause(500, () => waitForDialogClosed(browser, selector, label, attempt + 1));
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

const waitForIdReady = (browser, getValue, label, attempt = 0) => {
  const maxAttempts = 12;
  browser.perform(() => {
    const value = typeof getValue === 'function' ? getValue() : getValue;
    if (value) {
      browser.assert.ok(true, `${label}を確認しました。`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `${label}を確認できませんでした。`);
      return;
    }
    browser.pause(300, () => waitForIdReady(browser, getValue, label, attempt + 1));
  });
};

const submitGuestReplyDialog = (browser) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_reply_dialog_title',
    submitSelector: '[data-testid="dialog-edit-reply-flow-submit"]',
    expectedControls: [
      {
        selector: '#reply_content',
        property: 'nonEmptyValue',
        value: true,
        requireEnabled: false,
      },
    ],
    label: 'ゲストの返信フローで送信',
  });
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

const clickRoomAction = (browser, title, actionLabel) => {
  browser.execute(
    function (payload) {
      const titles = Array.from(document.querySelectorAll('h2.room-title'));
      const targetTitle = titles.find((node) => node.textContent && node.textContent.trim() === payload.title);
      if (!targetTitle) return { clicked: false, reason: 'title-not-found' };
      const item = targetTitle.closest('li');
      if (!item) return { clicked: false, reason: 'item-not-found' };
      const actions = item.querySelector('.room-action');
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

const openTimeline = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const url = `${base}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
  navigateToApp(browser, url).waitForElementVisible('.timeline-page', 20000);
  waitForTimelineReady(browser);
};

const openRoomListAsViewer = (browser, floorId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const url = `${base}/floor/${encodeURIComponent(floorId)}`;
  navigateToApp(browser, url).waitForElementVisible('.view', 10000).waitForElementPresent('.room-list', 10000);
};

const waitForTimelineReady = (browser, attempt = 0) => {
  const maxAttempts = 20;
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

const assertInputDisabled = (browser, selector, label) => {
  browser.getAttribute(selector, 'disabled', (result) => {
    const disabled = result && result.value !== null && result.value !== undefined;
    if (!disabled) {
      browser.assert.ok(false, `入力欄が無効になっていません${label ? ` (${label})` : ''}: ${selector}`);
    } else {
      browser.assert.ok(true, `入力欄が無効です${label ? ` (${label})` : ''}: ${selector}`);
    }
  });
};

const waitForInputNotEmpty = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.getValue(selector, (result) => {
    const value = result && typeof result.value === 'string' ? result.value : '';
    if (value.trim().length > 0) {
      browser.assert.ok(true, `入力欄に値が入りました${label ? ` (${label})` : ''}。`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `入力欄に値が入りませんでした${label ? ` (${label})` : ''}。`);
      return;
    }
    browser.pause(300, () => waitForInputNotEmpty(browser, selector, label, attempt + 1));
  });
};

const clickReactionInDialog = (browser, dialogSelector, reactionName, label, onClicked) => {
  browser.execute(
    function (payload) {
      const dialogs = Array.from(document.querySelectorAll(payload.selector)).filter(
        (node) => node.offsetParent || node.getClientRects().length
      );
      if (dialogs.length !== 1) return { ok: false, reason: `dialog-count:${dialogs.length}` };
      const buttons = Array.from(dialogs[0].querySelectorAll('.reaction-group button')).filter((button) => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
        if (!(button.offsetParent || button.getClientRects().length)) return false;
        return button.getAttribute('aria-label') === `リアクション追加: ${payload.reactionName}`;
      });
      if (buttons.length !== 1) return { ok: false, reason: `reaction-count:${buttons.length}` };
      const emoji = buttons[0].textContent ? buttons[0].textContent.trim() : '';
      buttons[0].click();
      return { ok: true, emoji };
    },
    [{ selector: dialogSelector, reactionName }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false };
      if (!state.ok) {
        browser.assert.ok(false, `リアクションをクリックできませんでした${label ? ` (${label})` : ''}: ${state.reason || 'unknown'}`);
        return;
      }
      if (onClicked) onClicked(state.emoji || '');
    }
  );
};

const waitForPostTextContains = (browser, text, label, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (payload) {
      const nodes = Array.from(document.querySelectorAll('article:not(.wrapper) .text'));
      return nodes.some((node) => node.textContent && node.textContent.includes(payload.text));
    },
    [{ text }],
    (result) => {
      const found = result && typeof result.value === 'boolean' ? result.value : false;
      if (found) {
        browser.assert.ok(true, `投稿の本文が見つかりました${label ? ` (${label})` : ''}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `投稿の本文が見つかりません${label ? ` (${label})` : ''}。`);
        return;
      }
      browser.pause(500, () => waitForPostTextContains(browser, text, label, attempt + 1));
    }
  );
};

const waitForXButtonInPost = (browser, text, label, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (payload) {
      const posts = Array.from(document.querySelectorAll('article:not(.wrapper)'));
      const target = posts.find((post) => {
        const node = post.querySelector('.text');
        return node && node.textContent && node.textContent.includes(payload.text);
      });
      if (!target) return { ok: false, reason: 'post-not-found' };
      const xItem = target.querySelector('.x-item');
      const visible = !!(xItem && (xItem.offsetParent || xItem.getClientRects().length));
      return { ok: true, visible };
    },
    [{ text }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, visible: false };
      if (!state.ok) {
        if (attempt >= maxAttempts) {
          browser.assert.ok(false, `Xボタンが見つかりません${label ? ` (${label})` : ''}。`);
          return;
        }
        browser.pause(500, () => waitForXButtonInPost(browser, text, label, attempt + 1));
        return;
      }
      if (state.visible) {
        browser.assert.ok(true, `Xボタンが表示されています${label ? ` (${label})` : ''}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `Xボタンが表示されていません${label ? ` (${label})` : ''}。`);
        return;
      }
      browser.pause(500, () => waitForXButtonInPost(browser, text, label, attempt + 1));
    }
  );
};

module.exports = {
  'ルームの表示設定とゲストのリアクション限定設定を反映する': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const userMail = requireEnv('E2E_USER_MAIL');
    const userPassword = requireEnv('E2E_USER_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Room Setting Floor ${stamp}`;
    const roomTitle = `E2E Room Setting ${stamp}`;
    const userPostText = `E2E X Post ${stamp}`;

    let floorId = '';
    let roomId = '';

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
      .setValue('#edit_floor_description', 'E2E room setting floor description.');
    clickExactFloorDialogSubmit(browser, {
      title: floorTitle,
      description: 'E2E room setting floor description.',
      filesLength: 0,
      imageState: 'none',
      label: 'フロアの作成を確定',
    });
    waitForDialogClosed(browser, '#edit_floor_title', 'フロアを作成');
    waitForFloorTitle(browser, floorTitle, true);

    findFloorIdByTitle(browser, floorTitle, (resolvedFloorId) => {
      floorId = resolvedFloorId;
    });

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
        .setValue('#room_description', 'E2E room setting description.');
      browser.click('label[for="guest_reaction_only"]');
      browser.click('label[for="external_sns_button"]');
      browser.click('label[for="hidden_flg"]');
      clickExactRoomDialogSubmit(browser, {
        title: roomTitle,
        description: 'E2E room setting description.',
        guestReactionOnly: true,
        externalSnsButton: true,
        displayHidden: true,
        filesLength: 0,
        imageState: 'none',
        label: 'ルームの作成を確定',
      });
      waitForDialogClosed(browser, '#room_title', 'ルームを作成');
      waitForRoomTitle(browser, roomTitle, true);
      findRoomIdByTitle(browser, roomTitle, (resolvedRoomId) => {
        roomId = resolvedRoomId;
      });
    });

    waitForIdReady(browser, () => floorId, 'floorId');
    waitForIdReady(browser, () => roomId, 'roomId');

    browser.perform(() => {
      logoutIfPossible(browser);
      loginByForm(browser, { mail: userMail, password: userPassword });
      browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
      openRoomListAsViewer(browser, floorId);
      waitForRoomTitle(browser, roomTitle, false);
      logoutIfPossible(browser);
    });

    browser.perform(() => {
      openRoomListAsViewer(browser, floorId);
      waitForRoomTitle(browser, roomTitle, false);
    });

    browser.perform(() => {
      loginByForm(browser, { mail: editorMail, password: editorPassword });
      browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
      waitForUserRole(browser, 'Editor');
      openRoomList(browser, floorId);
      clickRoomAction(browser, roomTitle, '編集');
      browser.waitForElementVisible('#room_title', 10000);
      browser.click('label[for="hidden_flg"]');
      clickExactRoomDialogSubmit(browser, {
        title: roomTitle,
        description: 'E2E room setting description.',
        guestReactionOnly: true,
        externalSnsButton: true,
        displayHidden: false,
        imageState: 'none',
        label: 'ルームの編集を確定',
      });
      waitForDialogClosed(browser, '#room_title', 'ルームを編集');
      waitForRoomTitle(browser, roomTitle, true);
      logoutIfPossible(browser);
    });

    browser.perform(() => {
      loginByForm(browser, { mail: userMail, password: userPassword });
      browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
      openRoomListAsViewer(browser, floorId);
      waitForRoomTitle(browser, roomTitle, true);
    });

    browser.perform(() => {
      if (!floorId || !roomId) {
        browser.assert.ok(false, 'タイムラインに必要なフロアIDまたはルームIDがありません。');
        return;
      }
      openTimeline(browser, floorId, roomId);
      browser.waitForElementVisible('[data-testid="timeline-post-button"]', 10000);
      clickFirstVisible(browser, '[data-testid="timeline-post-button"]', '投稿ダイアログを開く');
      browser.waitForElementVisible('[data-testid="dialog-edit-post"]', 10000);
      browser.clearValue('#post_content').setValue('#post_content', userPostText);
      clickSingleVisibleAfterExactControls(browser, {
        anchorSelector: '#edit_post_dialog_title',
        submitSelector: '[data-testid="dialog-edit-post-submit"]',
        expectedControls: [{ selector: '#post_content', value: userPostText }],
        label: '投稿を送信',
      });
      waitForDialogClosed(browser, '[data-testid="dialog-edit-post"]', '投稿を送信');
      waitForPostTextContains(browser, userPostText, 'x post');
      waitForXButtonInPost(browser, userPostText, 'x button');
      logoutIfPossible(browser);
    });

    browser.perform(() => {
      if (!floorId || !roomId) {
        browser.assert.ok(false, 'ゲストのタイムラインに必要なフロアIDまたはルームIDがありません。');
        return;
      }
      openTimeline(browser, floorId, roomId);

      openGuestPostDialog(browser);
      assertInputDisabled(browser, '#post_content', 'ゲストの投稿');
      clickReactionInDialog(browser, '[data-testid="dialog-edit-post"]', 'いいね', 'ゲストの投稿へのリアクション');
      browser.pause(300);
      waitForInputNotEmpty(browser, '#post_content', 'ゲストの投稿');
      clickSingleVisibleAfterExactControls(browser, {
        anchorSelector: '#edit_post_dialog_title',
        submitSelector: '[data-testid="dialog-edit-post-submit"]',
        expectedControls: [
          {
            selector: '#post_content',
            property: 'nonEmptyValue',
            value: true,
            requireEnabled: false,
          },
        ],
        label: 'ゲストの投稿を送信',
      });
      waitForDialogClosed(browser, '[data-testid="dialog-edit-post"]', 'ゲストの投稿を送信');

      const postXpath = buildPostXpath(userPostText);
      browser.useXpath().waitForElementVisible(postXpath, 10000).useCss();
      browser.useXpath().click(`${postXpath}//button[@data-testid='timeline-post-reply-button']`).useCss();
      browser.waitForElementVisible('[data-testid="dialog-edit-reply"]', 10000);
      assertInputDisabled(browser, '#reply_content', 'ゲストの返信');
      clickReactionInDialog(browser, '[data-testid="dialog-edit-reply"]', '超いいね', 'ゲストの返信へのリアクション');
      browser.pause(300);
      waitForInputNotEmpty(browser, '#reply_content', 'ゲストの返信');
      submitGuestReplyDialog(browser);
      waitForDialogClosed(browser, '[data-testid="dialog-edit-reply"]', 'ゲストの返信を送信');

      logoutIfPossible(browser);
    });

    browser.end();
  },
};
