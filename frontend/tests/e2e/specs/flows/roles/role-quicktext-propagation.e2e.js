const { openResourceQuickTextDialog, closeResourceQuickTextDialog } = require('../../helpers/resource-quicktext-dialog');
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm, openFloorList, openRoomList } = require('../../helpers/role-helpers');
const { logoutIfPossible } = require('../../helpers/guest-helpers');
const { clickSingleVisible } = require('../../helpers/dialog-focus');

const buildPostXpath = (text) =>
  `//article[./div[contains(concat(" ", normalize-space(@class), " "), " post ")]]` +
  `[.//div[contains(@class,"text") and contains(., "${text}")]]`;
const buildReplyXpath = (text) =>
  `//article[contains(concat(" ", normalize-space(@class), " "), " wrapper ")]` +
  `[.//div[contains(@class,"text") and contains(., "${text}")]]`;
const buildSupplementXpath = (text) =>
  "//article[contains(@class,'supplement')][.//div[contains(@class,'supplement-content') and contains(., '" +
  text +
  "')]]";

const clickFirstVisible = clickSingleVisible;

const waitForDialogToClose = (browser, dialogSelector, label) => {
  browser.useCss().waitForElementNotVisible(dialogSelector, 15000, false, (result) => {
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

const waitForXpathVisible = (browser, xpath, label) => {
  browser.useXpath().waitForElementVisible(xpath, 10000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `要素が表示されていません${label ? ` (${label})` : ''}: ${xpath}`);
    }
  });
  browser.useCss();
};

const waitForInputContains = (browser, selector, text, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.getValue(selector, (result) => {
    const value = result && typeof result.value === 'string' ? result.value : '';
    if (value.includes(text)) {
      browser.assert.ok(true, `入力欄に単語が含まれています${label ? ` (${label})` : ''}。`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `入力欄に単語が含まれていません${label ? ` (${label})` : ''}。`);
      return;
    }
    browser.pause(300, () => waitForInputContains(browser, selector, text, label, attempt + 1));
  });
};

