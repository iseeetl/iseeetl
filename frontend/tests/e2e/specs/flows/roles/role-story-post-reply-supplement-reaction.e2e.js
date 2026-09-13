const { getBaseUrl, loginToTimeline, navigateToApp, requireEnv } = require('../../helpers/login');
const {
  openLogin,
  loginByForm,
  openFloorList,
  openRoomList,
  clickExactFloorDialogSubmit,
  clickExactRoomDialogSubmit,
} = require('../../helpers/role-helpers');
const { logoutIfPossible } = require('../../helpers/guest-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const DIALOG_CLOSE_TIMEOUT_MS = 15000;
const ROLE_STORY_TAG_MARKER = 'data-e2e-role-story-tag';

const clickFirstVisible = clickSingleVisible;

const waitForDialogToClose = (browser, dialogSelector, label) => {
  browser.useCss().waitForElementNotVisible(dialogSelector, DIALOG_CLOSE_TIMEOUT_MS, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `ダイアログが閉じませんでした${label ? ` (${label})` : ''}: ${dialogSelector}`);
    }
  });
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

const collectTimelineDiagnostics = (browser, callback) => {
  browser.execute(
    function () {
      const readStore = () => {
        try {
          const raw = localStorage.getItem('iseeetl_store');
          if (!raw) return { hasStore: false };
          const data = JSON.parse(raw);
          const user = data && data.user ? data.user : {};
          const room = data && data.room ? data.room : {};
          const floor = data && data.floor ? data.floor : {};
          return {
            hasStore: true,
            isLogin: !!user.isLogin,
            hasToken: !!user.token,
            role: user.role || null,
            roomId: room.id || null,
            floorId: floor.id || null,
          };
        } catch (err) {
          return { hasStore: false, parseError: true };
        }
      };
      return {
        url: window.location.href,
        readyState: document.readyState,
        connected: !!document.querySelector('[data-testid="timeline-connected"]'),
        store: readStore(),
      };
    },
    [],
    (execResult) => {
      const timelineState = execResult && execResult.value ? execResult.value : {};
      callback(timelineState);
    }
  );
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
        collectTimelineDiagnostics(browser, (timelineState) => {
          browser.assert.ok(false, `タイムラインに接続されていません: ${JSON.stringify(timelineState)}`);
        });
        return;
      }
      browser.pause(1000, () => waitForTimelineReady(browser, attempt + 1));
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
          submitSelector: '[data-testid="dialog-sound-caution-confirm"]',
          expectedControls: [],
          label: '音声に関する注意を確認',
        });
        browser.waitForElementNotVisible('[data-testid="dialog-sound-caution"]', 10000);
      }
    }
  );
};

const confirmGuestRulesIfVisible = (browser) => {
  browser.pause(200).execute(
    function () {
      const dialog = document.querySelector('[data-testid="dialog-guest-rules"]');
      return { visible: !!(dialog && (dialog.offsetParent || dialog.getClientRects().length)) };
    },
    [],
    (result) => {
      if (!result || !result.value || result.value.visible !== true) return;
      clickSingleVisibleAfterExactControls(browser, {
        anchorSelector: '#guest_rules_dialog_title',
        submitSelector: '[data-testid="dialog-guest-rules-confirm"]',
        expectedControls: [],
        label: 'ゲストの利用ルールを確定',
      });
    }
  );
};

const openGuestTimeline = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const url = `${base}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
  navigateToApp(browser, url).waitForElementVisible('.timeline-page', 20000);
  waitForTimelineReady(browser);
};

const waitForXpathVisible = (browser, xpath, label) => {
  browser.useXpath().waitForElementVisible(xpath, 10000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `要素が表示されていません${label ? ` (${label})` : ''}: ${xpath}`);
    }
  });
  browser.useCss();
};

const waitForXpathNotPresent = (browser, xpath) => {
  browser.useXpath().waitForElementNotPresent(xpath, 10000, false);
  browser.useCss();
};

const clickDialogButtonWhenEnabled = (browser, dialogTitleId, labelText, label, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function (payload) {
      const title = document.getElementById(payload.dialogTitleId);
      if (!title) return { clicked: false, reason: 'title-not-found' };
      const dialog = title.closest('[role="dialog"]');
      if (!dialog || !(dialog.offsetParent || dialog.getClientRects().length)) {
        return { clicked: false, reason: 'dialog-not-visible' };
      }
      const buttons = Array.from(dialog.querySelectorAll('button'));
      const target = buttons.find((btn) => btn.textContent && btn.textContent.trim() === payload.labelText);
      if (!target) return { clicked: false, reason: 'button-not-found' };
      if (target.disabled) return { clicked: false, reason: 'button-disabled' };
      target.click();
      return { clicked: true };
    },
    [{ dialogTitleId, labelText }],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (clicked) return;
      const reason = result && result.value ? result.value.reason : 'unknown';
      if (attempt >= maxAttempts) {
        const suffix = label ? ` (${label})` : '';
        browser.assert.ok(false, `ダイアログの有効なボタンをクリックできませんでした${suffix}: ${reason}`);
        return;
      }
      browser.pause(500, () => clickDialogButtonWhenEnabled(browser, dialogTitleId, labelText, label, attempt + 1));
    }
  );
};

const buildPostXpath = (text) => `//article[.//div[contains(@class,'text') and contains(., "${text}")]]`;
const buildReplyXpath = (text) =>
  `//article[contains(@class,'wrapper')][.//div[contains(@class,'text') and contains(., "${text}")]]`;
