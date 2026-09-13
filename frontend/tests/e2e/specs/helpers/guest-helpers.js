const { findOptionalElement, getBaseUrl, navigateToApp } = require('./login');
const { loginByForm, waitForUserRole } = require('./session-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('./dialog-focus');

const waitForGuestSession = (browser, attempt = 0) => {
  const maxAttempts = 40;
  browser.execute(
    function () {
      try {
        const raw = localStorage.getItem('iseeetl_store');
        if (!raw) return { ready: false, isLogin: false, hasGuestId: false };
        const store = JSON.parse(raw);
        const user = store && store.user ? store.user : {};
        return {
          ready: !user.isLogin && !!user.guestId,
          isLogin: !!user.isLogin,
          hasGuestId: !!user.guestId,
        };
      } catch (_) {
        return { ready: false, isLogin: false, hasGuestId: false };
      }
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.ready) {
        browser.assert.ok(true, 'ログアウト後にゲストのセッションを確認しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `ログアウト後にゲストのセッションを確認できませんでした: isLogin=${!!state.isLogin} hasGuestId=${!!state.hasGuestId}`
        );
        return;
      }
      browser.pause(500, () => waitForGuestSession(browser, attempt + 1));
    }
  );
};

const openAppMenuIfAvailable = (browser, onReady, attempt = 0) => {
  const maxAttempts = 40;
  browser.execute(
    function () {
      const app = document.querySelector('#app_container');
      const menu = document.querySelector('[data-testid="app-menu"]');
      const button = document.querySelector('[data-testid="app-menu-button"]');
      const menuVisible = !!(menu && (menu.offsetParent || menu.getClientRects().length));
      const appInert = !!(app && app.inert);

      if (!menuVisible && button && !appInert) button.click();

      return {
        appInert,
        buttonFound: !!button,
        menuVisible,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (!state.buttonFound) {
        onReady(false);
        return;
      }
      if (state.menuVisible) {
        onReady(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ログアウト前にアプリメニューを開けませんでした: ${JSON.stringify(state)}`);
        onReady(false);
        return;
      }
      browser.pause(250, () => openAppMenuIfAvailable(browser, onReady, attempt + 1));
    }
  );
};

const logoutIfPossible = (browser) => {
  openAppMenuIfAvailable(browser, (opened) => {
    if (!opened) return;
    findOptionalElement(browser, '[data-testid="app-menu-logout"]', (logoutResult) => {
      if (logoutResult.status !== 0) {
        browser.click('[data-testid="app-menu-close"]');
        return;
      }
      browser.click('[data-testid="app-menu-logout"]');
      waitForGuestSession(browser);
    });
  });
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

const clickDialogConfirmByInput = (browser, expectations, label) => {
  browser.execute(
    function (payload) {
      const isVisibleEnabled = (node) => {
        if (!node || node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
        const style = window.getComputedStyle(node);
        if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
        return !!(node.offsetParent || node.getClientRects().length);
      };
      const anchors = Array.from(document.querySelectorAll(payload.anchorSelector)).filter(isVisibleEnabled);
      if (anchors.length !== 1) return { clicked: false, reason: `anchor-count:${anchors.length}` };
      const dialog = anchors[0].closest('[role="dialog"]');
      if (!dialog) return { clicked: false, reason: 'dialog-not-found' };

      for (const field of payload.expectedInputs) {
        const inputs = Array.from(dialog.querySelectorAll(field.selector)).filter(isVisibleEnabled);
        if (inputs.length !== 1) return { clicked: false, reason: `input-count:${field.selector}:${inputs.length}` };
        if (String(inputs[0].value == null ? '' : inputs[0].value) !== String(field.value)) {
          return { clicked: false, reason: `input-value:${field.selector}` };
        }
      }

      for (const field of payload.expectedChecks) {
        const inputs = Array.from(dialog.querySelectorAll(field.selector)).filter(
          (input) => !input.disabled && input.getAttribute('aria-disabled') !== 'true'
        );
        if (inputs.length !== 1) {
          return { clicked: false, reason: `checkbox-count:${field.selector}:${inputs.length}` };
        }
        if (inputs[0].checked !== field.checked) {
          return { clicked: false, reason: `checkbox-value:${field.selector}` };
        }
      }

      if (payload.expectedTargetLangs !== null) {
        const expected = new Set(payload.expectedTargetLangs);
        const actual = Array.from(dialog.querySelectorAll('fieldset input[type="checkbox"][value]'))
          .filter((input) => input.checked)
          .map((input) => input.value);
        if (actual.length !== expected.size || !actual.every((language) => expected.has(language))) {
          return { clicked: false, reason: 'target-languages-value' };
        }
      }

      const confirms = Array.from(dialog.querySelectorAll('[data-testid="base-edit-dialog-confirm"]')).filter(
        isVisibleEnabled
      );
      if (confirms.length !== 1) return { clicked: false, reason: `confirm-count:${confirms.length}` };
      confirms[0].click();
      return { clicked: true, reason: '' };
    },
    [expectations],
    (result) => {
      const value = result && result.value ? result.value : {};
      if (value.clicked) return;
      const suffix = label ? ` (${label})` : '';
      const reason = value.reason || 'unknown';
      browser.assert.ok(false, `ダイアログの確定ボタンをクリックできませんでした${suffix}: ${reason}`);
    }
  );
};

const waitForDialogClosed = (browser, selector, label, attempt = 0) => {
  const maxAttempts = 80;
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

const waitForFloorTitle = (browser, title, shouldExist, attempt = 0, onMatch = null) => {
  const maxAttempts = 40;
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
        if (onMatch) onMatch();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `フロア名の確認結果=${shouldExist ? '未検出' : '残存'}: ${title}`);
        return;
      }
      browser.pause(500, () => waitForFloorTitle(browser, title, shouldExist, attempt + 1, onMatch));
    }
  );
};

const waitForRoomTitle = (browser, title, shouldExist, attempt = 0) => {
  const maxAttempts = 40;
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

const openFloorList = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, base).waitForElementVisible('#search_floor_input', 20000);
};

const openRoomList = (browser, floorId, options = {}) => {
  const requireCreateButton = options.requireCreateButton !== false;
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/floor/${encodeURIComponent(floorId)}`).waitForElementVisible('.view', 10000);
  browser.perform(() => {
    const waitForStoreFloorId = (attempt = 0) => {
      const maxAttempts = 40;
      browser.execute(
        function () {
          try {
            const raw = localStorage.getItem('iseeetl_store');
            if (!raw) return { floorId: null };
            const store = JSON.parse(raw);
            const id = store && store.floor ? store.floor.id : null;
            return { floorId: id ? String(id) : null };
          } catch (_) {
            return { floorId: null };
          }
        },
        [],
        (result) => {
          const currentFloorId = result && result.value ? result.value.floorId : null;
          if (currentFloorId && String(currentFloorId) === String(floorId)) {
            browser.assert.ok(true, `ルーム一覧のフロア情報を確認しました: ${currentFloorId}`);
            return;
          }
          if (attempt >= maxAttempts) {
            browser.assert.ok(
              false,
              `ルーム一覧のフロア情報が一致しません: 期待値=${floorId} 実際=${currentFloorId || 'unknown'}`
            );
            return;
          }
          browser.pause(500, () => waitForStoreFloorId(attempt + 1));
        }
      );
    };
    waitForStoreFloorId(0);
  });
  if (requireCreateButton) {
    browser.waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
    return;
  }
  findOptionalElement(browser, '[data-testid="room-list-create-button"]', (result) => {
    if (result.status === 0) {
      browser.waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
    }
  });
};

const createFloor = (browser, title, options = {}) => {
  const { targetLangs } = options;
  browser.waitForElementVisible('[data-testid="floor-list-create-button"]', 10000);
  clickFirstVisible(browser, '[data-testid="floor-list-create-button"]', 'フロアの作成画面を開く');
  browser.waitForElementVisible('#edit_floor_title', 20000);
  browser.clearValue('#edit_floor_title').setValue('#edit_floor_title', title);
  browser.clearValue('#edit_floor_description').setValue('#edit_floor_description', 'E2E guest floor.');
  if (Array.isArray(targetLangs)) {
    browser.execute(
      function (expectedLanguages) {
        const titleInput = document.querySelector('#edit_floor_title');
        const dialog = titleInput ? titleInput.closest('[role="dialog"]') : null;
        if (!dialog) return { ok: false, reason: 'dialog-not-found', actual: [] };
        const expected = new Set(expectedLanguages);
        const languageFieldset = dialog.querySelector('fieldset');
        const languageInputs = languageFieldset
          ? Array.from(languageFieldset.querySelectorAll('input[type="checkbox"][value]'))
          : [];
        languageInputs.forEach((input) => {
          if (input.checked !== expected.has(input.value)) input.click();
        });
        const actual = languageInputs.filter((input) => input.checked).map((input) => input.value);
        return {
          ok:
            actual.length === expected.size &&
            actual.every((language) => expected.has(language)),
          reason: 'language-selection-mismatch',
          actual,
        };
      },
      [targetLangs],
      (result) => {
        const state = result && result.value ? result.value : { ok: false, reason: 'execute-failed', actual: [] };
        browser.assert.ok(
          state.ok,
          `フロアの翻訳先が一致しました: 期待値=${JSON.stringify(targetLangs)} 実際=${JSON.stringify(
            state.actual
          )} reason=${state.reason || 'ok'}`
        );
      }
    );
  }
  clickDialogConfirmByInput(
    browser,
    {
      anchorSelector: '#edit_floor_title',
      expectedInputs: [
        { selector: '#edit_floor_title', value: title },
        { selector: '#edit_floor_description', value: 'E2E guest floor.' },
      ],
      expectedChecks: [],
      expectedTargetLangs: Array.isArray(targetLangs) ? targetLangs : null,
    },
    'フロアの作成を確定'
  );
  waitForDialogClosed(browser, '#edit_floor_title', 'フロアを作成');
};

const createRoom = (browser, title, options = {}) => {
  const guestReactionOnly = options.guestReactionOnly === true;
  const memberOnly = options.memberOnly === true;
  const hidden = options.hidden === true;
  browser.waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
  clickFirstVisible(browser, '[data-testid="room-list-create-button"]', 'ルームの作成画面を開く');
  browser.waitForElementVisible('#room_title', 20000);
  browser.clearValue('#room_title').setValue('#room_title', title);
  browser.clearValue('#room_description').setValue('#room_description', 'E2E guest room.');
  if (guestReactionOnly) {
    browser.click('label[for="guest_reaction_only"]');
  }
  if (memberOnly) {
    browser.click('label[for="member_only"]');
  }
  if (hidden) {
    browser.click('label[for="hidden_flg"]');
  }
  clickDialogConfirmByInput(
    browser,
    {
      anchorSelector: '#room_title',
      expectedInputs: [
        { selector: '#room_title', value: title },
        { selector: '#room_description', value: 'E2E guest room.' },
      ],
      expectedChecks: [
        { selector: '#guest_reaction_only', checked: guestReactionOnly },
        { selector: '#member_only', checked: memberOnly },
        { selector: '#hidden_flg', checked: hidden },
      ],
      expectedTargetLangs: null,
    },
    'ルームの作成を確定'
  );
  waitForDialogClosed(browser, '#room_title', 'ルームを作成');
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

const openGuestTimeline = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
  navigateToApp(browser, url).waitForElementVisible('.timeline-page', 20000);
  waitForTimelineReady(browser);
};

const openTimeline = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
  navigateToApp(browser, url).waitForElementVisible('.timeline-page', 20000);
};

const openPostDialog = (browser, label) => {
  browser.execute(
    function () {
      const selectors = ['[data-testid="timeline-post-button"]', '[data-testid="timeline-nagasu-button"]'];
      for (const selector of selectors) {
        const nodes = Array.from(document.querySelectorAll(selector));
        const target = nodes.find((node) => node.offsetParent !== null);
        if (target) {
          target.click();
          return { clicked: true, selector };
        }
      }
      return { clicked: false };
    },
    [],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        browser.assert.ok(false, `クリックできる表示中の要素がありません（${label || '投稿ダイアログ'}）。`);
      }
    }
  );
};

const openGuestPostDialog = (browser) => {
  openPostDialog(browser, 'ゲストの投稿ダイアログ');
  browser.pause(300);
  confirmGuestRulesIfVisible(browser);
  browser.waitForElementVisible('[data-testid="dialog-edit-post"]', 10000);
};

const waitForPostTextContains = (browser, text, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (payload) {
      const posts = Array.from(document.querySelectorAll('article'));
      const target = posts.find((post) => {
        const node = post.querySelector('.text');
        return node && node.textContent && node.textContent.includes(payload.text);
      });
      return { ok: !!target };
    },
    [{ text }],
    (result) => {
      const ok = result && result.value ? result.value.ok : false;
      if (ok) {
        browser.assert.ok(true, '投稿の本文が見つかりました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '投稿の本文が見つかりません。');
        return;
      }
      browser.pause(500, () => waitForPostTextContains(browser, text, attempt + 1));
    }
  );
};

const createPost = (browser, text) => {
  browser.waitForElementVisible('[data-testid="timeline-post-button"]', 10000);
  clickFirstVisible(browser, '[data-testid="timeline-post-button"]', '投稿ダイアログを開く');
  browser.waitForElementVisible('[data-testid="dialog-edit-post"]', 10000);
  browser.clearValue('#post_content').setValue('#post_content', text);
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#post_content',
    expectedControls: [{ selector: '#post_content', property: 'value', value: text }],
    submitSelector:
      '.desktop-item[data-testid="dialog-edit-post-submit"], .mobile-item[data-testid="dialog-edit-post-submit"]',
    label: '投稿を送信',
  });
  waitForDialogClosed(browser, '[data-testid="dialog-edit-post"]', '投稿を送信');
  waitForPostTextContains(browser, text);
};

