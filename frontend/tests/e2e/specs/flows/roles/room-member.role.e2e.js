const { getBaseUrl, navigateToApp, loginToTimeline } = require('../../helpers/login');
const { waitForDialogClosed } = require('../../helpers/guest-helpers');
const { createScopedTagByApiActor } = require('../../helpers/management-tag-fixture');
const { createRoomQuickTextByApiActor } = require('../../helpers/room-quicktext-fixture');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');
const {
  loginByForm,
  loginIfPresent,
  captureInviteUrl,
  createInviteUrl,
  waitForInviteCompletion,
  closeSoundCautionIfVisible,
  setInviteUrl,
  getInviteUrl,
  clickFirstVisible,
  logout,
  openRoomList,
  waitForFloorTitle,
  waitForRoomTitle,
  findFloorIdByTitle,
  findRoomIdByTitle,
  createFloor,
  createRoom,
  ensureRoomIsMemberOnly,
} = require('../../helpers/invite-ui-helpers');

const openAppMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu"]', 10000);
};

const assertElementAbsent = (browser, selector, label) => {
  browser.execute(
    function (sel) {
      return !!document.querySelector(sel);
    },
    [selector],
    (result) => {
      const exists = result && typeof result.value === 'boolean' ? result.value : false;
      browser.assert.ok(!exists, `要素が非表示です${label ? ` (${label})` : ''}: ${selector}`);
    }
  );
};

const assertTimelineRoomMemberControls = (browser) => {
  browser.waitForElementVisible('[data-testid="timeline-leave-room-button"]', 10000);
  assertElementAbsent(browser, '[data-testid="timeline-invite-member-button"]', '招待操作がタイムラインから移動済み');
  assertElementAbsent(browser, '[data-testid="timeline-room-member-button"]', 'メンバー一覧がタイムラインから移動済み');
};

const assertRoomListMemberControls = (browser, roomId) => {
  const inviteButton = `[data-testid="room-invite-member-button-${roomId}"]`;
  const memberListButton = `[data-testid="room-member-list-button-${roomId}"]`;
  browser.waitForElementVisible(memberListButton, 10000);
  assertElementAbsent(browser, inviteButton, 'ルームメンバーは招待できません');
  assertElementAbsent(browser, `.delete-room-button-${roomId}`, 'ルームメンバーはルームを削除できません');
  assertElementAbsent(browser, `[data-testid="room-tag-button-${roomId}"]`, 'ルームメンバーはタグを管理できません');
  assertElementAbsent(
    browser,
    `[data-testid="room-ai-analysis-settings-button-${roomId}"]`,
    'ルームメンバーはAI設定を管理できません'
  );
  assertElementAbsent(browser, `.roo-mt-button-${roomId}`, 'ルームメンバーは単語を管理できません');
  assertElementAbsent(browser, `.edit-room-button-${roomId}`, 'ルームメンバーはルームを編集できません');
};

