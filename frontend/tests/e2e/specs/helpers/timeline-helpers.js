const { getBaseUrl, navigateToApp, loginToTimeline } = require('./login');
const {
  loginByForm,
  logoutIfPossible,
  closeSoundCautionIfVisible,
  clickFirstVisible,
  waitForUserRole,
  waitForDialogClosed,
  waitForTimelineReady,
  waitForFloorTitle,
  waitForRoomTitle,
  findFloorIdByTitle,
  findRoomIdByTitle,
  openFloorList,
  openRoomList,
  createFloor,
  createRoom,
  clickFloorAction,
} = require('./guest-helpers');
const { clickRoomAction } = require('./invite-ui-helpers');
const { clickSingleVisibleAfterExactControls } = require('./dialog-focus');

const waitForTimelineRoute = (browser, floorId, roomId, attempt = 0) => {
  const maxAttempts = 40;
  const expectedPath = `/floor/${floorId}/room/${roomId}`;
  browser.execute(
    function (path) {
      const timeline = document.querySelector('.timeline-page');
      return {
        path: window.location.pathname,
        timelineVisible: !!(timeline && (timeline.offsetParent || timeline.getClientRects().length)),
        expectedPath: path,
      };
    },
    [expectedPath],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.path === expectedPath && state.timelineVisible) {
        browser.assert.ok(true, `ログイン後に準備したタイムラインへ移動しました: ${expectedPath}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `ログイン後の遷移先が一致しません: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForTimelineRoute(browser, floorId, roomId, attempt + 1));
    }
  );
};

const waitForPreparedRoomList = (browser, floorId, requireCreateButton, attempt = 0) => {
  const maxAttempts = 40;
  const expectedPath = `/floor/${floorId}`;
  browser.execute(
    function () {
      const roomList = document.querySelector('.room-list');
      const createButton = document.querySelector('[data-testid="room-list-create-button"]');
      return {
        path: window.location.pathname,
        roomListVisible: !!(roomList && (roomList.offsetParent || roomList.getClientRects().length)),
        createButtonVisible: !!(
          createButton &&
          (createButton.offsetParent || createButton.getClientRects().length)
        ),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (
        state.path === expectedPath &&
        state.roomListVisible &&
        (!requireCreateButton || state.createButtonVisible)
      ) {
        browser.assert.ok(true, `準備したルーム一覧が開きました: ${expectedPath}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `準備したルーム一覧が開きませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () =>
        waitForPreparedRoomList(browser, floorId, requireCreateButton, attempt + 1)
      );
    }
  );
};

const openPreparedRoomListByFloorTitle = (
  browser,
  { floorId, floorTitle, requireCreateButton }
) => {
  waitForFloorTitle(browser, floorTitle, true);
  browser.execute(
    function (targetTitle) {
      const title = Array.from(document.querySelectorAll('h2.floor-title')).find(
        (node) => node.textContent && node.textContent.trim() === targetTitle
      );
      const link = title ? title.closest('a') : null;
      if (!link) return { clicked: false, reason: 'floor-link-not-found' };
      link.click();
      return { clicked: true };
    },
    [floorTitle],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'execute-failed' };
      browser.assert.ok(state.clicked, `準備したフロアのリンクをクリックしました: ${state.reason || floorTitle}`);
    }
  );
  waitForPreparedRoomList(browser, floorId, requireCreateButton);
};