const openReactionPickerForPost = (browser, postText) => {
  browser.execute(
    function (targetText) {
      const posts = Array.from(document.querySelectorAll('article')).filter((article) =>
        Array.from(article.querySelectorAll('.text')).some(
          (node) => node.textContent && node.textContent.trim() === targetText
        )
      );
      if (posts.length !== 1) return { clicked: false, reason: `post-count:${posts.length}` };
      const post = posts[0];
      const container = post.querySelector('.reaction-container');
      if (!container) return { clicked: false, reason: 'container-not-found' };
      const reactionButtons = Array.from(container.querySelectorAll('button')).filter((button) => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
        if (!(button.offsetParent || button.getClientRects().length)) return false;
        const icon = button.querySelector('[aria-hidden="true"]');
        return icon && icon.textContent && icon.textContent.trim() === 'add_reaction';
      });
      if (reactionButtons.length !== 1) {
        return { clicked: false, reason: `button-count:${reactionButtons.length}` };
      }
      reactionButtons[0].click();
      return { clicked: true };
    },
    [postText],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `リアクションの選択画面を開けませんでした: ${reason}`);
      }
    }
  );
  browser.waitForElementVisible('.reaction-picker', 10000);
};

const clickLikeReaction = (browser) => {
  browser.execute(
    function () {
      const pickers = Array.from(document.querySelectorAll('.reaction-picker')).filter(
        (node) => node.offsetParent || node.getClientRects().length
      );
      if (pickers.length !== 1) return { clicked: false, reason: `picker-count:${pickers.length}` };
      const buttons = Array.from(pickers[0].querySelectorAll('.reaction-buttons button')).filter((button) => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
        if (!(button.offsetParent || button.getClientRects().length)) return false;
        const image = button.querySelector('img.emoji-icon');
        return image && image.getAttribute('alt') === 'いいね';
      });
      if (buttons.length !== 1) return { clicked: false, reason: `reaction-count:${buttons.length}` };
      buttons[0].click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `いいねのリアクションをクリックできませんでした: ${reason}`);
      }
    }
  );
};

