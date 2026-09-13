const path = require('path');
const { getBaseUrl, loginToTimeline, navigateToApp, requireEnv } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');
const {
  captureInviteUrl,
  createInviteUrl,
  ensureRoomIsMemberOnly,
  getInviteUrl,
  openRoomList,
  setInviteUrl,
  waitForInviteCompletion,
} = require('../../helpers/invite-ui-helpers');
const {
  clickFirstVisible,
  closeSoundCautionIfVisible,
  createPost,
  loginByForm,
  logoutIfPossible,
  waitForPostTextContains,
} = require('../../helpers/guest-helpers');
const { createImagePost } = require('../../helpers/timeline-media-lifecycle');
const {
  assertDialogKeyboardBehavior,
  clickSingleVisibleAfterExactControls,
  focusAndClickSingleVisible,
} = require('../../helpers/dialog-focus');

const IMAGE_PATH = path.resolve(__dirname, '../../../fixtures/images/sample-image.png');
const EDIT_TAG_MARKER = 'data-e2e-edit-tag';

const getCredentialsOrFail = (browser, label, options) => {
  const mailKey = options && options.mailKey ? options.mailKey : 'E2E_USER_MAIL';
  const passwordKey = options && options.passwordKey ? options.passwordKey : 'E2E_USER_PASSWORD';
  try {
    return {
      mail: requireEnv(mailKey),
      password: requireEnv(passwordKey),
    };
  } catch (error) {
    browser.assert.ok(false, `${label}に失敗しました: ${error.message}`);
    return null;
  }
};

const getEditorCredentialsOrFail = (browser, label) => {
  try {
    return {
      mail: requireEnv('E2E_FLOOR_EDITOR_MAIL'),
      password: requireEnv('E2E_FLOOR_EDITOR_PASSWORD'),
    };
  } catch (error) {
    browser.assert.ok(false, `${label}に失敗しました: ${error.message}`);
    return null;
  }
};

const runWithPreparedFloorRoom = (browser, fixtureLabel, runFlow, prepareOptions = {}) => {
  const editorCredentials = getEditorCredentialsOrFail(browser, 'タイムラインのダイアログの検証');
  if (!editorCredentials) {
    browser.end();
    return;
  }

  const stamp = String(Date.now()).slice(-6);
  const floorTitle = `E2E Timeline Extra Floor ${fixtureLabel} ${stamp}`;
  const roomTitle = `E2E Timeline Extra Room ${fixtureLabel} ${stamp}`;
  const state = prepareFloorRoom(browser, {
    editorMail: editorCredentials.mail,
    editorPassword: editorCredentials.password,
    floorTitle,
    roomTitle,
    logoutAfter: true,
    ...prepareOptions,
  });

  let finished = false;
  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    browser.end();
  };

  browser.perform(() => {
    if (!state.floorId || !state.roomId) {
      browser.assert.ok(false, 'テスト用のフロアIDまたはルームIDを取得できませんでした。');
      finish();
      return;
    }
    runFlow({
      floorId: state.floorId,
      roomId: state.roomId,
      editorCredentials,
      finish,
    });
  });
};

const clickPostActionByText = (browser, text, actionSelector, label) => {
  browser.execute(
    function (payload) {
      const posts = Array.from(document.querySelectorAll('article'));
      const post = posts.find((node) => {
        const content = node.querySelector('.text');
        return content && content.textContent && content.textContent.includes(payload.text);
      });
      if (!post) return { clicked: false, reason: 'post-not-found' };
      const button = post.querySelector(payload.actionSelector);
      if (!button) return { clicked: false, reason: 'action-not-found' };
      button.click();
      return { clicked: true };
    },
    [{ text, actionSelector }],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: 'unknown' };
      browser.assert.ok(state.clicked, `${label}: ${state.reason || 'clicked'}`);
    }
  );
};

