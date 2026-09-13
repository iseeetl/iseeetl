const { findOptionalElement, getBaseUrl, navigateToApp } = require('./login');
const { openLogin, loginByForm, waitForUserRole } = require('./session-helpers');
const { logoutIfPossible } = require('./guest-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('./dialog-focus');

const FLOOR_TARGET_LANGUAGE_IDS = [
  'ja',
  'en',
  'zh',
  'pt',
  'ko',
  'vi',
  'fr',
  'es',
  'sv',
  'hi',
  'it',
  'ru',
  'uk',
  'de',
  'tr',
  'he',
];

const imageStateControls = (imageState) => {
  if (imageState === 'preview') {
    return [{ selector: '.image-preview-wrapper img', property: 'textContent', value: '' }];
  }
  if (imageState === 'uploaded') {
    return [{ selector: '.image-uploaded-wrapper img', property: 'textContent', value: '' }];
  }
  if (imageState === 'none') {
    return [{ selector: '.media-button', property: 'textContent', value: 'photo' }];
  }
  return [];
};

const buildFloorExpectedControls = (options) => {
  const expectedControls = [
    { selector: '#edit_floor_title', property: 'value', value: options.title },
    { selector: '#edit_floor_description', property: 'value', value: options.description },
    { selector: '#floor_display_hidden', property: 'checked', value: !!options.displayHidden },
  ];
  if (Array.isArray(options.targetLangs)) {
    const targetLangs = new Set(options.targetLangs);
    expectedControls.splice(
      2,
      0,
      ...FLOOR_TARGET_LANGUAGE_IDS.map((language) => ({
        selector: `#${language}`,
        property: 'checked',
        value: targetLangs.has(language),
      }))
    );
  }
  if (Object.prototype.hasOwnProperty.call(options, 'filesLength')) {
    expectedControls.push({
      selector: 'input[type="file"]',
      property: 'filesLength',
      value: options.filesLength,
      requireVisible: false,
    });
  }
  expectedControls.push(...imageStateControls(options.imageState));

  return expectedControls;
};

const clickExactFloorDialogSubmit = (browser, options) => {
  const expectedControls = buildFloorExpectedControls(options);

  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_floor_title',
    submitSelector: '[data-testid="base-edit-dialog-confirm"]',
    expectedControls,
    label: options.label || 'フロアのダイアログの入力を送信',
  });
};

const clickExactRoomDialogSubmit = (browser, options) => {
  const expectedControls = [
    { selector: '#room_title', property: 'value', value: options.title },
    { selector: '#room_description', property: 'value', value: options.description },
    { selector: '#guest_reaction_only', property: 'checked', value: !!options.guestReactionOnly },
    { selector: '#member_only', property: 'checked', value: !!options.memberOnly },
    { selector: '#notification', property: 'checked', value: options.notification !== false },
    { selector: '#external_sns_button', property: 'checked', value: !!options.externalSnsButton },
    { selector: '#hidden_flg', property: 'checked', value: !!options.displayHidden },
  ];
  if (Object.prototype.hasOwnProperty.call(options, 'filesLength')) {
    expectedControls.push({
      selector: 'input[type="file"]',
      property: 'filesLength',
      value: options.filesLength,
      requireVisible: false,
    });
  }
  expectedControls.push(...imageStateControls(options.imageState || 'none'));

  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#room_title',
    submitSelector: '[data-testid="base-edit-dialog-confirm"]',
    expectedControls,
    label: options.label || 'ルームのダイアログの入力を送信',
  });
};

const openFloorList = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, base).waitForElementVisible('#search_floor_input', 10000);
};

const openRoomList = (browser, floorId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/floor/${encodeURIComponent(floorId)}`)
    .waitForElementVisible('.view', 10000)
    .waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
};

const clickButtonByText = (browser, text, label) => {
  browser.execute(
    function (targetText) {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((btn) => btn.textContent && btn.textContent.trim() === targetText);
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

const createFloor = (browser, title) => {
  findOptionalElement(browser, '[data-testid="floor-list-create-button"]', (result) => {
    if (result.status === 0) {
      clickFirstVisible(browser, '[data-testid="floor-list-create-button"]', '作成ダイアログを開く');
    } else {
      clickButtonByText(browser, 'フロア作成', '作成ダイアログを開く');
    }
  });
  browser.waitForElementVisible('#edit_floor_title', 10000);
  browser.clearValue('#edit_floor_title').setValue('#edit_floor_title', title);
  browser.clearValue('#edit_floor_description').setValue('#edit_floor_description', 'E2E role floor.');
  clickExactFloorDialogSubmit(browser, {
    title,
    description: 'E2E role floor.',
    label: 'フロアの作成を確定',
  });
  waitForDialogClosed(browser, '#edit_floor_title', 'フロアを作成');
};

const createRoom = (browser, title) => {
  findOptionalElement(browser, '[data-testid="room-list-create-button"]', (result) => {
    if (result.status === 0) {
      clickFirstVisible(browser, '[data-testid="room-list-create-button"]', '作成ダイアログを開く');
    } else {
      clickButtonByText(browser, 'ルーム作成', '作成ダイアログを開く');
    }
  });
  browser.waitForElementVisible('#room_title', 10000);
  browser.clearValue('#room_title').setValue('#room_title', title);
  browser.clearValue('#room_description').setValue('#room_description', 'E2E role room.');
  clickExactRoomDialogSubmit(browser, {
    title,
    description: 'E2E role room.',
    label: 'ルームの作成を確定',
  });
  waitForDialogClosed(browser, '#room_title', 'ルームを作成');
};

const ensureFloorAndRoom = (browser, options) => {
  const floorId = (options && options.floorId) || '';
  const roomId = (options && options.roomId) || '';
  const editorMail = (options && options.editorMail) || '';
  const editorPassword = (options && options.editorPassword) || '';

  if (floorId && roomId) {
    browser.globals.roleTestIds = { floorId, roomId, created: false };
    return;
  }

  const stamp = String(Date.now()).slice(-6);
  const floorTitle = `E2E Role Floor ${stamp}`;
  const roomTitle = `E2E Role Room ${stamp}`;
  let createdFloorId = '';
  let createdRoomId = '';

  loginByForm(browser, { mail: editorMail, password: editorPassword });
  waitForUserRole(browser, 'Editor');
  openFloorList(browser);
  createFloor(browser, floorTitle);
  waitForFloorTitle(browser, floorTitle, true);
  findFloorIdByTitle(browser, floorTitle, (resolvedFloorId) => {
    createdFloorId = resolvedFloorId;
    if (!createdFloorId) return;
    openRoomList(browser, createdFloorId);
    createRoom(browser, roomTitle);
    waitForRoomTitle(browser, roomTitle, true);
    findRoomIdByTitle(browser, roomTitle, (resolvedRoomId) => {
      createdRoomId = resolvedRoomId;
      browser.perform(() => {
        browser.globals.roleTestIds = {
          floorId: createdFloorId,
          roomId: createdRoomId,
          created: true,
        };
      });
      logoutIfPossible(browser);
    });
  });
};

module.exports = {
  ensureFloorAndRoom,
  openFloorList,
  openRoomList,
  openLogin,
  loginByForm,
  waitForTimelineReady,
  clickExactFloorDialogSubmit,
  clickExactRoomDialogSubmit,
  buildFloorExpectedControls,
};
