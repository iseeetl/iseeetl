const path = require('path');
const { exerciseImageReplacementCancel, assertOriginalImage } = require('../../helpers/image-replacement');
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { loginByForm, clickExactFloorDialogSubmit } = require('../../helpers/role-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');
const { makeFileInputInteractable } = require('../../helpers/timeline-media-lifecycle');

const openFloorList = (browser) => {
  const base = getBaseUrl(browser);
  navigateToApp(browser, base).waitForElementVisible('#search_floor_input', 10000);
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

const waitForFloorDescription = (browser, title, description, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (payload) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      const targetTitle = titles.find((node) => node.textContent && node.textContent.trim() === payload.title);
      if (!targetTitle) return { ok: false, reason: 'title-not-found' };
      const card = targetTitle.closest('article.floor-card');
      if (!card) return { ok: false, reason: 'card-not-found' };
      const desc = card.querySelector('.floor-description');
      const text = desc ? desc.textContent.trim() : '';
      return { ok: text === payload.description, text };
    },
    [{ title, description }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, text: '' };
      if (state.ok) {
        browser.assert.ok(true, `フロアの説明が一致しました: ${description}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `フロアの説明が一致しません: ${state.text || 'empty'}`);
        return;
      }
      browser.pause(500, () => waitForFloorDescription(browser, title, description, attempt + 1));
    }
  );
};

const waitForFloorHiddenBadge = (browser, title, shouldExist, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (payload) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      const targetTitle = titles.find((node) => node.textContent && node.textContent.trim() === payload.title);
      if (!targetTitle) return { ok: false, reason: 'title-not-found' };
      const card = targetTitle.closest('article.floor-card');
      if (!card) return { ok: false, reason: 'card-not-found' };
      const badge = card.querySelector('.floor-card__visibility');
      const visible = !!(badge && (badge.offsetParent || badge.getClientRects().length));
      return { ok: true, visible };
    },
    [{ title }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, visible: false };
      if (!state.ok) {
        browser.assert.ok(false, `非表示バッジを取得できませんでした: ${state.reason || 'unknown'}`);
        return;
      }
      if (state.visible === shouldExist) {
        browser.assert.ok(true, `非表示バッジの確認結果=${shouldExist ? '表示' : '非表示'}: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `非表示バッジの状態が一致しません: ${title}`);
        return;
      }
      browser.pause(500, () => waitForFloorHiddenBadge(browser, title, shouldExist, attempt + 1));
    }
  );
};