const inviteRoomMember = (browser, { floorId, roomId, editorCredentials, userCredentials }) => {
  const expectedRoomPath = `/floor/${floorId}/room/${roomId}`;
  loginToTimeline(browser, {
    mail: editorCredentials.mail,
    password: editorCredentials.password,
    floorId,
    roomId,
    waitForConnected: false,
  });
  closeSoundCautionIfVisible(browser);
  ensureRoomIsMemberOnly(browser, floorId, roomId);

  openRoomList(browser, floorId);
  const inviteButton = `[data-testid="room-invite-member-button-${roomId}"]`;
  browser
    .waitForElementVisible(inviteButton, 10000)
    .click(inviteButton)
    .waitForElementVisible('[data-testid="dialog-invite-room-member"]', 10000);
  createInviteUrl(browser, 'room', '8h');
  captureInviteUrl(browser, '[data-testid="dialog-invite-room-member-url"]', 'ルーム', (value) => {
    setInviteUrl(browser, 'room', value);
  });
  clickFirstVisible(
    browser,
    '[data-testid="dialog-invite-room-member-close-desktop"], [data-testid="dialog-invite-room-member-close-mobile"]',
    'ルーム招待を閉じる'
  );
  browser.waitForElementNotVisible('[data-testid="dialog-invite-room-member"]', 10000);

  logoutIfPossible(browser);
  loginByForm(browser, userCredentials);
  closeSoundCautionIfVisible(browser);
  browser.perform((done) => {
    const inviteUrl = getInviteUrl(browser, 'room');
    browser.assert.ok(!!inviteUrl, 'ルームメンバーのテストデータ用の招待URLを発行しました。');
    if (inviteUrl) navigateToApp(browser, inviteUrl);
    done();
  });
  waitForInviteCompletion(browser, expectedRoomPath, 'ルーム');
  logoutIfPossible(browser);
};

const openGuestTimeline = (browser, { floorId, roomId }, onReady, attempt = 0) => {
  const baseUrl = getBaseUrl(browser);
  const expectedPath = `/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`;
  const timelineUrl = `${baseUrl.replace(/\/$/, '')}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(
    roomId
  )}`;
  if (attempt === 0) navigateToApp(browser, timelineUrl);
  browser.execute(
    function () {
      const visible = (node) => !!(node && (node.offsetParent || node.getClientRects().length));
      return {
        path: window.location.pathname,
        timelineVisible: visible(document.querySelector('.timeline-page')),
        connectedVisible: visible(document.querySelector('[data-testid="timeline-connected"]')),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.path === expectedPath && state.timelineVisible && state.connectedVisible) {
        if (onReady) onReady(true);
        return;
      }
      if (attempt >= 40) {
        if (onReady) onReady(false, state);
        return;
      }
      browser.pause(500, () => openGuestTimeline(browser, { floorId, roomId }, onReady, attempt + 1));
    }
  );
};