const buildSupplementXpath = (text) =>
  "//article[contains(@class,'supplement')][.//div[contains(@class,'supplement-content') and contains(., '" +
  text +
  "')]]";

const createFloor = (browser, title) => {
  clickFirstVisible(browser, '[data-testid="floor-list-create-button"]', 'フロアの作成画面を開く');
  browser
    .waitForElementVisible('#edit_floor_title', 10000)
    .clearValue('#edit_floor_title')
    .setValue('#edit_floor_title', title)
    .clearValue('#edit_floor_description')
    .setValue('#edit_floor_description', 'E2E role collaboration floor');
  clickExactFloorDialogSubmit(browser, {
    title,
    description: 'E2E role collaboration floor',
    filesLength: 0,
    imageState: 'none',
    label: 'フロアの作成を確定',
  });
  waitForDialogToClose(browser, '#edit_floor_title', 'フロアを作成');
};

const createRoom = (browser, title) => {
  clickFirstVisible(browser, '[data-testid="room-list-create-button"]', 'ルームの作成画面を開く');
  browser
    .waitForElementVisible('#room_title', 10000)
    .clearValue('#room_title')
    .setValue('#room_title', title)
    .clearValue('#room_description')
    .setValue('#room_description', 'E2E role collaboration room');
  clickExactRoomDialogSubmit(browser, {
    title,
    description: 'E2E role collaboration room',
    filesLength: 0,
    imageState: 'none',
    label: 'ルームの作成を確定',
  });
  waitForDialogToClose(browser, '#room_title', 'ルームを作成');
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

const ensureStoryFloorRoom = (browser, credentials, floorTitle, roomTitle) => {
  openLogin(browser);
  loginByForm(browser, { mail: credentials.mail, password: credentials.password });
  waitForUserRole(browser, 'Editor');
  openFloorList(browser);
  createFloor(browser, floorTitle);
  waitForFloorTitle(browser, floorTitle);
  findFloorIdByTitle(browser, floorTitle, (floorId) => {
    if (!floorId) return;
    openRoomList(browser, floorId);
    createRoom(browser, roomTitle);
    waitForRoomTitle(browser, roomTitle);
    findRoomIdByTitle(browser, roomTitle, (roomId) => {
      if (!roomId) return;
      browser.perform(() => {
        browser.globals.roleStoryIds = { floorId, roomId };
      });
    });
  });
};

const waitForRoomTagPresence = (browser, tagName, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (name) {
      const title = document.getElementById('room_tag_dialog_title');
      const dialog = title ? title.closest('[role="dialog"]') : null;
      if (!dialog) return { found: false, reason: 'dialog-not-found' };
      const names = Array.from(dialog.querySelectorAll('table.tag-table tbody tr .main-content span'));
      return {
        found: names.some((node) => node.textContent && node.textContent.trim() === name),
        reason: 'tag-not-found',
      };
    },
    [tagName],
    (result) => {
      const state = result && result.value ? result.value : { found: false, reason: 'execute-failed' };
      if (state.found) {
        browser.assert.ok(true, `作成したルームタグが一覧に表示されています: ${tagName}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `作成したルームタグが一覧に表示されていません: ${tagName}（${state.reason || 'unknown'}）`);
        return;
      }
      browser.pause(500, () => waitForRoomTagPresence(browser, tagName, attempt + 1));
    }
  );
};

// 既存タグに依存しないよう、このテスト専用のルームタグを一意な名前で作成する。
const createRoomTag = (browser, floorId, roomId, tagName) => {
  openRoomList(browser, floorId);
  browser
    .waitForElementVisible(`.roomtag-button-${roomId}`, 10000)
    .click(`.roomtag-button-${roomId}`)
    .waitForElementVisible('#room_tag_dialog_title', 10000);

  clickDialogButtonWhenEnabled(browser, 'room_tag_dialog_title', '作成', 'ルームタグを作成');
  browser
    .waitForElementVisible('[data-testid="tag-editor-screen"]', 10000)
    .waitForElementVisible('#room_tag_order', 10000)
    .clearValue('#room_tag_order')
    .setValue('#room_tag_order', '1')
    .clearValue('#room_tag_name')
    .setValue('#room_tag_name', tagName);
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '[data-testid="tag-editor-screen"]',
    submitSelector: '#room_tag_dialog_title_submit_desktop, #room_tag_dialog_title_submit_mobile',
    expectedControls: [
      { selector: '#room_tag_order', value: '1' },
      { selector: '#room_tag_name', value: tagName },
    ],
    label: 'ルームタグの入力を送信',
  });
  browser
    .waitForElementNotPresent('[data-testid="tag-editor-screen"]', 10000)
    .waitForElementVisible('#room_tag_dialog_title_create_desktop', 10000);
  waitForRoomTagPresence(browser, tagName);
  clickDialogButtonWhenEnabled(browser, 'room_tag_dialog_title', '閉じる', 'ルームタグの画面を閉じる');
  browser.waitForElementNotVisible('#room_tag_dialog_title', 10000);
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

const submitTimelineTextDialog = (
  browser,
  { anchorSelector, submitSelector, inputSelector, expectedValue, label }
) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector,
    submitSelector,
    expectedControls: [{ selector: inputSelector, value: expectedValue }],
    label,
  });
};

const confirmTimelineDelete = (browser, { anchorSelector, submitSelector, label }) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector,
    submitSelector,
    expectedControls: [],
    label,
  });
};

const submitPost = (browser, text) => {
  openEditPostDialog(browser);
  browser.clearValue('#post_content').setValue('#post_content', text);
  submitTimelineTextDialog(browser, {
    anchorSelector: '#edit_post_dialog_title',
    submitSelector: '[data-testid="dialog-edit-post-submit"]',
    inputSelector: '#post_content',
    expectedValue: text,
    label: '投稿を送信',
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
  browser.clearValue('#reply_content').setValue('#reply_content', text);
  submitTimelineTextDialog(browser, {
    anchorSelector: '#edit_reply_dialog_title',
    submitSelector: '[data-testid="dialog-edit-reply-submit"]',
    inputSelector: '#reply_content',
    expectedValue: text,
    label: '返信を送信',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-reply"]', '返信を送信');
};

const openSupplementDialogFromPost = (browser, postXpath) => {
  browser
    .useXpath()
    .waitForElementVisible(postXpath, 10000)
    .click(`${postXpath}//button[@data-testid='timeline-post-supplement-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-edit-supplement"]', 10000);
};

const openSupplementDialogFromReply = (browser, replyXpath) => {
  browser
    .useXpath()
    .waitForElementVisible(replyXpath, 10000)
    .click(`${replyXpath}//button[@data-testid='timeline-reply-supplement-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-edit-supplement"]', 10000);
};

const submitSupplement = (browser, text) => {
  browser.clearValue('#supplement_content').setValue('#supplement_content', text);
  submitTimelineTextDialog(browser, {
    anchorSelector: '#edit_supplement_dialog_title',
    submitSelector: '[data-testid="dialog-edit-supplement-submit"]',
    inputSelector: '#supplement_content',
    expectedValue: text,
    label: '付加情報を送信',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-supplement"]', '付加情報を送信');
};

const editPostByXpath = (browser, postXpath, nextText) => {
  browser
    .useXpath()
    .waitForElementVisible(postXpath, 10000)
    .click(`${postXpath}//button[@data-testid='timeline-post-edit-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
    .clearValue('#post_content')
    .setValue('#post_content', nextText);
  submitTimelineTextDialog(browser, {
    anchorSelector: '#edit_post_dialog_title',
    submitSelector: '[data-testid="dialog-edit-post-submit"]',
    inputSelector: '#post_content',
    expectedValue: nextText,
    label: '投稿の編集内容を送信',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', '投稿を編集');
};

const deletePostByXpath = (browser, postXpath) => {
  browser
    .useXpath()
    .waitForElementVisible(postXpath, 10000)
    .click(`${postXpath}//button[@data-testid='timeline-post-delete-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-delete-post"]', 10000);
  confirmTimelineDelete(browser, {
    anchorSelector: '#delete_post_dialog_title',
    submitSelector: '[data-testid="dialog-delete-post-confirm"]',
    label: '投稿の削除を確定',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-delete-post"]', '投稿を削除');
  waitForXpathNotPresent(browser, postXpath, '削除した投稿');
};

const editReplyByXpath = (browser, replyXpath, nextText) => {
  browser
    .useXpath()
    .waitForElementVisible(replyXpath, 10000)
    .click(`${replyXpath}//button[@data-testid='timeline-reply-edit-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-edit-reply"]', 10000)
    .clearValue('#reply_content')
    .setValue('#reply_content', nextText);
  submitTimelineTextDialog(browser, {
    anchorSelector: '#edit_reply_dialog_title',
    submitSelector: '[data-testid="dialog-edit-reply-submit"]',
    inputSelector: '#reply_content',
    expectedValue: nextText,
    label: '返信の編集内容を送信',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-reply"]', '返信を編集');
};

const deleteReplyByXpath = (browser, replyXpath) => {
  browser
    .useXpath()
    .waitForElementVisible(replyXpath, 10000)
    .click(`${replyXpath}//button[@data-testid='timeline-reply-delete-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-delete-reply"]', 10000);
  confirmTimelineDelete(browser, {
    anchorSelector: '#delete_reply_dialog_title',
    submitSelector: '[data-testid="dialog-delete-reply-confirm"]',
    label: '返信の削除を確定',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-delete-reply"]', '返信を削除');
  waitForXpathNotPresent(browser, replyXpath, '削除した返信');
};

const editSupplementByXpath = (browser, supplementXpath, nextText) => {
  browser
    .useXpath()
    .waitForElementVisible(supplementXpath, 10000)
    .click(`${supplementXpath}//button[@data-testid='timeline-supplement-edit-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-edit-supplement"]', 10000)
    .clearValue('#supplement_content')
    .setValue('#supplement_content', nextText);
  submitTimelineTextDialog(browser, {
    anchorSelector: '#edit_supplement_dialog_title',
    submitSelector: '[data-testid="dialog-edit-supplement-submit"]',
    inputSelector: '#supplement_content',
    expectedValue: nextText,
    label: '付加情報の編集内容を送信',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-supplement"]', '付加情報を編集');
};

const deleteSupplementByXpath = (browser, supplementXpath) => {
  browser
    .useXpath()
    .waitForElementVisible(supplementXpath, 10000)
    .click(`${supplementXpath}//button[@data-testid='timeline-supplement-delete-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-delete-supplement"]', 10000);
  confirmTimelineDelete(browser, {
    anchorSelector: '#delete_supplement_dialog_title',
    submitSelector: '[data-testid="dialog-delete-supplement-confirm"]',
    label: '付加情報の削除を確定',
  });
  waitForDialogToClose(browser, '[data-testid="dialog-delete-supplement"]', '付加情報を削除');
  waitForXpathNotPresent(browser, supplementXpath, '削除した付加情報');
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

const toggleTagByNameInDialog = (browser, tagName, expectedChecked, label) => {
  browser.execute(
    function (payload) {
      const dialogs = Array.from(document.querySelectorAll('[data-testid="dialog-edit-tag"]')).filter(
        (node) => node.offsetParent || node.getClientRects().length
      );
      if (dialogs.length !== 1) {
        return { toggled: false, reason: `visible-dialog-count:${dialogs.length}` };
      }
      const dialog = dialogs[0];
      dialog.querySelectorAll(`[${payload.marker}]`).forEach((node) => node.removeAttribute(payload.marker));
      const labels = Array.from(dialog.querySelectorAll('.checkbox-label'));
      const matchingLabels = labels.filter(
        (node) =>
          node.textContent &&
          node.textContent.trim() === payload.tagName &&
          (node.offsetParent || node.getClientRects().length)
      );
      if (matchingLabels.length !== 1) {
        return { toggled: false, reason: `visible-label-count:${matchingLabels.length}` };
      }
      const targetLabel = matchingLabels[0];
      const checkboxId = targetLabel.getAttribute('for');
      const checkbox = checkboxId ? dialog.querySelector(`#${CSS.escape(checkboxId)}`) : null;
      if (!checkbox) return { toggled: false, reason: 'checkbox-not-found' };
      if (checkbox.disabled || checkbox.getAttribute('aria-disabled') === 'true') {
        return { toggled: false, reason: 'checkbox-disabled' };
      }
      if (checkbox.checked !== !payload.expectedChecked || !String(checkbox.value || '').trim()) {
        return { toggled: false, reason: 'fixture-control-mismatch' };
      }
      checkbox.click();
      checkbox.setAttribute(payload.marker, 'true');
      return {
        toggled: true,
        checked: checkbox.checked,
        controlId: checkboxId,
        tagId: String(checkbox.value || ''),
      };
    },
    [{ marker: ROLE_STORY_TAG_MARKER, tagName, expectedChecked }],
    (result) => {
      const state = result && result.value ? result.value : { toggled: false, reason: 'execute-failed' };
      browser.assert.ok(
        state.toggled &&
          state.checked === expectedChecked &&
          !!state.controlId &&
          !!state.tagId,
        `作成したルームタグの選択を切り替えました${label ? ` (${label})` : ''}: ${tagName}（${state.reason || 'ok'}）`
      );
    }
  );
};

const submitTagDialog = (browser, expectedChecked, label) => {
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_tag_dialog_title',
    submitSelector: '[data-testid="dialog-edit-tag-submit-desktop"], [data-testid="dialog-edit-tag-submit-mobile"]',
    expectedControls: [
      {
        selector: `[${ROLE_STORY_TAG_MARKER}="true"]`,
        property: 'checked',
        value: expectedChecked,
      },
      {
        selector: `[${ROLE_STORY_TAG_MARKER}="true"]`,
        property: 'nonEmptyValue',
        value: true,
      },
    ],
    label,
  });
  waitForDialogToClose(browser, '[data-testid="dialog-edit-tag"]', 'タグの入力を送信');
};

const addAndRemoveTagByDialog = (browser, openDialog, tagName, label) => {
  openDialog();
  toggleTagByNameInDialog(browser, tagName, true, `${label}の追加`);
  submitTagDialog(browser, true, `${label}の追加を送信`);
  openDialog();
  toggleTagByNameInDialog(browser, tagName, false, `${label}の削除`);
  submitTagDialog(browser, false, `${label}の削除を送信`);
};

const openReactionPickerByXpath = (browser, xpath, label) => {
  browser.execute(
    function (expr) {
      const result = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength !== 1) {
        return { clicked: false, reason: `item-count:${result.snapshotLength}` };
      }
      const item = result.snapshotItem(0);
      const container = item.querySelector('.reaction-container');
      if (!container) return { clicked: false, reason: 'container-not-found' };
      const buttons = Array.from(container.querySelectorAll('button'));
      const reactionButtons = buttons.filter((btn) => {
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
        if (!(btn.offsetParent || btn.getClientRects().length)) return false;
        const icon = btn.querySelector('[aria-hidden="true"]');
        return icon && icon.textContent && icon.textContent.trim() === 'add_reaction';
      });
      if (reactionButtons.length !== 1) {
        return { clicked: false, reason: `button-count:${reactionButtons.length}` };
      }
      reactionButtons[0].click();
      return { clicked: true };
    },
    [xpath],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `リアクションの選択画面を開けませんでした${label ? ` (${label})` : ''}: ${reason}`);
      }
    }
  );
  browser.waitForElementVisible('.reaction-picker', 10000);
};

const clickNamedReaction = (browser, reactionName, label) => {
  browser.execute(
    function (name) {
      const pickers = Array.from(document.querySelectorAll('.reaction-picker')).filter(
        (node) => node.offsetParent || node.getClientRects().length
      );
      if (pickers.length !== 1) return { clicked: false, reason: `picker-count:${pickers.length}` };
      const picker = pickers[0];
      const buttons = Array.from(picker.querySelectorAll('.reaction-buttons button')).filter((button) => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
        if (!(button.offsetParent || button.getClientRects().length)) return false;
        const image = button.querySelector('img.emoji-icon');
        return image && image.getAttribute('alt') === name;
      });
      if (buttons.length !== 1) return { clicked: false, reason: `reaction-count:${buttons.length}` };
      buttons[0].click();
      return { clicked: true };
    },
    [reactionName],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `リアクションをクリックできませんでした${label ? ` (${label})` : ''}: ${reason}`);
      }
    }
  );
};

const waitForReactionCountByXpath = (browser, xpath, expected, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (expr) {
      const result = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength === 0) return { count: 0, present: false };
      const item = result.snapshotItem(0);
      const counts = Array.from(item.querySelectorAll('.reaction-item .reaction-count'));
      const total = counts.reduce((sum, node) => sum + Number(node.textContent || 0), 0);
      return { count: total, present: true };
    },
    [xpath],
    (result) => {
      const state = result && result.value ? result.value : { count: 0, present: false };
      if (!state.present) {
        browser.assert.ok(false, `リアクションの対象が見つかりません${label ? ` (${label})` : ''}。`);
        return;
      }
      if (state.count === expected) {
        browser.assert.ok(true, `リアクション数が${expected}になりました${label ? ` (${label})` : ''}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `リアクション数が期待値になりませんでした${label ? ` (${label})` : ''}: ${state.count}`);
        return;
      }
      browser.pause(500, () => waitForReactionCountByXpath(browser, xpath, expected, label, attempt + 1));
    }
  );
};

const toggleReactionByExistingByXpath = (browser, xpath, reactionName, label) => {
  browser.execute(
    function (payload) {
      const { expr, name } = payload;
      const result = document.evaluate(expr, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength !== 1) {
        return { clicked: false, reason: `item-count:${result.snapshotLength}` };
      }
      const item = result.snapshotItem(0);
      const buttons = Array.from(item.querySelectorAll('.reaction-item .reaction-button button')).filter((button) => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
        if (!(button.offsetParent || button.getClientRects().length)) return false;
        const image = button.querySelector('img.emoji-icon');
        return image && image.getAttribute('alt') === name;
      });
      if (buttons.length !== 1) {
        return { clicked: false, reason: `reaction-button-count:${buttons.length}` };
      }
      buttons[0].click();
      return { clicked: true };
    },
    [{ expr: xpath, name: reactionName }],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `リアクションの切り替えをクリックできませんでした${label ? ` (${label})` : ''}: ${reason}`);
      }
    }
  );
};

const addAndRemoveReaction = (browser, xpath, label) => {
  const reactionName = 'いいね';
  openReactionPickerByXpath(browser, xpath, label);
  clickNamedReaction(browser, reactionName, label);
  confirmGuestRulesIfVisible(browser);
  waitForReactionCountByXpath(browser, xpath, 1, `${label}の追加`);
  toggleReactionByExistingByXpath(browser, xpath, reactionName, label);
  waitForReactionCountByXpath(browser, xpath, 0, `${label}の削除`);
};

module.exports = {
  'フロア編集ユーザ・一般ユーザ・ゲストが投稿・返信・付加情報・リアクションを利用できる': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const userMail = requireEnv('E2E_USER_MAIL');
    const userPassword = requireEnv('E2E_USER_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Role Story ${stamp}`;
    const roomTitle = `E2E Role Room ${stamp}`;
    const tagName = `E2E Tag ${stamp}`;
    ensureStoryFloorRoom(browser, { mail: editorMail, password: editorPassword }, floorTitle, roomTitle);

    browser.perform(() => {
      const ids = browser.globals.roleStoryIds || {};
      if (!ids.floorId || !ids.roomId) {
        browser.assert.ok(false, '権限の異なるユーザ間の操作テストに失敗しました。フロアIDまたはルームIDを取得できませんでした。');
        browser.end();
        return;
      }

      createRoomTag(browser, ids.floorId, ids.roomId, tagName);

      loginToTimeline(browser, {
        mail: editorMail,
        password: editorPassword,
        floorId: ids.floorId,
        roomId: ids.roomId,
        waitForConnected: false,
      });
      waitForTimelineReady(browser);
      closeSoundCautionIfVisible(browser);

      const editorPostText = `E2E FE Post ${stamp}`;
      const editorReplyText = `E2E FE Reply ${stamp}`;
      const editorPostSupplementText = `E2E FE Post Supplement ${stamp}`;
      const editorReplySupplementText = `E2E FE Reply Supplement ${stamp}`;

      submitPost(browser, editorPostText);
      const editorPostXpath = buildPostXpath(editorPostText);
      waitForXpathVisible(browser, editorPostXpath, 'フロア編集ユーザの投稿');
      submitReply(browser, editorPostXpath, editorReplyText);
      const editorReplyXpath = buildReplyXpath(editorReplyText);
      waitForXpathVisible(browser, editorReplyXpath, 'フロア編集ユーザの返信');
      openSupplementDialogFromPost(browser, editorPostXpath);
      submitSupplement(browser, editorPostSupplementText);
      const editorPostSupplementXpath = buildSupplementXpath(editorPostSupplementText);
      waitForXpathVisible(browser, editorPostSupplementXpath, 'フロア編集ユーザの投稿の付加情報');
      openSupplementDialogFromReply(browser, editorReplyXpath);
      submitSupplement(browser, editorReplySupplementText);
      const editorReplySupplementXpath = buildSupplementXpath(editorReplySupplementText);
      waitForXpathVisible(browser, editorReplySupplementXpath, 'フロア編集ユーザの返信の付加情報');

      logoutIfPossible(browser);

      const guestPostText = `E2E Guest Post ${stamp}`;
      const guestReplyText = `E2E Guest Reply ${stamp}`;

      openGuestTimeline(browser, ids.floorId, ids.roomId);
      closeSoundCautionIfVisible(browser);
      addAndRemoveReaction(browser, editorPostXpath, 'フロア編集ユーザの投稿へのゲストのリアクション');
      addAndRemoveReaction(browser, editorReplyXpath, 'フロア編集ユーザの返信へのゲストのリアクション');
      addAndRemoveReaction(browser, editorPostSupplementXpath, 'フロア編集ユーザの投稿の付加情報へのゲストのリアクション');
      addAndRemoveReaction(browser, editorReplySupplementXpath, 'フロア編集ユーザの返信の付加情報へのゲストのリアクション');

      browser.waitForElementVisible('[data-testid="timeline-post-button"]', 10000);
      clickFirstVisible(browser, '[data-testid="timeline-post-button"]', 'ゲストの投稿');
      confirmGuestRulesIfVisible(browser);
      browser.waitForElementVisible('[data-testid="dialog-edit-post"]', 10000);
      browser.clearValue('#post_content').setValue('#post_content', guestPostText);
      submitTimelineTextDialog(browser, {
        anchorSelector: '#edit_post_dialog_title',
        submitSelector: '[data-testid="dialog-edit-post-submit"]',
        inputSelector: '#post_content',
        expectedValue: guestPostText,
        label: 'ゲストの投稿を送信',
      });
      waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', 'ゲストの投稿を送信');

      const guestPostXpath = buildPostXpath(guestPostText);
      waitForXpathVisible(browser, guestPostXpath, 'ゲストの投稿');
      openReplyDialogByXpath(browser, guestPostXpath);
      confirmGuestRulesIfVisible(browser);
      browser.clearValue('#reply_content').setValue('#reply_content', guestReplyText);
      submitTimelineTextDialog(browser, {
        anchorSelector: '#edit_reply_dialog_title',
        submitSelector: '[data-testid="dialog-edit-reply-submit"]',
        inputSelector: '#reply_content',
        expectedValue: guestReplyText,
        label: 'ゲストの返信を送信',
      });
      waitForDialogToClose(browser, '[data-testid="dialog-edit-reply"]', 'ゲストの返信を送信');

      const guestReplyXpath = buildReplyXpath(guestReplyText);
      waitForXpathVisible(browser, guestReplyXpath, 'ゲストの返信');
      browser.perform(() => {
        browser.globals.roleStoryTexts = {
          editorPostText,
          editorReplyText,
          editorPostSupplementText,
          editorReplySupplementText,
          guestPostText,
          guestReplyText,
        };
      });

      logoutIfPossible(browser);

      loginToTimeline(browser, {
        mail: userMail,
        password: userPassword,
        floorId: ids.floorId,
        roomId: ids.roomId,
        waitForConnected: false,
      });
      waitForTimelineReady(browser);
      closeSoundCautionIfVisible(browser);

      browser.perform(() => {
        const texts = browser.globals.roleStoryTexts || {};
        const postXpath = buildPostXpath(texts.editorPostText);
        addAndRemoveTagByDialog(browser, () => openTagDialogForPost(browser, postXpath), tagName, '投稿のタグ');
        const replyXpath = buildReplyXpath(texts.editorReplyText);
        addAndRemoveTagByDialog(browser, () => openTagDialogForReply(browser, replyXpath), tagName, '返信のタグ');

        const userOwnPostText = `E2E User Post ${stamp}`;
        submitPost(browser, userOwnPostText);
        const userOwnPostXpath = buildPostXpath(userOwnPostText);
        waitForXpathVisible(browser, userOwnPostXpath, 'ユーザ自身の投稿');
        const userOwnPostEditedText = `${userOwnPostText} edited`;
        editPostByXpath(browser, userOwnPostXpath, userOwnPostEditedText);
        const userOwnPostEditedXpath = buildPostXpath(userOwnPostEditedText);
        waitForXpathVisible(browser, userOwnPostEditedXpath, 'ユーザ自身が編集した投稿');

        const userOwnReplyText = `E2E User Own Reply ${stamp}`;
        submitReply(browser, userOwnPostEditedXpath, userOwnReplyText);
        const userOwnReplyXpath = buildReplyXpath(userOwnReplyText);
        waitForXpathVisible(browser, userOwnReplyXpath, 'ユーザ自身の返信');
        const userOwnReplyEditedText = `${userOwnReplyText} edited`;
        editReplyByXpath(browser, userOwnReplyXpath, userOwnReplyEditedText);
        const userOwnReplyEditedXpath = buildReplyXpath(userOwnReplyEditedText);
        waitForXpathVisible(browser, userOwnReplyEditedXpath, 'ユーザ自身が編集した返信');

        const userOwnPostSupplementText = `E2E User Own Post Supplement ${stamp}`;
        openSupplementDialogFromPost(browser, userOwnPostEditedXpath);
        submitSupplement(browser, userOwnPostSupplementText);
        const userOwnPostSupplementXpath = buildSupplementXpath(userOwnPostSupplementText);
        waitForXpathVisible(browser, userOwnPostSupplementXpath, 'ユーザ自身の投稿の付加情報');
        addAndRemoveReaction(browser, userOwnPostSupplementXpath, 'ユーザ自身の投稿の付加情報へのリアクション');
        const userOwnPostSupplementEditedText = `${userOwnPostSupplementText} edited`;
        editSupplementByXpath(browser, userOwnPostSupplementXpath, userOwnPostSupplementEditedText);
        const userOwnPostSupplementEditedXpath = buildSupplementXpath(userOwnPostSupplementEditedText);
        waitForXpathVisible(browser, userOwnPostSupplementEditedXpath, 'ユーザ自身が編集した投稿の付加情報');
        deleteSupplementByXpath(browser, userOwnPostSupplementEditedXpath);

        const userOwnReplySupplementText = `E2E User Own Reply Supplement ${stamp}`;
        openSupplementDialogFromReply(browser, userOwnReplyEditedXpath);
        submitSupplement(browser, userOwnReplySupplementText);
        const userOwnReplySupplementXpath = buildSupplementXpath(userOwnReplySupplementText);
        waitForXpathVisible(browser, userOwnReplySupplementXpath, 'ユーザ自身の返信の付加情報');
        addAndRemoveReaction(browser, userOwnReplySupplementXpath, 'ユーザ自身の返信の付加情報へのリアクション');
        const userOwnReplySupplementEditedText = `${userOwnReplySupplementText} edited`;
        editSupplementByXpath(browser, userOwnReplySupplementXpath, userOwnReplySupplementEditedText);
        const userOwnReplySupplementEditedXpath = buildSupplementXpath(userOwnReplySupplementEditedText);
        waitForXpathVisible(browser, userOwnReplySupplementEditedXpath, 'ユーザ自身が編集した返信の付加情報');
        deleteSupplementByXpath(browser, userOwnReplySupplementEditedXpath);

        addAndRemoveReaction(browser, userOwnReplyEditedXpath, 'ユーザ自身の返信へのリアクション');
        addAndRemoveReaction(browser, userOwnPostEditedXpath, 'ユーザ自身の投稿へのリアクション');
        deleteReplyByXpath(browser, userOwnReplyEditedXpath);
        deletePostByXpath(browser, userOwnPostEditedXpath);

        const guestPostXpath = buildPostXpath(texts.guestPostText);
        addAndRemoveReaction(browser, guestPostXpath, 'ゲストの投稿へのリアクション');

        const userReplyText = `E2E User Reply ${stamp}`;
        submitReply(browser, guestPostXpath, userReplyText);
        const userReplyXpath = buildReplyXpath(userReplyText);
        waitForXpathVisible(browser, userReplyXpath, 'ゲストの投稿へのユーザの返信');

        const userPostSupplementText = `E2E User Post Supplement ${stamp}`;
        openSupplementDialogFromPost(browser, guestPostXpath);
        submitSupplement(browser, userPostSupplementText);
        const userPostSupplementXpath = buildSupplementXpath(userPostSupplementText);
        waitForXpathVisible(browser, userPostSupplementXpath, 'ゲストの投稿へのユーザの付加情報');
        const userPostSupplementTextEdited = `${userPostSupplementText} edited`;
        editSupplementByXpath(browser, userPostSupplementXpath, userPostSupplementTextEdited);
        const userPostSupplementEditedXpath = buildSupplementXpath(userPostSupplementTextEdited);
        waitForXpathVisible(browser, userPostSupplementEditedXpath, 'ゲストの投稿へのユーザが編集した付加情報');
        deleteSupplementByXpath(browser, userPostSupplementEditedXpath);
        const userPostSupplementForEditor = `E2E User Post Supplement Keep ${stamp}`;
        openSupplementDialogFromPost(browser, guestPostXpath);
        submitSupplement(browser, userPostSupplementForEditor);
        const userPostSupplementForEditorXpath = buildSupplementXpath(userPostSupplementForEditor);
        waitForXpathVisible(browser, userPostSupplementForEditorXpath, 'フロア編集ユーザの検証用の、ゲストの投稿へのユーザの付加情報');

        const guestReplyXpath = buildReplyXpath(texts.guestReplyText);
        addAndRemoveReaction(browser, guestReplyXpath, 'ゲストの返信へのリアクション');

        const userReplySupplementText = `E2E User Reply Supplement ${stamp}`;
        openSupplementDialogFromReply(browser, guestReplyXpath);
        submitSupplement(browser, userReplySupplementText);
        const userReplySupplementXpath = buildSupplementXpath(userReplySupplementText);
        waitForXpathVisible(browser, userReplySupplementXpath, 'ゲストの返信へのユーザの付加情報');
        const userReplySupplementTextEdited = `${userReplySupplementText} edited`;
        editSupplementByXpath(browser, userReplySupplementXpath, userReplySupplementTextEdited);
        const userReplySupplementEditedXpath = buildSupplementXpath(userReplySupplementTextEdited);
        waitForXpathVisible(browser, userReplySupplementEditedXpath, 'ゲストの返信へのユーザが編集した付加情報');
        deleteSupplementByXpath(browser, userReplySupplementEditedXpath);
        const userReplySupplementForEditor = `E2E User Reply Supplement Keep ${stamp}`;
        openSupplementDialogFromReply(browser, guestReplyXpath);
        submitSupplement(browser, userReplySupplementForEditor);
        const userReplySupplementForEditorXpath = buildSupplementXpath(userReplySupplementForEditor);
        waitForXpathVisible(browser, userReplySupplementForEditorXpath, 'フロア編集ユーザの検証用の、ゲストの返信へのユーザの付加情報');

        browser.perform(() => {
          browser.globals.roleStoryTexts = {
            ...texts,
            userReplyText,
            userPostSupplementForEditor,
            userReplySupplementForEditor,
          };
        });
      });

      logoutIfPossible(browser);

      loginToTimeline(browser, {
        mail: editorMail,
        password: editorPassword,
        floorId: ids.floorId,
        roomId: ids.roomId,
        waitForConnected: false,
      });
      waitForTimelineReady(browser);
      closeSoundCautionIfVisible(browser);

      browser.perform(() => {
        const finalTexts = browser.globals.roleStoryTexts || {};

        const userPostSupplementXpath = buildSupplementXpath(finalTexts.userPostSupplementForEditor);
        editSupplementByXpath(browser, userPostSupplementXpath, `${finalTexts.userPostSupplementForEditor} edited`);
        deleteSupplementByXpath(browser, buildSupplementXpath(`${finalTexts.userPostSupplementForEditor} edited`));

        const userReplySupplementXpath = buildSupplementXpath(finalTexts.userReplySupplementForEditor);
        editSupplementByXpath(browser, userReplySupplementXpath, `${finalTexts.userReplySupplementForEditor} edited`);
        deleteSupplementByXpath(browser, buildSupplementXpath(`${finalTexts.userReplySupplementForEditor} edited`));

        const userReplyXpath = buildReplyXpath(finalTexts.userReplyText);
        editReplyByXpath(browser, userReplyXpath, `${finalTexts.userReplyText} edited`);
        deleteReplyByXpath(browser, buildReplyXpath(`${finalTexts.userReplyText} edited`));

        const guestReplyXpath = buildReplyXpath(finalTexts.guestReplyText);
        editReplyByXpath(browser, guestReplyXpath, `${finalTexts.guestReplyText} edited`);
        deleteReplyByXpath(browser, buildReplyXpath(`${finalTexts.guestReplyText} edited`));

        const guestPostXpath = buildPostXpath(finalTexts.guestPostText);
        editPostByXpath(browser, guestPostXpath, `${finalTexts.guestPostText} edited`);
        deletePostByXpath(browser, buildPostXpath(`${finalTexts.guestPostText} edited`));
      });

      browser.end();
    });
  },
};