const waitForAccessDenied = (browser, roomId, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (targetRoomId) {
      const path = window.location.pathname || '';
      const hasLoginForm = !!document.querySelector('#mail');
      const roomPath = `/room/${targetRoomId}`;
      return {
        path,
        onTargetRoom: path.indexOf(roomPath) !== -1,
        hasLoginForm,
      };
    },
    [roomId],
    (result) => {
      const state = result && result.value ? result.value : { path: '', onTargetRoom: true, hasLoginForm: false };
      if (state.hasLoginForm || !state.onTargetRoom) {
        browser.assert.ok(true, `アクセス拒否を確認しました${label ? ` (${label})` : ''}: ${state.path}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `アクセス拒否を確認できませんでした${label ? ` (${label})` : ''}: ${state.path}`);
        return;
      }
      browser.pause(500, () => waitForAccessDenied(browser, roomId, label, attempt + 1));
    }
  );
};

const waitForFloorListReady = (browser, label, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      const bodyText = document.body && document.body.innerText ? document.body.innerText.slice(0, 120) : '';
      return {
        href: window.location ? window.location.href || '' : '',
        path: `${window.location.pathname || ''}${window.location.search || ''}`,
        hasSearchInput: !!document.querySelector('#search_floor_input'),
        hasLoginForm: !!document.querySelector('#mail'),
        hasAppMenu: !!document.querySelector('[data-testid="app-menu-button"]'),
        hasLoginMenu: !!document.querySelector('[data-testid="app-menu-login"]'),
        hasProfileMenu: !!document.querySelector('[data-testid="app-menu-profile"]'),
        title: document.title || '',
        bodyText,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.hasSearchInput) {
        browser.waitForElementVisible('#search_floor_input', 10000);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `フロア一覧を表示できませんでした${label ? ` (${label})` : ''}: path=${state.path || ''} href=${
            state.href || ''
          } loginForm=${state.hasLoginForm ? 'yes' : 'no'} appMenu=${state.hasAppMenu ? 'yes' : 'no'} loginMenu=${
            state.hasLoginMenu ? 'yes' : 'no'
          } profileMenu=${state.hasProfileMenu ? 'yes' : 'no'} title=${state.title || ''} body=${
            state.bodyText || ''
          }`
        );
        return;
      }
      browser.pause(1000, () => waitForFloorListReady(browser, label, attempt + 1));
    }
  );
};

const openFloorListForSetup = (browser, label) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, base);
  waitForFloorListReady(browser, label);
};

const waitForTimelineConnected = (browser, label, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      const node = document.querySelector('[data-testid="timeline-connected"]');
      const visible = !!(node && (node.offsetParent || node.getClientRects().length));
      return {
        path: `${window.location.pathname || ''}${window.location.search || ''}`,
        hasLoginForm: !!document.querySelector('#mail'),
        exists: !!node,
        visible,
      };
    },
    [],
    (result) => {
      const state =
        result && result.value ? result.value : { path: '', hasLoginForm: false, exists: false, visible: false };
      if (state.visible) {
        browser.assert.ok(true, `タイムラインに接続しました${label ? ` (${label})` : ''}。`);
        return;
      }
      if (state.hasLoginForm) {
        browser.assert.ok(false, `タイムラインからログイン画面へ移動しました${label ? ` (${label})` : ''}: ${state.path}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `タイムラインの接続済み表示がありません${label ? ` (${label})` : ''}: path=${state.path} exists=${
            state.exists ? 'yes' : 'no'
          }`
        );
        return;
      }
      browser.pause(1000, () => waitForTimelineConnected(browser, label, attempt + 1));
    }
  );
};

const buildPostXpath = (text) =>
  `//article[./div[contains(concat(" ", normalize-space(@class), " "), " post ")]]` +
  `[.//div[contains(@class,"text") and contains(., "${text}")]]`;

const waitForInputValue = (browser, selector, expected, label, attempt = 0) => {
  const maxAttempts = 12;
  browser.getValue(selector, (result) => {
    const value = result && typeof result.value === 'string' ? result.value : '';
    if (value === expected) {
      browser.assert.ok(true, `入力値が一致しました${label ? ` (${label})` : ''}。`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `入力値が一致しません${label ? ` (${label})` : ''}。`);
      return;
    }
    browser.pause(300, () => waitForInputValue(browser, selector, expected, label, attempt + 1));
  });
};