const waitForFloorImageNotDefault = (browser, title, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (payload) {
      const titles = Array.from(document.querySelectorAll('h2.floor-title'));
      const targetTitle = titles.find((node) => node.textContent && node.textContent.trim() === payload.title);
      if (!targetTitle) return { ok: false, reason: 'title-not-found' };
      const card = targetTitle.closest('article.floor-card');
      if (!card) return { ok: false, reason: 'card-not-found' };
      const img = card.querySelector('figure.floor-card__media img, img');
      const src = img ? img.getAttribute('src') || '' : '';
      return { ok: !!src && !src.includes('floor_default.jpg'), src };
    },
    [{ title }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, src: '' };
      if (state.ok) {
        browser.assert.ok(true, `フロア画像をアップロードしました: ${title}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `フロア画像が更新されませんでした: ${state.src || 'empty'}`);
        return;
      }
      browser.pause(500, () => waitForFloorImageNotDefault(browser, title, attempt + 1));
    }
  );
};

const setFloorImage = (browser, filePath) => {
  makeFileInputInteractable(browser, 'input[type="file"]');
  browser.setValue('input[type="file"]', filePath);
  browser.waitForElementVisible('.image-preview-wrapper, .image-uploaded-wrapper', 10000);
};

const confirmUpdateFloorDisplay = (browser, label) => {
  browser.waitForElementVisible('#update_floor_display_confirm_title', 10000);
  clickSingleVisible(browser, '[data-testid="update-floor-display-confirm"]', 'フロアの表示設定の更新を確定');
  waitForDialogClosed(browser, '#update_floor_display_confirm_title', label);
};

const updateSearch = (browser, value) => {
  browser.execute(
    function (keyword) {
      const input = document.getElementById('search_floor_input');
      const button = document.querySelector('.search-floor-button');
      if (!input || !button) return { ok: false, reason: 'input-or-button-not-found' };
      input.value = keyword;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      button.click();
      return { ok: true };
    },
    [value],
    (result) => {
      const ok = result && result.value ? result.value.ok : false;
      if (!ok) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `検索条件を更新できませんでした: ${reason}`);
      }
    }
  );
};

module.exports = {
  'フロア一覧で作成・編集・削除・検索ができる': (browser) => {
    const mail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const password = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const imagePath = path.resolve(__dirname, '../../../fixtures/images/sample-image.png');

    loginByForm(browser, { mail, password });
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    closeSoundCautionIfVisible(browser);
    openFloorList(browser);

    browser.waitForElementVisible('[data-testid="floor-list-create-button"]', 10000);
    clickSingleVisible(browser, '[data-testid="floor-list-create-button"]', '作成ダイアログを開く');
    browser.waitForElementVisible('#edit_floor_title', 10000);
    const floorTitle = `E2E Floor ${stamp}`;
    const editedTitle = `E2E Floor ${stamp} Edit`;
    const floorDescription = 'E2E floor description full fields.';
    browser.clearValue('#edit_floor_title').setValue('#edit_floor_title', floorTitle);
    browser.clearValue('#edit_floor_description').setValue('#edit_floor_description', floorDescription);
    setFloorImage(browser, imagePath);
    browser.click('label[for="floor_display_hidden"]');
    clickExactFloorDialogSubmit(browser, {
      title: floorTitle,
      description: floorDescription,
      displayHidden: true,
      filesLength: 1,
      imageState: 'preview',
      label: 'フロアの作成を確定',
    });
    waitForDialogClosed(browser, '#edit_floor_title', '作成');
    waitForFloorTitle(browser, floorTitle, true);
    waitForFloorDescription(browser, floorTitle, floorDescription);
    waitForFloorHiddenBadge(browser, floorTitle, true);
    waitForFloorImageNotDefault(browser, floorTitle);

    clickButtonByText(browser, '全フロア表示', 'すべてのフロアを表示');
    confirmUpdateFloorDisplay(browser, 'すべてのフロアを表示');
    waitForFloorHiddenBadge(browser, floorTitle, false);

    clickButtonByText(browser, '全フロア非表示', 'すべてのフロアを非表示');
    confirmUpdateFloorDisplay(browser, 'すべてのフロアを非表示');
    waitForFloorHiddenBadge(browser, floorTitle, true);

    updateSearch(browser, floorTitle);
    waitForFloorTitle(browser, floorTitle, true);
    updateSearch(browser, '');

    clickFloorAction(browser, floorTitle, '編集');
    browser.waitForElementVisible('#edit_floor_title', 10000);
    const originalImage = exerciseImageReplacementCancel(browser, imagePath);
    browser.clearValue('#edit_floor_title').setValue('#edit_floor_title', editedTitle);
    clickExactFloorDialogSubmit(browser, {
      title: editedTitle,
      description: floorDescription,
      displayHidden: true,
      imageState: 'uploaded',
      label: 'フロアの編集を確定',
    });
    waitForDialogClosed(browser, '#edit_floor_title', '編集');
    waitForFloorTitle(browser, editedTitle, true);

    browser.refresh().waitForElementVisible('#search_floor_input', 10000);
    waitForFloorTitle(browser, editedTitle, true);
    clickFloorAction(browser, editedTitle, '編集');
    assertOriginalImage(browser, originalImage);
    clickSingleVisible(browser, '[data-testid="base-edit-dialog-cancel"]', '保存済みのフロア画像の確認画面を閉じる');
    waitForDialogClosed(browser, '#edit_floor_title', '保存済みの画像を確認');

    clickFloorAction(browser, editedTitle, '削除');
    browser.waitForElementVisible('#delete_floor_dialog_description', 10000);
    clickSingleVisible(
      browser,
      '[data-testid="delete-floor-dialog-confirm"], [data-testid="delete-room-dialog-confirm"]',
      'フロアの削除を確定'
    );
    waitForDialogClosed(browser, '#delete_floor_dialog_description', '削除');
    waitForFloorTitle(browser, editedTitle, false);

    browser.end();
  },
};