const openQuickTextManagement = (browser) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/management/quicktext`;
  navigateToApp(browser, url).waitForElementVisible('[data-testid="quicktext-group-create"]', 10000);
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
      const groups = items.filter((item) => {
        const titleNode = item.querySelector('.group-top .field-value');
        return titleNode && titleNode.textContent.trim() === title;
      });
      const entries = groups.length === 1
        ? Array.from(groups[0].querySelectorAll('.item-title')).filter((node) => node.textContent.trim() === label)
        : [];
      return { groupCount: groups.length, itemCount: entries.length };
    },
    [groupTitle, itemLabel],
    (result) => {
      const state = result && result.value ? result.value : { groupCount: -1, itemCount: -1 };
      if (state.groupCount > 1 || state.itemCount > 1) {
        browser.assert.ok(false, '単語グループと項目がそれぞれ1件だけ一致する必要があります。');
        return;
      }
      if (state.groupCount === 1 && state.itemCount === (shouldExist ? 1 : 0)) {
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

const createQuickTextGroupAndItem = (browser, groupTitle, itemLabel) => {
  browser
    .waitForElementVisible('[data-testid="quicktext-group-create"]', 10000)
    .click('[data-testid="quicktext-group-create"]')
    .waitForElementVisible('#qt_group_title', 10000)
    .setValue('#qt_group_title', groupTitle);
  clickFirstVisible(browser, '[data-testid="quicktext-dialog-submit"]', 'グループの入力を送信');
  waitForDialogToClose(browser, '#qt_group_title', 'グループ');
  waitForGroupPresence(browser, groupTitle, true);

  browser.execute(
    function (title) {
      const items = Array.from(document.querySelectorAll('.group-item'));
      const group = items.find((item) => {
        const titleNode = item.querySelector('.group-top .field-value');
        return titleNode && titleNode.textContent.trim() === title;
      });
      if (!group) return { clicked: false, reason: 'group-not-found' };
      const button = group.querySelector('.group-top-actions .items-create-btn');
      if (!button) return { clicked: false, reason: 'button-not-found' };
      button.click();
      return { clicked: true };
    },
    [groupTitle],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `項目の作成をクリックできませんでした: ${reason}`);
      }
    }
  );

  browser.waitForElementVisible('#qt_item_label', 10000).setValue('#qt_item_label', itemLabel);
  clickFirstVisible(browser, '[data-testid="quicktext-dialog-submit"]', '項目の入力を送信');
  waitForDialogToClose(browser, '#qt_item_label', '項目');
  waitForItemPresence(browser, groupTitle, itemLabel, true);
};

const waitForQuickTextItemInDialog = (browser, dialogSelector, groupTitle, itemLabel, label, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (selector, group, item) {
      const dialog = document.querySelector(selector);
      if (!dialog) return { ok: false, reason: 'dialog-not-found' };
      const accordion = dialog.querySelector('.quicktext-accordion');
      if (!accordion) return { ok: false, reason: 'accordion-not-found' };
      const fieldsets = Array.from(accordion.querySelectorAll('.acc-fieldset'));
      const target = fieldsets.find((fs) => {
        const titleNode = fs.querySelector('.acc-legend-title');
        return titleNode && titleNode.textContent.trim() === group;
      });
      if (!target) return { ok: false, reason: 'group-not-found' };
      const panel = target.querySelector('.acc-panel');
      const toggle = target.querySelector('.acc-legend-toggle');
      if (panel && panel.offsetParent === null && toggle) {
        toggle.click();
        return { ok: false, reason: 'panel-closed' };
      }
      const buttons = Array.from(target.querySelectorAll('.template-button'));
      const button = buttons.find((node) => node.textContent && node.textContent.trim() === item);
      if (!button) return { ok: false, reason: 'item-not-found' };
      button.click();
      return { ok: true };
    },
    [dialogSelector, groupTitle, itemLabel],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'unknown' };
      if (state.ok) {
        browser.assert.ok(true, `単語の項目をクリックしました${label ? ` (${label})` : ''}。`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `単語の項目を操作できませんでした${label ? ` (${label})` : ''}: ${state.reason}`);
        return;
      }
      browser.pause(500, () =>
        waitForQuickTextItemInDialog(browser, dialogSelector, groupTitle, itemLabel, label, attempt + 1)
      );
    }
  );
};

const openTimeline = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  const url = `${base}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
  navigateToApp(browser, url).waitForElementVisible('.timeline-page', 20000);
  waitForTimelineReady(browser);
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