const selectQuickTextInPostDialog = (browser, groupTitle, itemLabel, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (group, item) {
      const isVisible = (element) => !!(element && (element.offsetParent || element.getClientRects().length));
      const dialog = document.querySelector('[data-testid="dialog-edit-post"]');
      if (!dialog) {
        return { selected: false, retryable: false, reason: 'dialog-not-found', groupCount: 0, itemCount: 0 };
      }
      const accordion = dialog.querySelector('.quicktext-accordion');
      if (!accordion) {
        return { selected: false, retryable: true, reason: 'accordion-loading', groupCount: 0, itemCount: 0 };
      }
      const fieldsets = Array.from(accordion.querySelectorAll('.acc-fieldset')).filter((candidate) => {
        const title = candidate.querySelector('.acc-legend-title');
        return title && title.textContent.trim() === group;
      });
      if (fieldsets.length !== 1) {
        return {
          selected: false,
          retryable: fieldsets.length === 0,
          reason: `group-count:${fieldsets.length}`,
          groupCount: fieldsets.length,
          itemCount: 0,
        };
      }
      const fieldset = fieldsets[0];
      const panel = fieldset.querySelector('.acc-panel');
      const toggle = fieldset.querySelector('.acc-legend-toggle');
      const panelVisible = !!(panel && (panel.offsetParent || panel.getClientRects().length));
      if (!panelVisible && toggle && !toggle.disabled) {
        toggle.click();
        return { selected: false, retryable: true, reason: 'panel-opening', groupCount: 1, itemCount: 0 };
      }
      const buttons = Array.from(fieldset.querySelectorAll('.template-button')).filter(
        (candidate) => isVisible(candidate) && candidate.textContent && candidate.textContent.trim() === item
      );
      if (buttons.length !== 1) {
        return {
          selected: false,
          retryable: buttons.length === 0,
          reason: `item-count:${buttons.length}`,
          groupCount: 1,
          itemCount: buttons.length,
        };
      }
      const button = buttons[0];
      if (button.disabled) {
        return { selected: false, retryable: false, reason: 'item-disabled', groupCount: 1, itemCount: 1 };
      }
      button.click();
      return { selected: true, retryable: false, reason: '', groupCount: 1, itemCount: 1 };
    },
    [groupTitle, itemLabel],
    (result) => {
      const state = result && result.value
        ? result.value
        : { selected: false, retryable: false, reason: 'unknown', groupCount: 0, itemCount: 0 };
      if (state.selected && state.groupCount === 1 && state.itemCount === 1) {
        browser.assert.ok(true, `ルームの単語を選択しました: ${groupTitle} / ${itemLabel}`);
        return;
      }
      if (!state.retryable || attempt >= maxAttempts) {
        browser.assert.ok(false, `ルームの単語を利用できません: ${state.reason || 'unknown'}。`);
        return;
      }
      browser.pause(500, () => selectQuickTextInPostDialog(browser, groupTitle, itemLabel, attempt + 1));
    }
  );
};

const selectTagInPostDialog = (browser, tagName, onSelected, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (name) {
      const isVisible = (element) => !!(element && (element.offsetParent || element.getClientRects().length));
      const dialog = document.querySelector('[data-testid="dialog-edit-post"]');
      if (!dialog) {
        return {
          selected: false,
          retryable: false,
          reason: 'dialog-not-found',
          tagId: '',
          labelCount: 0,
          checkboxCount: 0,
        };
      }
      const labels = Array.from(dialog.querySelectorAll('.tag-group .checkbox-label')).filter(
        (candidate) => isVisible(candidate) && candidate.textContent && candidate.textContent.trim() === name
      );
      if (labels.length !== 1) {
        return {
          selected: false,
          retryable: labels.length === 0,
          reason: `tag-count:${labels.length}`,
          tagId: '',
          labelCount: labels.length,
          checkboxCount: 0,
        };
      }
      const label = labels[0];
      const inputId = label.getAttribute('for');
      const checkboxes = inputId
        ? Array.from(dialog.querySelectorAll(`input[id="${inputId}"]`)).filter(isVisible)
        : [];
      if (checkboxes.length !== 1) {
        return {
          selected: false,
          retryable: false,
          reason: `checkbox-count:${checkboxes.length}`,
          tagId: '',
          labelCount: 1,
          checkboxCount: checkboxes.length,
        };
      }
      const checkbox = checkboxes[0];
      if (checkbox.disabled) {
        return {
          selected: false,
          retryable: false,
          reason: 'checkbox-disabled',
          tagId: '',
          labelCount: 1,
          checkboxCount: 1,
        };
      }
      if (!checkbox.checked) checkbox.click();
      return {
        selected: checkbox.checked,
        retryable: false,
        reason: checkbox.checked ? '' : 'checkbox-not-selected',
        tagId: checkbox.getAttribute('data-tag-id') || '',
        labelCount: 1,
        checkboxCount: 1,
      };
    },
    [tagName],
    (result) => {
      const state = result && result.value
        ? result.value
        : {
            selected: false,
            retryable: false,
            reason: 'unknown',
            tagId: '',
            labelCount: 0,
            checkboxCount: 0,
          };
      if (state.selected && state.tagId && state.labelCount === 1 && state.checkboxCount === 1) {
        browser.assert.ok(true, `ルームタグを選択しました: ${tagName}`);
        if (typeof onSelected === 'function') onSelected(state.tagId);
        return;
      }
      if (!state.retryable || attempt >= maxAttempts) {
        browser.assert.ok(false, `ルームタグを利用できません: ${state.reason || 'unknown'}。`);
        return;
      }
      browser.pause(500, () => selectTagInPostDialog(browser, tagName, onSelected, attempt + 1));
    }
  );
};