const markRoomMemberDeleteOrigin = (browser) => {
  browser.execute(
    function () {
      const visible = (node) => !!(node && (node.offsetParent || node.getClientRects().length));
      const button = Array.from(
        document.querySelectorAll('[data-testid^="dialog-room-member-delete-"]')
      ).find(visible);
      const row = button && button.closest('li');
      if (!button || !row) return { marked: false };

      row.setAttribute('data-e2e-room-member-retained-row', 'true');
      const listRequestCount = performance
        .getEntriesByType('resource')
        .filter((entry) => new URL(entry.name, window.location.origin).pathname === '/api/roommember').length;
      window.__e2eRoomMemberRetention = {
        originTestId: button.getAttribute('data-testid') || '',
        listRequestCount,
      };
      return {
        marked: true,
        testId: window.__e2eRoomMemberRetention.originTestId,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { marked: false, testId: '' };
      browser.assert.ok(state.marked && !!state.testId, 'ルームメンバーの削除元の行を記録しました。');
    }
  );
};

const assertRoomMemberRetentionState = (browser, phase) => {
  browser.execute(
    function (expectedPhase) {
      const parent = document.querySelector('[data-testid="dialog-room-member"]');
      const child = document.querySelector('[data-testid="dialog-delete-room-member"]');
      const parentPanel = parent && parent.querySelector('.ui-dialog__panel');
      const childPanel = child && child.querySelector('.ui-dialog__panel');
      const retainedRow = parent && parent.querySelector('[data-e2e-room-member-retained-row="true"]');
      const retention = window.__e2eRoomMemberRetention || {};
      const origin = retention.originTestId
        ? document.querySelector(`[data-testid="${retention.originTestId}"]`)
        : null;
      const heading = document.getElementById('room_member_dialog_title');
      const listRequestCount = performance
        .getEntriesByType('resource')
        .filter((entry) => new URL(entry.name, window.location.origin).pathname === '/api/roommember').length;
      const isVisible = (node) =>
        !!(
          node &&
          window.getComputedStyle(node).display !== 'none' &&
          window.getComputedStyle(node).visibility !== 'hidden'
        );
      return {
        phase: expectedPhase,
        parentVisible: isVisible(parent),
        childVisible: isVisible(child),
        retainedRow: !!retainedRow,
        parentIsBackground:
          !!parentPanel && parentPanel.hasAttribute('inert') && parentPanel.getAttribute('aria-hidden') === 'true',
        parentIsTop:
          !!parentPanel && !parentPanel.hasAttribute('inert') && parentPanel.getAttribute('aria-hidden') !== 'true',
        childIsTop:
          !!childPanel && !childPanel.hasAttribute('inert') && childPanel.getAttribute('aria-hidden') !== 'true',
        zOrder:
          !!parent &&
          !!child &&
          Number(window.getComputedStyle(child).zIndex || 0) > Number(window.getComputedStyle(parent).zIndex || 0),
        focusRestored: !!origin && document.activeElement === origin,
        focusMovedToHeading: !!heading && document.activeElement === heading,
        originExists: !!origin,
        additionalListRequests: listRequestCount - Number(retention.listRequestCount || 0),
      };
    },
    [phase],
    (result) => {
      const state = result && result.value ? result.value : {};
      browser.assert.ok(state.parentVisible, `ルームメンバーの親ダイアログが引き続き表示されています（${phase}）。`);
      if (phase === 'stacked') {
        browser.assert.ok(state.childVisible, 'ルームメンバーの削除ダイアログが表示されています。');
        browser.assert.ok(state.retainedRow, '削除ダイアログの表示中もルームメンバーの親の行が残っています。');
        browser.assert.ok(state.parentIsBackground, 'ルームメンバーの親ダイアログが操作できない背景として残っています。');
        browser.assert.ok(state.childIsTop && state.zOrder, 'ルームメンバーの削除ダイアログが操作中の最前面です。');
      } else {
        browser.assert.ok(state.parentIsTop, `ルームメンバーの親ダイアログが最前面に戻ります（${phase}）。`);
        browser.assert.equal(state.additionalListRequests, 0, `ルームメンバー一覧を再取得していません（${phase}）。`);
        if (phase === 'cancelled') {
          browser.assert.ok(state.retainedRow, '削除をキャンセルすると、同じルームメンバーの行のDOMへ戻ります。');
          browser.assert.ok(state.focusRestored, '削除をキャンセルすると、元の削除ボタンへフォーカスが戻ります。');
        } else {
          browser.assert.ok(!state.originExists && !state.retainedRow, '削除したルームメンバーの行がなくなります。');
          browser.assert.ok(state.focusMovedToHeading, '唯一のルームメンバーを削除すると、一覧の見出しへフォーカスが移ります。');
        }
      }
    }
  );
};

const createRoomTagFixture = (browser, credentials, roomId, tagName) => {
  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin', status: 0 });
        return;
      }
      const requestJson = (path, options) =>
        fetch(path, options).then(async (response) => ({
          status: response.status,
          body: await response.json().catch(() => null),
        }));

      requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload.credentials),
      })
        .then((loginResult) => {
          const token = loginResult.body && loginResult.body.token ? String(loginResult.body.token) : '';
          if (loginResult.status !== 200 || !token) {
            return { ok: false, stage: 'login', status: loginResult.status };
          }
          return requestJson('/api/roomtag/create', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ room_id: payload.roomId, order: 1, name: payload.tagName, lang: 'ja' }),
          }).then((tagResult) => ({
            ok: tagResult.status >= 200 && tagResult.status < 300 && !!(tagResult.body && tagResult.body._id),
            stage: 'create',
            status: tagResult.status,
          }));
        })
        .then(done)
        .catch(() => done({ ok: false, stage: 'request', status: 0 }));
    },
    [{ credentials, roomId, tagName }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result', status: 0 };
      browser.assert.ok(
        state.ok,
        `タグ編集用のテストデータを作成しました（stage=${state.stage || 'unknown'}, status=${state.status || 0}）`
      );
    }
  );
};