const loginToTimelineThroughRoomContextMenu = (
  browser,
  { mail, password, floorId, roomId, floorTitle, roomTitle }
) => {
  openPreparedRoomListByFloorTitle(browser, {
    floorId,
    floorTitle,
    requireCreateButton: false,
  });
  waitForRoomTitle(browser, roomTitle, true);
  browser.execute(
    function (targetTitle) {
      const title = Array.from(document.querySelectorAll('h2.room-title')).find(
        (node) => node.textContent && node.textContent.trim() === targetTitle
      );
      const link = title ? title.closest('a') : null;
      if (!link) return { clicked: false, reason: 'room-link-not-found' };
      link.click();
      return { clicked: true };
    },
    [roomTitle],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'execute-failed' };
      browser.assert.ok(state.clicked, `準備したルームのリンクをクリックしました: ${state.reason || roomTitle}`);
    }
  );
  browser.waitForElementVisible('.timeline-page', 20000);
  waitForTimelineReady(browser);
  closeSoundCautionIfVisible(browser);
  browser
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu-login"]', 10000)
    .execute(
      function (expectedFloorId, expectedRoomId) {
        const link = document.querySelector('[data-testid="app-menu-login"]');
        const url = link ? new URL(link.href, window.location.origin) : null;
        return {
          found: !!url,
          path: url ? url.pathname : '',
          floorId: url ? url.searchParams.get('floor_id') : null,
          roomId: url ? url.searchParams.get('room_id') : null,
          expectedFloorId,
          expectedRoomId,
        };
      },
      [floorId, roomId],
      (result) => {
        const state = result && result.value ? result.value : {};
        browser.assert.ok(
          state.found &&
            state.path === '/login' &&
            state.floorId === floorId &&
            state.roomId === roomId,
          `アプリメニューのログインがルーム情報を維持しています: ${JSON.stringify(state)}`
        );
      }
    )
    .click('[data-testid="app-menu-login"]')
    .waitForElementVisible('#mail', 10000)
    .execute(
      function (expectedFloorId, expectedRoomId) {
        const query = new URLSearchParams(window.location.search);
        return {
          path: window.location.pathname,
          floorId: query.get('floor_id'),
          roomId: query.get('room_id'),
          expectedFloorId,
          expectedRoomId,
        };
      },
      [floorId, roomId],
      (result) => {
        const state = result && result.value ? result.value : {};
        browser.assert.ok(
          state.path === '/login' && state.floorId === floorId && state.roomId === roomId,
          `ログインURLがルーム情報を維持しています: ${JSON.stringify(state)}`
        );
      }
    )
    .clearValue('#mail')
    .setValue('#mail', mail)
    .clearValue('#password')
    .setValue('#password', password)
    .waitForElementVisible('[data-testid="login-submit"]', 10000)
    .click('[data-testid="login-submit"]');
  waitForTimelineRoute(browser, floorId, roomId);
  waitForTimelineReady(browser);
};

const prepareTimelineRoom = (
  browser,
  {
    editorMail,
    editorPassword,
    userMail,
    userPassword,
    floorTitle,
    roomTitle,
    targetLangs,
    loginEntry = 'direct',
  }
) => {
  const state = {
    floorId: '',
    roomId: '',
    floorTitle,
    roomTitle,
  };

  loginByForm(browser, { mail: editorMail, password: editorPassword });
  closeSoundCautionIfVisible(browser);
  browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
  waitForUserRole(browser, 'Editor');
  if (loginEntry === 'room-context-menu') {
    browser.waitForElementVisible('#search_floor_input', 20000);
  } else {
    openFloorList(browser);
  }
  createFloor(browser, floorTitle, { targetLangs });
  waitForFloorTitle(browser, floorTitle, true);
  findFloorIdByTitle(browser, floorTitle, (resolvedFloorId) => {
    state.floorId = resolvedFloorId;
  });

  browser.perform(() => {
    if (!state.floorId) {
      browser.assert.ok(false, 'フロアIDを取得できませんでした。');
      return;
    }
    if (loginEntry === 'room-context-menu') {
      openPreparedRoomListByFloorTitle(browser, {
        floorId: state.floorId,
        floorTitle,
        requireCreateButton: true,
      });
    } else {
      openRoomList(browser, state.floorId);
    }
    createRoom(browser, roomTitle);
    waitForRoomTitle(browser, roomTitle, true);
    findRoomIdByTitle(browser, roomTitle, (resolvedRoomId) => {
      state.roomId = resolvedRoomId;
    });
  });

  browser.perform(() => {
    if (!state.floorId || !state.roomId) {
      browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
      return;
    }
    logoutIfPossible(browser);
    if (loginEntry === 'room-context-menu') {
      loginToTimelineThroughRoomContextMenu(browser, {
        mail: userMail,
        password: userPassword,
        floorId: state.floorId,
        roomId: state.roomId,
        floorTitle,
        roomTitle,
      });
      return;
    }
    loginToTimeline(browser, {
      mail: userMail,
      password: userPassword,
      floorId: state.floorId,
      roomId: state.roomId,
      waitForConnected: false,
    });
    closeSoundCautionIfVisible(browser);
    waitForTimelineReady(browser);
  });

  return state;
};