const waitForTaggedPost = (browser, postXpath, tagName, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (xpathExpression, name) {
      const isVisible = (element) => !!(element && (element.offsetParent || element.getClientRects().length));
      const result = document.evaluate(
        xpathExpression,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      if (result.snapshotLength !== 1) {
        return {
          found: false,
          retryable: result.snapshotLength === 0,
          reason: `post-count:${result.snapshotLength}`,
          postCount: result.snapshotLength,
          tagCount: 0,
        };
      }
      const post = result.snapshotItem(0);
      const tagCount = Array.from(post.querySelectorAll('.tag-button')).filter(
        (tag) => isVisible(tag) && tag.textContent && tag.textContent.trim() === `#${name}`
      ).length;
      return {
        found: tagCount === 1,
        retryable: tagCount === 0,
        reason: tagCount === 1 ? '' : `tag-count:${tagCount}`,
        postCount: 1,
        tagCount,
      };
    },
    [postXpath, tagName],
    (result) => {
      const state = result && result.value
        ? result.value
        : { found: false, retryable: false, reason: 'unknown', postCount: 0, tagCount: 0 };
      if (state.found && state.postCount === 1 && state.tagCount === 1) {
        browser.assert.ok(true, `ルームメンバーの投稿にルームタグが表示されています: ${tagName}`);
        return;
      }
      if (!state.retryable || attempt >= maxAttempts) {
        browser.assert.ok(false, `ルームメンバーのタグ付き投稿を取得できません: ${state.reason || 'unknown'}。`);
        return;
      }
      browser.pause(500, () => waitForTaggedPost(browser, postXpath, tagName, attempt + 1));
    }
  );
};

const useRoomMetadataInPost = (browser, state) => {
  browser
    .waitForElementVisible('[data-testid="timeline-post-button"]', 10000)
    .perform((done) => {
      clickFirstVisible(browser, '[data-testid="timeline-post-button"]', 'ルームメンバーの投稿ダイアログを開く');
      done();
    })
    .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000);

  selectQuickTextInPostDialog(browser, state.quickTextGroupTitle, state.quickTextItemLabel);
  waitForInputValue(browser, '#post_content', state.postText, 'ルームの単語を挿入');
  selectTagInPostDialog(browser, state.tagName, (tagId) => {
    state.tagId = tagId;
  });

  browser.perform(() => {
    if (!state.tagId) {
      browser.assert.ok(false, 'ルームメンバーの投稿送信前に必要なルームタグIDがありません。');
      return;
    }
    clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#edit_post_dialog_title',
      submitSelector: '[data-testid="dialog-edit-post-submit"]',
      expectedControls: [
        { selector: '#post_content', property: 'value', value: state.postText },
        {
          selector: `input[data-tag-id="${state.tagId}"]`,
          property: 'checked',
          value: true,
        },
      ],
      label: 'ルームタグと単語を付けてルームメンバーの投稿を送信',
    });
  });

  waitForDialogClosed(browser, '[data-testid="dialog-edit-post"]', 'ルームメンバーの投稿');
  const postXpath = buildPostXpath(state.postText);
  browser.useXpath().waitForElementVisible(postXpath, 15000).useCss();
  waitForTaggedPost(browser, postXpath, state.tagName);
};

