const { requireEnv } = require('../../helpers/login');
const {
  loginByForm,
  openFloorList,
  openRoomList,
  clickExactFloorDialogSubmit,
  clickExactRoomDialogSubmit,
} = require('../../helpers/role-helpers');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

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

const readRoomOrder = (browser, onReady) => {
  browser.execute(
    function () {
      const ids = Array.from(document.querySelectorAll('.room-list > li .room-link[id]'))
        .map((link) => String(link.id || ''))
        .filter(Boolean);
      return { ok: true, ids };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false };
      if (!state.ok) {
        browser.assert.ok(false, `ルーム一覧が見つかりません: ${state.reason || 'unknown'}`);
        return;
      }
      if (onReady) onReady(state.ids || []);
    }
  );
};

const swapFirstTwoRooms = (browser) => {
  browser.waitForElementVisible('.room-list > li:nth-child(1) .room-handle', 10000).execute(
    function () {
      const handles = document.querySelectorAll('.room-list > li .room-handle');
      if (handles.length < 2) return { ok: false, offset: 0 };
      const first = handles[0].getBoundingClientRect();
      const second = handles[1].getBoundingClientRect();
      return { ok: true, offset: Math.round(second.top + second.height / 2 - (first.top + first.height / 2)) };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, offset: 0 };
      browser.assert.ok(state.ok, 'ドラッグして並べ替えられるルームが2件あります。');
      if (state.ok) {
        browser.dragAndDrop('.room-list > li:nth-child(1) .room-handle', { x: 0, y: state.offset });
      }
    }
  );
};

const waitForRoomOrder = (browser, expectedIds, attempt = 0, onReady) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const visible = (node) => !!(node && (node.offsetParent || node.getClientRects().length));
      const view = document.querySelector('.view');
      const app = document.querySelector('#app');
      return {
        path: window.location.pathname || '',
        loginVisible: visible(document.querySelector('#mail')),
        blank: !app || app.childElementCount === 0,
        busy: view ? view.getAttribute('aria-busy') === 'true' : null,
        roomListVisible: visible(document.querySelector('.room-list')),
        ids: Array.from(document.querySelectorAll('.room-list > li .room-link[id]'))
          .map((link) => String(link.id || ''))
          .filter(Boolean),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { busy: null, ids: [] };
      const orderMatches =
        state.ids.length === expectedIds.length && expectedIds.every((id, index) => state.ids[index] === id);
      if (state.busy === false && orderMatches) {
        if (onReady) onReady(true);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ルームの並べ替えが完了しませんでした: ${JSON.stringify(state)}`);
        if (onReady) onReady(false);
        return;
      }
      browser.pause(500, () => waitForRoomOrder(browser, expectedIds, attempt + 1, onReady));
    }
  );
};

module.exports = {
  'ルーム一覧を並べ替えられる': (browser) => {
    const mail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const password = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Reorder Floor ${stamp}`;
    const roomTitleA = `E2E Reorder Room A ${stamp}`;
    const roomTitleB = `E2E Reorder Room B ${stamp}`;
    let floorId = '';

    loginByForm(browser, { mail, password });
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    closeSoundCautionIfVisible(browser);
    openFloorList(browser);

    browser.waitForElementVisible('[data-testid="floor-list-create-button"]', 10000);
    clickFirstVisible(browser, '[data-testid="floor-list-create-button"]', 'フロアの作成画面を開く');
    browser
      .waitForElementVisible('#edit_floor_title', 10000)
      .clearValue('#edit_floor_title')
      .setValue('#edit_floor_title', floorTitle)
      .clearValue('#edit_floor_description')
      .setValue('#edit_floor_description', 'E2E reorder floor description.');
    clickExactFloorDialogSubmit(browser, {
      title: floorTitle,
      description: 'E2E reorder floor description.',
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
        .setValue('#room_title', roomTitleA)
        .clearValue('#room_description')
        .setValue('#room_description', 'E2E reorder room A.');
      clickExactRoomDialogSubmit(browser, {
        title: roomTitleA,
        description: 'E2E reorder room A.',
        filesLength: 0,
        imageState: 'none',
        label: 'ルームAの作成を確定',
      });
      waitForDialogClosed(browser, '#room_title', 'ルームAを作成');
      waitForRoomTitle(browser, roomTitleA, true);

      browser.waitForElementVisible('[data-testid="room-list-create-button"]', 10000);
      clickFirstVisible(browser, '[data-testid="room-list-create-button"]', 'ルームBの作成画面を開く');
      browser
        .waitForElementVisible('#room_title', 10000)
        .clearValue('#room_title')
        .setValue('#room_title', roomTitleB)
        .clearValue('#room_description')
        .setValue('#room_description', 'E2E reorder room B.');
      clickExactRoomDialogSubmit(browser, {
        title: roomTitleB,
        description: 'E2E reorder room B.',
        filesLength: 0,
        imageState: 'none',
        label: 'ルームBの作成を確定',
      });
      waitForDialogClosed(browser, '#room_title', 'ルームBを作成');
      waitForRoomTitle(browser, roomTitleB, true);

      readRoomOrder(browser, (ids) => {
        if (ids.length < 2) {
          browser.assert.ok(false, 'ルームの並べ替えには、作成した2件のルームが必要です。');
          browser.end();
          return;
        }
        const reordered = [ids[1], ids[0], ...ids.slice(2)];
        swapFirstTwoRooms(browser);
        waitForRoomOrder(browser, reordered, 0, (reorderedLocally) => {
          if (!reorderedLocally) {
            browser.end();
            return;
          }
          openFloorList(browser);
          openRoomList(browser, floorId);
          waitForRoomOrder(browser, reordered, 0, (reorderedPersisted) => {
            if (!reorderedPersisted) {
              browser.end();
              return;
            }
            swapFirstTwoRooms(browser);
            waitForRoomOrder(browser, ids, 0, (restoredLocally) => {
              if (!restoredLocally) {
                browser.end();
                return;
              }
              openFloorList(browser);
              openRoomList(browser, floorId);
              waitForRoomOrder(browser, ids, 0, (restoredPersisted) => {
                if (restoredPersisted) {
                  browser.assert.ok(true, '元の並び順へ戻して画面を再表示しても、ルームの並び順を維持します。');
                }
                browser.end();
              });
            });
          });
        });
      });
    });
  },
};