const prepareFloorRoom = (
  browser,
  {
    editorMail,
    editorPassword,
    floorTitle,
    roomTitle,
    roomOptions = {},
    targetLangs,
    logoutAfter = true,
  }
) => {
  const state = {
    floorId: '',
    roomId: '',
    floorTitle,
    roomTitle,
  };

  loginByForm(browser, { mail: editorMail, password: editorPassword });
  closeSoundCautionIfVisible(browser);
  browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
  waitForUserRole(browser, 'Editor');
  openFloorList(browser);
  createFloor(browser, floorTitle, { targetLangs });
  waitForFloorTitle(browser, floorTitle, true);
  findFloorIdByTitle(browser, floorTitle, (resolvedFloorId) => {
    state.floorId = resolvedFloorId;
  });

  browser.perform(() => {
    if (!state.floorId) {
      browser.assert.ok(false, 'フロアIDを取得できませんでした。');
      return;
    }
    openRoomList(browser, state.floorId);
    createRoom(browser, roomTitle, roomOptions);
    waitForRoomTitle(browser, roomTitle, true);
    findRoomIdByTitle(browser, roomTitle, (resolvedRoomId) => {
      state.roomId = resolvedRoomId;
    });
  });

  if (logoutAfter) {
    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'フロアIDまたはルームIDを取得できませんでした。');
        return;
      }
      logoutIfPossible(browser);
    });
  }

  return state;
};

const deleteTimelineRoomThroughUi = (browser, { editorMail, editorPassword, state, floorTitle, roomTitle }) => {
  browser.perform(() => {
    const floorId = state && state.floorId ? state.floorId : '';
    if (!floorId) {
      browser.assert.ok(false, '製品APIで削除するには、準備したフロアIDが必要です。');
      return;
    }

    loginByForm(browser, { mail: editorMail, password: editorPassword });
    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    waitForUserRole(browser, 'Editor');
    openRoomList(browser, floorId, { requireCreateButton: false });
    waitForRoomTitle(browser, roomTitle, true);
    clickRoomAction(browser, roomTitle, '削除');
    browser.waitForElementVisible('#delete_room_dialog_description', 10000);
    clickFirstVisible(
      browser,
      '[data-testid="delete-floor-dialog-confirm"], [data-testid="delete-room-dialog-confirm"]',
      'ルームの削除を確定'
    );
    waitForDialogClosed(browser, '#delete_room_dialog_description', 'ルームを削除');
    waitForRoomTitle(browser, roomTitle, false);

    openFloorList(browser);
    clickFloorAction(browser, floorTitle, '削除');
    browser.waitForElementVisible('#delete_floor_dialog_description', 10000);
    clickFirstVisible(
      browser,
      '[data-testid="delete-floor-dialog-confirm"], [data-testid="delete-room-dialog-confirm"]',
      'フロアの削除を確定'
    );
    waitForDialogClosed(browser, '#delete_floor_dialog_description', 'フロアを削除');
    waitForFloorTitle(browser, floorTitle, false);
  });
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
    .setValue('#post_content', text);
  clickSingleVisibleAfterExactControls(browser, {
    anchorSelector: '#edit_post_dialog_title',
    submitSelector: '[data-testid="dialog-edit-post-submit"]',
    expectedControls: [{ selector: '#post_content', property: 'value', value: text }],
    label: '投稿を送信',
  });
  waitForDialogClosed(browser, '[data-testid="dialog-edit-post"]', '投稿を送信');
};

const buildPostXpath = (text) => `//article[.//div[contains(@class,'text') and contains(., "${text}")]]`;

const waitForPostVisibleByXpath = (browser, xpath, label) => {
  browser.useXpath().waitForElementVisible(xpath, 10000, false, (result) => {
    if (typeof result.status === 'number' && result.status !== 0) {
      browser.assert.ok(false, `投稿が表示されていません${label ? ` (${label})` : ''}: ${xpath}`);
    }
  });
  browser.useCss();
};

const waitForPostVisibleByText = (browser, text, label) => {
  const xpath = buildPostXpath(text);
  waitForPostVisibleByXpath(browser, xpath, label);
};

const waitForReactionCount = (browser, text, expected, label, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function (targetText) {
      const xpath = `//article[.//div[contains(@class,'text') and contains(., "${targetText}")]]`;
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength === 0) return { count: 0, present: false };
      const post = result.snapshotItem(0);
      const counts = Array.from(post.querySelectorAll('.reaction-item .reaction-count'));
      const total = counts.reduce((sum, node) => sum + Number(node.textContent || 0), 0);
      return { count: total, present: true };
    },
    [text],
    (result) => {
      const state = result && result.value ? result.value : { count: 0, present: false };
      if (!state.present) {
        browser.assert.ok(false, `リアクションの待機中に投稿が見つかりませんでした${label ? ` (${label})` : ''}。`);
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
      browser.pause(500, () => waitForReactionCount(browser, text, expected, label, attempt + 1));
    }
  );
};