const readPostReactionCount = (browser, postText, callback) => {
  browser.execute(
    function (targetText) {
      const posts = Array.from(document.querySelectorAll('article')).filter((article) =>
        Array.from(article.querySelectorAll('.text')).some(
          (node) => node.textContent && node.textContent.trim() === targetText
        )
      );
      if (posts.length !== 1) return { present: false, count: 0, matches: posts.length };
      const counts = Array.from(posts[0].querySelectorAll('.reaction-item .reaction-count'));
      const total = counts.reduce((sum, node) => sum + Number(node.textContent || 0), 0);
      return { present: true, count: total, matches: 1 };
    },
    [postText],
    (result) => callback(result && result.value ? result.value : { present: false, count: 0, matches: -1 })
  );
};

const waitForReactionIncrease = (browser, postText, initialCount, attempt = 0) => {
  const maxAttempts = 10;
  confirmGuestRulesIfVisible(browser);
  readPostReactionCount(browser, postText, (state) => {
    if (!state.present) {
      browser.assert.ok(false, `リアクション対象の投稿は1件の想定ですが、実際は${state.matches}件でした。`);
      return;
    }
    if (state.count > initialCount) {
      browser.assert.ok(true, `リアクションを追加しました: ${initialCount} → ${state.count}。`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `リアクション数が増えませんでした: ${state.count}。`);
      return;
    }
    browser.pause(500, () => waitForReactionIncrease(browser, postText, initialCount, attempt + 1));
  });
};