const toggleEditTagByName = (browser, tagName) => {
  browser.execute(
    function (payload) {
      const dialogs = Array.from(document.querySelectorAll('[data-testid="dialog-edit-tag"]')).filter(
        (node) => node.offsetParent || node.getClientRects().length
      );
      if (dialogs.length !== 1) return { toggled: false, reason: `dialog-count:${dialogs.length}` };
      dialogs[0].querySelectorAll(`[${payload.marker}]`).forEach((node) => node.removeAttribute(payload.marker));
      const labels = Array.from(dialogs[0].querySelectorAll('.checkbox-label')).filter(
        (node) =>
          node.textContent &&
          node.textContent.trim() === payload.tagName &&
          (node.offsetParent || node.getClientRects().length)
      );
      if (labels.length !== 1) return { toggled: false, reason: `label-count:${labels.length}` };
      const checkboxId = labels[0].getAttribute('for') || '';
      const checkbox = checkboxId ? dialogs[0].querySelector(`#${CSS.escape(checkboxId)}`) : null;
      if (!checkbox || checkbox.disabled || checkbox.getAttribute('aria-disabled') === 'true') {
        return { toggled: false, reason: 'checkbox-unavailable' };
      }
      if (checkbox.checked || !String(checkbox.value || '').trim()) {
        return { toggled: false, reason: 'fixture-control-mismatch' };
      }
      checkbox.click();
      checkbox.setAttribute(payload.marker, 'true');
      return { toggled: true, checked: checkbox.checked, tagId: String(checkbox.value || '') };
    },
    [{ marker: EDIT_TAG_MARKER, tagName }],
    (result) => {
      const state = result && result.value ? result.value : { toggled: false, reason: 'execute-failed' };
      browser.assert.ok(
        state.toggled && state.checked === true && !!state.tagId,
        `専用のルームタグを選択しました: ${tagName}（${state.reason || 'checked'}）`
      );
    }
  );
};