const openReplyDialogByXpath = (browser, postXpath) => {
  browser
    .useXpath()
    .waitForElementVisible(postXpath, 10000)
    .click(`${postXpath}//button[@data-testid='timeline-post-reply-button']`)
    .useCss()
    .waitForElementVisible('[data-testid="dialog-edit-reply"]', 10000);
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

const submitPost = (browser) => {
  clickFirstVisible(browser, '.desktop-item[data-testid="dialog-edit-post-submit"]', '投稿を送信');
  waitForDialogToClose(browser, '[data-testid="dialog-edit-post"]', '投稿を送信');
};

const submitReply = (browser) => {
  clickFirstVisible(browser, '.desktop-item[data-testid="dialog-edit-reply-submit"]', '返信を送信');
  waitForDialogToClose(browser, '[data-testid="dialog-edit-reply"]', '返信を送信');
};

const submitSupplement = (browser) => {
  clickFirstVisible(browser, '.desktop-item[data-testid="dialog-edit-supplement-submit"]', '付加情報を送信');
  waitForDialogToClose(browser, '[data-testid="dialog-edit-supplement"]', '付加情報を送信');
};

module.exports = {
  '共通単語をフロア・ルームへコピーし、投稿・返信・付加情報で利用できる': (browser) => {
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');

    const stamp = String(Date.now()).slice(-6);
    const groupTitle = `E2E QT Group ${stamp}`;
    const itemLabel = `E2E QT Item ${stamp}`;

    const floorTitle = `E2E QT Floor ${stamp}`;
    const roomTitle = `E2E QT Room ${stamp}`;

    const postSuffix = `POST ${stamp}`;
    const replySuffix = `REPLY ${stamp}`;
    const supplementPostSuffix = `SUPP-POST ${stamp}`;
    const supplementReplySuffix = `SUPP-REPLY ${stamp}`;
    loginByForm(browser, { mail: adminMail, password: adminPassword });
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    openQuickTextManagement(browser);
    createQuickTextGroupAndItem(browser, groupTitle, itemLabel);

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
      .setValue('#edit_floor_description', 'E2E quicktext propagation floor');
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
        .setValue('#room_description', 'E2E quicktext propagation room');
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
      if (!floorId) {
        browser.assert.ok(false, '単語の検証に必要なフロアIDが空です。');
        return;
      }
      openResourceQuickTextDialog(browser, { resource: 'floor', floorId, roomId });
      waitForGroupPresence(browser, groupTitle, true);
      waitForItemPresence(browser, groupTitle, itemLabel, true);
      closeResourceQuickTextDialog(browser, { resource: 'floor', floorId, roomId });
    });

    browser.perform(() => {
      if (!roomId) {
        browser.assert.ok(false, '単語の検証に必要なルームIDが空です。');
        return;
      }
      openResourceQuickTextDialog(browser, { resource: 'room', floorId, roomId });
      waitForGroupPresence(browser, groupTitle, true);
      waitForItemPresence(browser, groupTitle, itemLabel, true);
      closeResourceQuickTextDialog(browser, { resource: 'room', floorId, roomId });
    });

    browser.perform(() => {
      if (!floorId || !roomId) {
        browser.assert.ok(false, 'タイムラインに必要なフロアIDまたはルームIDがありません。');
        return;
      }
      openTimeline(browser, floorId, roomId);

      openEditPostDialog(browser);
      waitForQuickTextItemInDialog(browser, '[data-testid="dialog-edit-post"]', groupTitle, itemLabel, '投稿');
      waitForInputContains(browser, '#post_content', itemLabel, '投稿');
      browser.sendKeys('#post_content', ` ${postSuffix}`);
      submitPost(browser);
      const postText = `${itemLabel} ${postSuffix}`;
      const postXpath = buildPostXpath(postText);
      waitForXpathVisible(browser, postXpath, '投稿');

      openReplyDialogByXpath(browser, postXpath);
      waitForQuickTextItemInDialog(browser, '[data-testid="dialog-edit-reply"]', groupTitle, itemLabel, '返信');
      waitForInputContains(browser, '#reply_content', itemLabel, '返信');
      browser.sendKeys('#reply_content', ` ${replySuffix}`);
      submitReply(browser);
      const replyText = `${itemLabel} ${replySuffix}`;
      const replyXpath = buildReplyXpath(replyText);
      waitForXpathVisible(browser, replyXpath, '返信');

      openSupplementDialogFromPost(browser, postXpath);
      waitForQuickTextItemInDialog(
        browser,
        '[data-testid="dialog-edit-supplement"]',
        groupTitle,
        itemLabel,
        '付加情報'
      );
      waitForInputContains(browser, '#supplement_content', itemLabel, '付加情報');
      browser.sendKeys('#supplement_content', ` ${supplementPostSuffix}`);
      submitSupplement(browser);
      const supplementPostText = `${itemLabel} ${supplementPostSuffix}`;
      waitForXpathVisible(browser, buildSupplementXpath(supplementPostText), '投稿の付加情報');

      openSupplementDialogFromReply(browser, replyXpath);
      waitForQuickTextItemInDialog(
        browser,
        '[data-testid="dialog-edit-supplement"]',
        groupTitle,
        itemLabel,
        '返信の付加情報'
      );
      waitForInputContains(browser, '#supplement_content', itemLabel, '返信の付加情報');
      browser.sendKeys('#supplement_content', ` ${supplementReplySuffix}`);
      submitSupplement(browser);
      const supplementReplyText = `${itemLabel} ${supplementReplySuffix}`;
      waitForXpathVisible(browser, buildSupplementXpath(supplementReplyText), '返信の付加情報');
    });

    browser.end();
  },
};