const confirmGuestRulesIfVisible = (browser) => {
  browser.pause(200).execute(
    function () {
      const dialogs = Array.from(
        document.querySelectorAll('[data-testid="dialog-guest-rules"]')
      ).filter((dialog) => dialog.offsetParent || dialog.getClientRects().length);
      return { count: dialogs.length };
    },
    [],
    (result) => {
      const count = result && result.value ? result.value.count : -1;
      if (count === 0) return;
      browser.assert.equal(count, 1, 'ゲストの利用ルールのダイアログが1件だけ表示されています。');
      if (count !== 1) return;
      clickSingleVisibleAfterExactControls(browser, {
        anchorSelector: '#guest_rules_dialog_title',
        expectedControls: [],
        submitSelector: '[data-testid="dialog-guest-rules-confirm"]',
        label: 'ゲストの利用ルールに同意',
      });
    }
  );
};

const waitForLoginRequiredDialogClosed = (browser, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const roots = Array.from(document.querySelectorAll('[data-testid="dialog-login-required"]'));
      const visibleCount = roots.reduce((count, root) => {
        const panel = root.querySelector('[role="dialog"]');
        return count + (panel && (panel.offsetParent || panel.getClientRects().length) ? 1 : 0);
      }, 0);
      return { visibleCount };
    },
    [],
    (result) => {
      const visibleCount = result && result.value ? result.value.visibleCount : -1;
      if (visibleCount === 0) {
        browser.assert.ok(true, 'ログイン要求のダイアログが閉じました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ログイン要求のダイアログが閉じていません: ${visibleCount}`);
        return;
      }
      browser.pause(500, () => waitForLoginRequiredDialogClosed(browser, attempt + 1));
    }
  );
};