const prepareFloorAndRoomsIfMissing = (browser, state, floorEditor) => {
  loginByForm(browser, floorEditor);
  closeSoundCautionIfVisible(browser);
  browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);

  if (!state.floorId) {
    openFloorListForSetup(browser, 'prepare');
    createFloor(browser, state.floorTitle);
    waitForFloorTitle(browser, state.floorTitle, true);
    findFloorIdByTitle(browser, state.floorTitle, (resolvedFloorId) => {
      state.floorId = resolvedFloorId;
    });
  }

  browser.perform(() => {
    if (!state.floorId) {
      browser.assert.ok(false, 'フロアIDを取得できませんでした。');
      return;
    }

    const needsMemberOnlyRoom = !state.roomId;
    const needsHiddenRoom = !state.hiddenRoomId;
    if (!needsMemberOnlyRoom && !needsHiddenRoom) return;

    openRoomList(browser, state.floorId);

    if (needsMemberOnlyRoom) {
      createRoom(browser, state.roomTitle, { memberOnly: true });
      waitForRoomTitle(browser, state.roomTitle, true);
      findRoomIdByTitle(browser, state.roomTitle, (resolvedRoomId) => {
        state.roomId = resolvedRoomId;
      });
    }

    if (needsHiddenRoom) {
      createRoom(browser, state.hiddenRoomTitle, { hidden: true });
      waitForRoomTitle(browser, state.hiddenRoomTitle, true);
      findRoomIdByTitle(browser, state.hiddenRoomTitle, (resolvedRoomId) => {
        state.hiddenRoomId = resolvedRoomId;
      });
    }
  });
};

const prepareRoomMetadata = (browser, state, floorEditor) => {
  browser.perform(() => {
    if (!state.roomId) {
      browser.assert.ok(false, 'ルームタグ・単語のテストデータ用のルームIDを取得できませんでした。');
      return;
    }
    createScopedTagByApiActor(
      browser,
      {
        actorMail: floorEditor.mail,
        actorPassword: floorEditor.password,
        scope: 'room',
        scopeId: state.roomId,
        name: state.tagName,
        order: 1,
      },
      'ルームメンバー用のルームタグのテストデータ'
    );
    createRoomQuickTextByApiActor(
      browser,
      {
        actorMail: floorEditor.mail,
        actorPassword: floorEditor.password,
        roomId: state.roomId,
        groupTitle: state.quickTextGroupTitle,
        itemLabel: state.quickTextItemLabel,
      },
      'ルームメンバー用のルームの単語のテストデータ'
    );
  });
};

const inviteAndJoinRoomMembership = (browser, state, generalUser) => {
  browser.perform(() => {
    if (!state.floorId || !state.roomId) {
      browser.assert.ok(false, 'ルーム招待用のフロアIDまたはルームIDを取得できませんでした。');
      return;
    }
    state.expectedRoomPath = `/floor/${state.floorId}/room/${state.roomId}`;
    ensureRoomIsMemberOnly(browser, state.floorId, state.roomId);
    openRoomList(browser, state.floorId);
    const inviteButton = `[data-testid="room-invite-member-button-${state.roomId}"]`;
    browser
      .waitForElementVisible(inviteButton, 10000)
      .click(inviteButton)
      .waitForElementVisible('[data-testid="dialog-invite-room-member"]', 10000);
    createInviteUrl(browser, 'room', '8h');
  });

  captureInviteUrl(browser, '[data-testid="dialog-invite-room-member-url"]', 'ルームメンバーの権限', (value) => {
    setInviteUrl(browser, 'room-role-member', value);
  });

  clickFirstVisible(
    browser,
    '[data-testid="dialog-invite-room-member-close-desktop"], [data-testid="dialog-invite-room-member-close-mobile"]',
    'ルーム招待を閉じる'
  );
  browser.waitForElementNotVisible('[data-testid="dialog-invite-room-member"]', 10000);

  logout(browser, state.floorId, state.roomId);

  loginByForm(browser, generalUser);
  closeSoundCautionIfVisible(browser);
  browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
  browser.perform((done) => {
    const target = getInviteUrl(browser, 'room-role-member');
    if (!target) {
      browser.assert.ok(false, 'ルームの招待URLがありません。');
      done();
      return;
    }
    navigateToApp(browser, target);
    done();
  });
  browser.waitForElementVisible('.view', 10000);
  loginIfPresent(browser, generalUser);
  waitForInviteCompletion(browser, state.expectedRoomPath, 'ルームメンバーの権限');
};