const toggleReactionByExisting = (browser, text) => {
  browser.execute(
    function (targetText) {
      const xpath = `//article[.//div[contains(@class,'text') and contains(., "${targetText}")]]`;
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      if (result.snapshotLength !== 1) {
        return { clicked: false, reason: `post-count:${result.snapshotLength}` };
      }
      const post = result.snapshotItem(0);
      const buttons = Array.from(post.querySelectorAll('.reaction-item .reaction-button button')).filter((button) => {
        if (button.disabled || button.getAttribute('aria-disabled') === 'true') return false;
        if (!(button.offsetParent || button.getClientRects().length)) return false;
        const image = button.querySelector('img.emoji-icon');
        return image && image.getAttribute('alt') === 'いいね';
      });
      if (buttons.length !== 1) {
        return { clicked: false, reason: `reaction-button-count:${buttons.length}` };
      }
      buttons[0].click();
      return { clicked: true };
    },
    [text],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `リアクションの切り替えをクリックできませんでした: ${reason}`);
      }
    }
  );
};

const resolvePostId = (browser, text, callback) => {
  browser.execute(
    function (targetText) {
      const xpath = `//article[.//div[contains(@class,'text') and contains(., "${targetText}")]]`;
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const postIds = Array.from({ length: result.snapshotLength }, (_, index) => {
        const article = result.snapshotItem(index);
        return article && article.dataset ? article.dataset.timelineItemId || '' : '';
      });
      const uniquePostIds = Array.from(new Set(postIds.filter(Boolean)));
      const found = postIds.length > 0 && postIds.every(Boolean) && uniquePostIds.length === 1;
      return {
        found,
        postId: found ? uniquePostIds[0] : '',
        matchCount: postIds.length,
        uniquePostIds,
      };
    },
    [text],
    (result) => {
      const state = result && result.value ? result.value : { found: false, postId: '' };
      callback(state);
    }
  );
};

const openPostDetail = (browser, floorId, roomId, postId) => {
  const base = getBaseUrl(browser);
  const path = `/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}/post/${encodeURIComponent(
    postId
  )}`;
  const url = `${base.replace(/\/$/, '')}${path}`;
  navigateToApp(browser, url).waitForElementVisible('.timeline-page', 20000);
  return path;
};

const waitForFocusPost = (browser, postId, expectedPath, attempt = 0) => {
  const maxAttempts = 12;
  browser.execute(
    function (id, path) {
      const visible = (node) => !!(node && (node.offsetParent || node.getClientRects().length));
      const wrapper = document.querySelector('.focus-post-wrapper');
      const targets = Array.from(document.querySelectorAll('article[data-timeline-item-id]')).filter(
        (article) => article.dataset.timelineItemId === id
      );
      const focusedTargets = wrapper ? targets.filter((target) => wrapper.contains(target)) : [];
      return {
        path: window.location.pathname || '',
        expectedPath: path,
        connected: visible(document.querySelector('[data-testid="timeline-connected"]')),
        targetCount: targets.length,
        focusedTargetCount: focusedTargets.length,
        inWrapper: focusedTargets.length === 1,
      };
    },
    [postId, expectedPath],
    (result) => {
      const state = result && result.value ? result.value : { inWrapper: false, connected: false };
      if (
        state.path === expectedPath &&
        state.connected &&
        state.targetCount === 1 &&
        state.focusedTargetCount === 1 &&
        state.inWrapper
      ) {
        browser.assert.ok(true, `注目する投稿が表示されています: ${postId}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `注目する投稿が表示されていません: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForFocusPost(browser, postId, expectedPath, attempt + 1));
    }
  );
};

module.exports = {
  prepareTimelineRoom,
  prepareFloorRoom,
  deleteTimelineRoomThroughUi,
  clickFirstVisible,
  waitForDialogClosed,
  submitPost,
  buildPostXpath,
  waitForPostVisibleByXpath,
  waitForPostVisibleByText,
  waitForReactionCount,
  toggleReactionByExisting,
  resolvePostId,
  openPostDetail,
  waitForFocusPost,
};