const waitForLoginRequiredDialog = (browser, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const roots = Array.from(document.querySelectorAll('[data-testid="dialog-login-required"]'));
      const visiblePanels = roots
        .map((root) => root.querySelector('[role="dialog"]'))
        .filter((panel) => panel && (panel.offsetParent || panel.getClientRects().length));
      if (visiblePanels.length !== 1) {
        return { clicked: false, reason: `visible-dialog-count:${visiblePanels.length}` };
      }

      const buttons = Array.from(
        visiblePanels[0].querySelectorAll(
          '[data-testid="dialog-login-required-confirm-desktop"]:not([disabled]), ' +
            '[data-testid="dialog-login-required-confirm-mobile"]:not([disabled])'
        )
      ).filter((button) => button.offsetParent || button.getClientRects().length);
      if (buttons.length !== 1) {
        return { clicked: false, reason: `visible-confirm-count:${buttons.length}` };
      }

      buttons[0].click();
      return { clicked: true, reason: '' };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'execute-failed' };
      if (state.clicked) {
        browser.assert.ok(true, '表示中のログイン要求ダイアログを確定しました。');
        waitForLoginRequiredDialogClosed(browser);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ログイン要求ダイアログを確定できませんでした: ${state.reason}`);
        return;
      }
      browser.pause(500, () => waitForLoginRequiredDialog(browser, attempt + 1));
    }
  );
};

const clickGuestMediaImage = (browser, onDone, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const visible = (element) =>
        !!(element && (element.offsetParent || element.getClientRects().length));
      const dialogs = Array.from(
        document.querySelectorAll('[data-testid="dialog-edit-post"]')
      ).filter(visible);
      if (dialogs.length !== 1) {
        return { clicked: false, groupVisible: false, count: 0, dialogCount: dialogs.length };
      }
      const group = dialogs[0].querySelector('.media-input-group');
      const groupVisible = !!(group && (group.offsetParent || group.getClientRects().length));
      const candidates = Array.from(
        dialogs[0].querySelectorAll('[data-testid="media-input-image-button"]')
      ).filter((button) => !button.disabled && visible(button));
      if (!groupVisible || candidates.length !== 1) {
        return { clicked: false, groupVisible, count: candidates.length, dialogCount: 1 };
      }

      // ゲストにはクリックでログイン要求を表示するため、aria-disabledでも操作する。
      candidates[0].click();
      return { clicked: true, groupVisible: true, count: 1, dialogCount: 1 };
    },
    [],
    (result) => {
      const state =
        result && result.value
          ? result.value
          : { clicked: false, groupVisible: false, count: 0, dialogCount: 0 };
      if (state.clicked && state.count === 1) {
        browser.assert.ok(true, 'ゲストの画像操作を1件だけクリックしました。');
        waitForLoginRequiredDialog(browser);
        if (typeof onDone === 'function') onDone();
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `ゲストの画像操作を1件に特定できませんでした: dialogs=${state.dialogCount} ` +
            `panel=${state.groupVisible} count=${state.count}`
        );
        if (typeof onDone === 'function') onDone();
        return;
      }
      browser.pause(250, () => clickGuestMediaImage(browser, onDone, attempt + 1));
    }
  );
};

const verifyGuestMediaBlocked = (browser, onDone) => {
  browser.execute(
    function () {
      const visible = (element) =>
        !!(element && (element.offsetParent || element.getClientRects().length));
      const dialogs = Array.from(
        document.querySelectorAll('[data-testid="dialog-edit-post"]')
      ).filter(visible);
      if (dialogs.length !== 1) return { ok: false, reason: `dialog-count:${dialogs.length}` };

      const toggle = dialogs[0].querySelector('[data-testid="dialog-edit-post-media-title-toggle"]');
      if (!toggle || !visible(toggle) || toggle.disabled) {
        return { ok: false, reason: 'toggle-unavailable' };
      }
      if (toggle.getAttribute('aria-expanded') === 'false') {
        toggle.click();
        return { ok: true, action: 'opened' };
      }
      return { ok: true, action: 'already-open' };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'execute-failed' };
      browser.assert.ok(state.ok, `ゲストのメディアパネルを利用できます（${state.reason || state.action}）。`);
      if (!state.ok) {
        if (typeof onDone === 'function') onDone();
        return;
      }
      clickGuestMediaImage(browser, onDone);
    }
  );
};

const readGuestName = (browser, callback) => {
  browser.execute(
    function () {
      const input = document.querySelector('#guest_name');
      return input ? input.value : '';
    },
    [],
    (result) => callback(result && typeof result.value === 'string' ? result.value : '')
  );
};

module.exports = {
  clickFirstVisible,
  clickFloorAction,
  closeSoundCautionIfVisible,
  confirmGuestRulesIfVisible,
  createFloor,
  createPost,
  createRoom,
  findFloorIdByTitle,
  findRoomIdByTitle,
  loginByForm,
  logoutIfPossible,
  openFloorList,
  openGuestPostDialog,
  openGuestTimeline,
  openRoomList,
  openTimeline,
  openReactionPickerForPost,
  readPostReactionCount,
  readGuestName,
  waitForDialogClosed,
  waitForFloorTitle,
  waitForPostTextContains,
  waitForReactionIncrease,
  waitForRoomTitle,
  waitForTimelineReady,
  waitForUserRole,
  verifyGuestMediaBlocked,
  clickLikeReaction,
};