module.exports = {
  'ルームメンバーの権限に応じた操作ができる': (browser) => {
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';

    if (!userMail || !userPassword || !editorMail || !editorPassword) {
      browser.assert.ok(false, 'ルームメンバーの権限テストをスキップします。必須の認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const state = {
      floorId: '',
      roomId: '',
      hiddenRoomId: '',
      expectedRoomPath: '',
      floorTitle: `E2E Room Member Floor ${stamp}`,
      roomTitle: `E2E Room Member Room ${stamp}`,
      hiddenRoomTitle: `E2E Room Member Hidden ${stamp}`,
      tagName: `E2E Room Member Tag ${stamp}`,
      quickTextGroupTitle: `E2E Room Member QuickText ${stamp}`,
      quickTextItemLabel: `E2E Room Member Message ${stamp}`,
      postText: `E2E Room Member Message ${stamp}`,
      tagId: '',
    };
    const floorEditor = { mail: editorMail, password: editorPassword };
    const generalUser = { mail: userMail, password: userPassword };

    prepareFloorAndRoomsIfMissing(browser, state, floorEditor);
    prepareRoomMetadata(browser, state, floorEditor);
    inviteAndJoinRoomMembership(browser, state, generalUser);

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'ルームメンバーの権限テストに失敗しました。準備後もフロアIDまたはルームIDがありません。');
        return;
      }
      loginToTimeline(browser, {
        mail: userMail,
        password: userPassword,
        floorId: state.floorId,
        roomId: state.roomId,
        waitForConnected: false,
      });
    });

    closeSoundCautionIfVisible(browser);
    browser.waitForElementVisible('.timeline-page', 20000);
    waitForTimelineConnected(browser, 'ルームメンバー');
    useRoomMetadataInPost(browser, state);

    openAppMenu(browser);
    browser
      .waitForElementVisible('[data-testid="app-menu-profile"]', 10000)
      .waitForElementNotPresent('[data-testid="app-menu-floor-management"]', 10000)
      .waitForElementNotPresent('[data-testid="app-menu-room-management"]', 10000)
      .waitForElementNotPresent('[data-testid="app-menu-user-management"]', 10000);

    assertTimelineRoomMemberControls(browser);

    const base = getBaseUrl(browser).replace(/\/$/, '');
    browser.perform(() => {
      if (!state.floorId) {
        browser.assert.ok(false, 'ルームメンバーの権限テストに失敗しました。検証に必要なフロアIDがありません。');
        return;
      }
      navigateToApp(browser, `${base}/floor/${encodeURIComponent(state.floorId)}`).waitForElementVisible(
        '.room-list',
        10000
      );
    });

    assertElementAbsent(browser, '.view-action', 'ルーム一覧の操作');
    browser.waitForElementNotPresent('[data-testid="room-list-create-button"]', 5000);
    browser.perform(() => {
      if (!state.roomId) {
        browser.assert.ok(false, 'ルームメンバーの権限テストに失敗しました。メンバー操作に必要なルームIDがありません。');
        return;
      }
      assertRoomListMemberControls(browser, state.roomId);
    });

    if (state.hiddenRoomId) {
      browser.perform(() => {
        if (!state.floorId || !state.hiddenRoomId) {
          browser.assert.ok(false, '非表示ルームの検証に失敗しました。floorIdまたはhiddenRoomIdがありません。');
          return;
        }
        navigateToApp(
          browser,
          `${base}/floor/${encodeURIComponent(state.floorId)}/room/${encodeURIComponent(state.hiddenRoomId)}`
        );
      });
      waitForAccessDenied(browser, state.hiddenRoomId, '非表示ルーム');
    }

    browser.end();
  },
};
