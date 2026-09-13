const fs = require('fs');
const path = require('path');
const { exerciseImageReplacementCancel, assertOriginalImage } = require('../../helpers/image-replacement');
const { requireEnv } = require('../../helpers/login');
const {
  loginByForm,
  openFloorList,
  openRoomList,
  clickExactFloorDialogSubmit,
  clickExactRoomDialogSubmit,
} = require('../../helpers/role-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');
const {
  assertBackendMediaAvailable,
  assertBackendMediaUnavailable,
  assertMediaUrlsStatus,
  makeFileInputInteractable,
} = require('../../helpers/timeline-media-lifecycle');

const ROOM_IMAGE_PATH = path.resolve(__dirname, '../../../fixtures/images/sample-image.png');
const ROOM_IMAGE_INPUT_XPATH =
  '//*[@id="room_title"]/ancestor::*[@role="dialog"][1]//input[@type="file" and contains(@accept,"image/jpeg")]';
const ROOM_IMAGE_PREVIEW_XPATH =
  '//*[@id="room_title"]/ancestor::*[@role="dialog"][1]' +
  '//div[contains(concat(" ", normalize-space(@class), " "), " image-preview-wrapper ")]//img';

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
const waitForRoomImageState = (browser, expectedPresent, onDone = () => {}, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const title = document.querySelector('#room_title');
      const dialog = title ? title.closest('[role="dialog"]') : null;
      const preview = dialog ? dialog.querySelector('.image-preview-wrapper img') : null;
      const uploaded = dialog ? dialog.querySelector('.image-uploaded-wrapper img') : null;
      return {
        dialogFound: !!dialog,
        previewPresent: !!preview,
        uploadedPresent: !!uploaded,
        uploadedUrl: uploaded ? uploaded.src || '' : '',
        uploadedLoaded: !!(uploaded && uploaded.complete && uploaded.naturalWidth > 0),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { dialogFound: false };
      const matched = expectedPresent
        ? state.dialogFound && state.uploadedPresent && state.uploadedLoaded && !!state.uploadedUrl
        : state.dialogFound && !state.uploadedPresent && !state.previewPresent;
      if (matched) {
        browser.assert.ok(true, `ルーム画像の状態が${expectedPresent ? '保存済み' : '削除済み'}です。`);
        onDone(state.uploadedUrl || '');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ルーム画像の状態が一致しません: ${JSON.stringify(state)}`);
        onDone('');
        return;
      }
      browser.pause(500, () => waitForRoomImageState(browser, expectedPresent, onDone, attempt + 1));
    }
  );
};

const removeUploadedRoomImage = (browser) => {
  browser.execute(
    function () {
      const title = document.querySelector('#room_title');
      const dialog = title ? title.closest('[role="dialog"]') : null;
      const button = dialog ? dialog.querySelector('.image-uploaded-wrapper .image-remove-button') : null;
      if (!button) return { clicked: false };
      button.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = !!(result && result.value && result.value.clicked);
      browser.assert.ok(clicked, 'アップロード済みのルーム画像の削除ボタンをクリックしました。');
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

module.exports = {
  'ルーム一覧で作成・編集・削除ができる': (browser) => {
    const mail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const password = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    if (!fs.existsSync(ROOM_IMAGE_PATH)) {
      browser.assert.ok(false, `ルーム画像のテストデータがありません: ${ROOM_IMAGE_PATH}`);
      browser.end();
      return;
    }
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Room Floor ${stamp}`;
    let floorId = '';

    loginByForm(browser, { mail, password });
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    closeSoundCautionIfVisible(browser);
    openFloorList(browser);

    browser.waitForElementVisible('[data-testid="floor-list-create-button"]', 10000);
    clickFirstVisible(browser, '[data-testid="floor-list-create-button"]', 'フロアの作成画面を開く');
    browser.waitForElementVisible('#edit_floor_title', 10000);
    browser.clearValue('#edit_floor_title').setValue('#edit_floor_title', floorTitle);
    const floorDescription = 'E2E room floor description.';
    browser.clearValue('#edit_floor_description').setValue('#edit_floor_description', floorDescription);
    clickExactFloorDialogSubmit(browser, {
      title: floorTitle,
      description: floorDescription,
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
      clickFirstVisible(browser, '[data-testid="room-list-create-button"]', '作成ダイアログを開く');
      browser.waitForElementVisible('#room_title', 10000);

      const roomTitle = `E2E Room ${stamp}`;
      const editedTitle = `E2E Room ${stamp} Edit`;
      browser.clearValue('#room_title').setValue('#room_title', roomTitle);
      const roomDescription = 'E2E room description.';
      browser.clearValue('#room_description').setValue('#room_description', roomDescription);
      makeFileInputInteractable(browser, ROOM_IMAGE_INPUT_XPATH, 'xpath');
      browser
        .useXpath()
        .setValue(ROOM_IMAGE_INPUT_XPATH, ROOM_IMAGE_PATH)
        .waitForElementVisible(ROOM_IMAGE_PREVIEW_XPATH, 20000)
        .useCss();
      clickExactRoomDialogSubmit(browser, {
        title: roomTitle,
        description: roomDescription,
        filesLength: 1,
        imageState: 'preview',
        label: 'ルームの作成を確定',
      });
      waitForDialogClosed(browser, '#room_title', '作成');
      waitForRoomTitle(browser, roomTitle, true);
      openRoomList(browser, floorId);
      waitForRoomTitle(browser, roomTitle, true);

      clickRoomAction(browser, roomTitle, '編集');
      browser.waitForElementVisible('#room_title', 10000);
      let roomImageUrl = '';
      waitForRoomImageState(browser, true, (resolvedUrl) => {
        roomImageUrl = resolvedUrl;
      });
      browser.perform(() => {
        assertMediaUrlsStatus(browser, [roomImageUrl], 200, '保存済みのルーム画像');
        assertBackendMediaAvailable(browser, [roomImageUrl], 'バックエンドに保存済みのルーム画像');
      });
      const originalImage = exerciseImageReplacementCancel(browser, ROOM_IMAGE_PATH);
      clickExactRoomDialogSubmit(browser, {
        title: roomTitle,
        description: roomDescription,
        filesLength: 0,
        imageState: 'uploaded',
        label: '画像の差し替えをキャンセルした後にルームを保存',
      });
      waitForDialogClosed(browser, '#room_title', '差し替えキャンセル後の保存');
      browser.refresh().waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
      waitForRoomTitle(browser, roomTitle, true);
      clickRoomAction(browser, roomTitle, '編集');
      assertOriginalImage(browser, originalImage);
      removeUploadedRoomImage(browser);
      browser.clearValue('#room_title').setValue('#room_title', editedTitle);
      clickExactRoomDialogSubmit(browser, {
        title: editedTitle,
        description: roomDescription,
        imageState: 'none',
        label: 'ルームの編集を確定',
      });
      waitForDialogClosed(browser, '#room_title', '編集');
      waitForRoomTitle(browser, editedTitle, true);
      openRoomList(browser, floorId);
      waitForRoomTitle(browser, editedTitle, true);
      clickRoomAction(browser, editedTitle, '編集');
      browser.waitForElementVisible('#room_title', 10000);
      waitForRoomImageState(browser, false);
      clickFirstVisible(browser, '[data-testid="base-edit-dialog-cancel"]', 'ルーム画像の確認画面を閉じる');
      waitForDialogClosed(browser, '#room_title', '画像の削除を確認');
      browser.perform(() => {
        assertBackendMediaUnavailable(browser, [roomImageUrl], 'バックエンドで削除済みのルーム画像');
      });

      clickRoomAction(browser, editedTitle, '削除');
      browser.waitForElementVisible('#delete_room_dialog_description', 10000);
      clickFirstVisible(
        browser,
        '[data-testid="delete-floor-dialog-confirm"], [data-testid="delete-room-dialog-confirm"]',
        'ルームの削除を確定'
      );
      waitForDialogClosed(browser, '#delete_room_dialog_description', '削除');
      waitForRoomTitle(browser, editedTitle, false);

      openFloorList(browser);
      clickFloorAction(browser, floorTitle, '削除');
      browser.waitForElementVisible('#delete_floor_dialog_description', 10000);
      clickFirstVisible(
        browser,
        '[data-testid="delete-floor-dialog-confirm"], [data-testid="delete-room-dialog-confirm"]',
        'フロアの削除を確定'
      );
      waitForDialogClosed(browser, '#delete_floor_dialog_description', '削除');
      waitForFloorTitle(browser, floorTitle, false);

      browser.end();
    });
  },
};