module.exports = {
  'タイムラインのダイアログからルームメンバーを削除できる': (browser) => {
    const adminCredentials = getCredentialsOrFail(browser, 'ルームメンバーの削除操作', {
      mailKey: 'E2E_ADMIN_MAIL',
      passwordKey: 'E2E_ADMIN_PASSWORD',
    });
    const userCredentials = getCredentialsOrFail(browser, 'ルームメンバーの削除操作', {
      mailKey: 'E2E_USER_MAIL',
      passwordKey: 'E2E_USER_PASSWORD',
    });
    if (!adminCredentials || !userCredentials) {
      browser.end();
      return;
    }
    const { mail, password } = adminCredentials;

    runWithPreparedFloorRoom(
      browser,
      'Room member delete path',
      ({ floorId, roomId, editorCredentials, finish }) => {
        inviteRoomMember(browser, {
          floorId,
          roomId,
          editorCredentials,
          userCredentials,
        });
        loginToTimeline(browser, { mail, password, floorId, roomId });

        openRoomList(browser, floorId);
        const memberListButton = `[data-testid="room-member-list-button-${roomId}"]`;
        browser.waitForElementVisible(memberListButton, 10000);
        focusAndClickSingleVisible(browser, memberListButton, 'ルームメンバーのダイアログを開く');
        browser.waitForElementVisible('[data-testid="dialog-room-member"]', 10000);
        assertDialogKeyboardBehavior(browser, '[data-testid="dialog-room-member"]', 'ルームメンバーのダイアログ', {
          returnFocusSelector: memberListButton,
        });

        browser.waitForElementVisible(memberListButton, 10000);
        clickFirstVisible(browser, memberListButton, 'ルームメンバーのダイアログを再度開く');
        browser.waitForElementVisible('[data-testid="dialog-room-member"]', 10000);
        markRoomMemberDeleteOrigin(browser);
        focusAndClickSingleVisible(
          browser,
          '[data-testid^="dialog-room-member-delete-"]',
          'ルームメンバーの削除ダイアログを開く'
        );
        browser.waitForElementVisible('[data-testid="dialog-delete-room-member"]', 10000);
        browser.waitForElementPresent(
          '[data-testid="dialog-room-member"] .ui-dialog__panel[inert][aria-hidden="true"]',
          10000
        );
        assertRoomMemberRetentionState(browser, 'stacked');
        clickFirstVisible(
          browser,
          '[data-testid="dialog-delete-room-member-cancel-desktop"]',
          'ルームメンバーの削除をキャンセル'
        );
        browser.waitForElementNotVisible('[data-testid="dialog-delete-room-member"]', 10000);
        browser.waitForElementNotPresent('[data-testid="dialog-room-member"] .ui-dialog__panel[inert]', 10000);
        assertRoomMemberRetentionState(browser, 'cancelled');

        focusAndClickSingleVisible(
          browser,
          '[data-testid^="dialog-room-member-delete-"]',
          'ルームメンバーの削除ダイアログを再度開く'
        );
        browser.waitForElementVisible('[data-testid="dialog-delete-room-member"]', 10000);
        clickFirstVisible(
          browser,
          '[data-testid="dialog-delete-room-member-confirm-desktop"]',
          'ルームメンバーの削除を確定'
        );
        browser.waitForElementNotVisible('[data-testid="dialog-delete-room-member"]', 10000);
        browser.waitForElementNotPresent('[data-testid="dialog-room-member"] .ui-dialog__panel[inert]', 10000);
        browser.waitForElementNotPresent('[data-testid^="dialog-room-member-delete-"]', 10000);
        assertRoomMemberRetentionState(browser, 'deleted');

        browser.waitForElementVisible('[data-testid="dialog-room-member-close-desktop"]', 10000);
        clickFirstVisible(browser, '[data-testid="dialog-room-member-close-desktop"]', 'ルームメンバーのダイアログを閉じる');
        browser.waitForElementNotVisible('[data-testid="dialog-room-member"]', 10000);
        browser.perform(() => finish());
      },
      {
        roomOptions: { memberOnly: true },
      }
    );
  },

  'タイムラインのタグ編集ダイアログで更新できる': (browser) => {
    const adminCredentials = getCredentialsOrFail(browser, 'タグ編集ダイアログで更新', {
      mailKey: 'E2E_ADMIN_MAIL',
      passwordKey: 'E2E_ADMIN_PASSWORD',
    });
    const userCredentials = getCredentialsOrFail(browser, 'タグ編集ダイアログで更新', {
      mailKey: 'E2E_USER_MAIL',
      passwordKey: 'E2E_USER_PASSWORD',
    });
    if (!adminCredentials || !userCredentials) {
      browser.end();
      return;
    }
    const { mail, password } = adminCredentials;

    runWithPreparedFloorRoom(browser, 'Edit tag dialog update', ({ floorId, roomId, editorCredentials, finish }) => {
      const postText = `E2E Timeline Extra Tag Post ${Date.now()}`;
      const tagName = `E2E Timeline Extra Tag ${String(Date.now()).slice(-8)}`;
      createRoomTagFixture(browser, editorCredentials, roomId, tagName);
      loginToTimeline(browser, {
        mail: userCredentials.mail,
        password: userCredentials.password,
        floorId,
        roomId,
      });
      closeSoundCautionIfVisible(browser);
      createPost(browser, postText);
      logoutIfPossible(browser);
      loginToTimeline(browser, { mail, password, floorId, roomId });
      waitForPostTextContains(browser, postText);

      browser.perform(() => {
        clickPostActionByText(browser, postText, '[data-testid="timeline-post-tag-button"]', 'タグの編集ボタンをクリック');
        browser.waitForElementVisible('[data-testid="dialog-edit-tag"]', 10000);

        toggleEditTagByName(browser, tagName);
        clickSingleVisibleAfterExactControls(browser, {
          anchorSelector: '#edit_tag_dialog_title',
          submitSelector:
            '[data-testid="dialog-edit-tag-submit-desktop"], [data-testid="dialog-edit-tag-submit-mobile"]',
          expectedControls: [
            { selector: `[${EDIT_TAG_MARKER}="true"]`, property: 'checked', value: true },
            { selector: `[${EDIT_TAG_MARKER}="true"]`, property: 'nonEmptyValue', value: true },
          ],
          label: 'タグの編集内容を送信',
        });
        browser.waitForElementNotVisible('[data-testid="dialog-edit-tag"]', 10000);
        finish();
      });
    });
  },

  'タイムラインのギャラリーダイアログを開閉できる': (browser) => {
    const adminCredentials = getCredentialsOrFail(browser, 'ギャラリーダイアログを開閉', {
      mailKey: 'E2E_ADMIN_MAIL',
      passwordKey: 'E2E_ADMIN_PASSWORD',
    });
    if (!adminCredentials) {
      browser.end();
      return;
    }
    const { mail, password } = adminCredentials;

    runWithPreparedFloorRoom(browser, 'Gallery dialog open/close', ({ floorId, roomId, finish }) => {
      const postText = `E2E Timeline Extra Gallery Post ${Date.now()}`;
      loginToTimeline(browser, { mail, password, floorId, roomId });
      closeSoundCautionIfVisible(browser);
      createImagePost(browser, {
        text: postText,
        imagePath: IMAGE_PATH,
        caption: 'E2E Timeline Extra Gallery image',
      });

      browser.perform(() => {
        clickPostActionByText(
          browser,
          postText,
          '[data-testid^="timeline-post-gallery-image-button-"]',
          'ギャラリー画像のボタンをクリック'
        );
        browser
          .waitForElementVisible('[data-testid="dialog-gallery"]', 10000)
          .waitForElementVisible('[data-testid="dialog-gallery-close"]', 10000)
          .click('[data-testid="dialog-gallery-close"]')
          .waitForElementNotVisible('[data-testid="dialog-gallery"]', 10000);
        finish();
      });
    });
  },

  'ゲストの利用ルールにダイアログで同意できる': (browser) => {
    runWithPreparedFloorRoom(browser, 'Guest rules dialog agree', ({ floorId, roomId, finish }) => {
      openGuestTimeline(browser, { floorId, roomId }, (isTimelineReady) => {
        if (!isTimelineReady) {
          browser.assert.ok(false, 'ゲストの利用ルールの検証に失敗しました。対象ルームのゲストのタイムラインを利用できません。');
          finish();
          return;
        }
        browser.elements('css selector', '[data-testid="timeline-post-button"]', (result) => {
          const hasButton = result && Array.isArray(result.value) && result.value.length > 0;
          if (!hasButton) {
            browser.assert.ok(false, 'ゲストの利用ルールの検証に失敗しました。投稿ボタンを利用できません。');
            finish();
            return;
          }
          browser
            .click('[data-testid="timeline-post-button"]')
            .waitForElementVisible('[data-testid="dialog-guest-rules"]', 10000);
          clickSingleVisibleAfterExactControls(browser, {
            anchorSelector: '#guest_rules_dialog_title',
            submitSelector: '[data-testid="dialog-guest-rules-confirm"]',
            expectedControls: [],
            label: 'ゲストの利用ルールに同意',
          });
          browser.waitForElementNotVisible('[data-testid="dialog-guest-rules"]', 10000);
          finish();
        });
      });
    });
  },

  'キックのダイアログを開き、取り消せる': (browser) => {
    const adminCredentials = getCredentialsOrFail(browser, 'ユーザのキックダイアログを開いてキャンセル', {
      mailKey: 'E2E_ADMIN_MAIL',
      passwordKey: 'E2E_ADMIN_PASSWORD',
    });
    const userCredentials = getCredentialsOrFail(browser, 'ユーザのキックダイアログを開いてキャンセル', {
      mailKey: 'E2E_USER_MAIL',
      passwordKey: 'E2E_USER_PASSWORD',
    });
    if (!adminCredentials || !userCredentials) {
      browser.end();
      return;
    }
    const { mail, password } = adminCredentials;

    runWithPreparedFloorRoom(browser, 'Kick user dialog open/cancel', ({ floorId, roomId, finish }) => {
      const postText = `E2E Timeline Extra Kick Post ${Date.now()}`;
      loginToTimeline(browser, {
        mail: userCredentials.mail,
        password: userCredentials.password,
        floorId,
        roomId,
      });
      closeSoundCautionIfVisible(browser);
      createPost(browser, postText);
      logoutIfPossible(browser);
      loginToTimeline(browser, { mail, password, floorId, roomId });
      waitForPostTextContains(browser, postText);

      browser.perform(() => {
        clickPostActionByText(
          browser,
          postText,
          '[data-testid^="timeline-post-kick-button-"]',
          'ユーザのキックボタンをクリック'
        );
        browser
          .waitForElementVisible('[data-testid="dialog-edit-kicked-user"]', 10000)
          .waitForElementVisible('[data-testid="dialog-edit-kicked-user-cancel-desktop"]', 10000)
          .click('[data-testid="dialog-edit-kicked-user-cancel-desktop"]')
          .waitForElementNotVisible('[data-testid="dialog-edit-kicked-user"]', 10000);
        finish();
      });
    });
  },
};
