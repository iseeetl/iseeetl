// 実際のGoogle Analyticsには接続せず、ダミータグとブラウザ内のdataLayerを検証する。
const {
  advanceAnalyticsDataLayerCheckpoint,
  assertAnalyticsNetworkSummary,
  assertAnalyticsTagState,
  assertNoAnalyticsDataLayerDelta,
  createDataLayerCheckpoint,
  finalizeAnalyticsCdpGuardWithBrowserClose,
  installAnalyticsCdpGuard,
  waitForAnalyticsDataLayer,
} = require('../../helpers/analytics-cdp');
const {
  clickLikeReaction,
  clickFirstVisible,
  logoutIfPossible,
  openReactionPickerForPost,
  waitForTimelineReady,
} = require('../../helpers/guest-helpers');
const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { createScopedTagByApiActor } = require('../../helpers/management-tag-fixture');
const { loginByForm } = require('../../helpers/session-helpers');
const {
  prepareTimelineRoom,
  toggleReactionByExisting,
  waitForDialogClosed,
  waitForPostVisibleByText,
  waitForReactionCount,
} = require('../../helpers/timeline-helpers');
const { clickSingleVisibleAfterExactControls } = require('../../helpers/dialog-focus');

const state = {
  guard: null,
  expectedNetwork: {
    dummyTagRequestCount: 0,
    configRequestCount: 0,
    identityRequestCount: 0,
  },
};
const checkpoint = createDataLayerCheckpoint();
const HELP_ROUTE_CONTENT_SELECTOR =
  '#app_content > .view > .view-content > [data-testid="help-content"]';
const clearConfig = (pageGroup, visitorType, { update = true } = {}) => ({
  update,
  resourceState: 'clear',
  parameters: { page_group: pageGroup, visitor_type: visitorType },
});
const floorConfig = (floorId, floorTitle) => ({
  update: true,
  resourceState: 'floor',
  parameters: {
    page_group: 'room_list',
    floor_id: String(floorId).toLowerCase(),
    floor_title: floorTitle,
    visitor_type: 'registered',
  },
});
const roomConfig = (floorId, floorTitle, roomId, roomTitle) => ({
  update: true,
  resourceState: 'room',
  parameters: {
    page_group: 'timeline',
    floor_id: String(floorId).toLowerCase(),
    floor_title: floorTitle,
    room_id: String(roomId).toLowerCase(),
    room_title: roomTitle,
    visitor_type: 'registered',
  },
});

const createRoomQuickTextByApiActor = (
  browser,
  { actorMail, actorPassword, roomId, groupTitle, itemLabel },
  label
) => {
  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin' });
        return;
      }
      const origin = window.location.origin;
      const objectIdPattern = /^[a-f0-9]{24}$/i;
      const requestJson = function (path, options) {
        return fetch(`${origin}${path}`, options).then(function (response) {
          return response
            .json()
            .catch(function () {
              return null;
            })
            .then(function (body) {
              return { status: response.status, body };
            });
        });
      };

      requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mail: payload.actorMail, password: payload.actorPassword }),
      })
        .then(function (loginResult) {
          const token = loginResult.body && loginResult.body.token
            ? String(loginResult.body.token)
            : '';
          if (loginResult.status !== 200 || !token) {
            done({ ok: false, stage: 'login', loginStatus: loginResult.status });
            return null;
          }
          const headers = {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          };
          return requestJson(`/api/rooms/${payload.roomId}/quick-text/groups`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: payload.groupTitle, lang: 'ja' }),
          }).then(function (groupResult) {
            const groupId = groupResult.body && objectIdPattern.test(String(groupResult.body._id || ''))
              ? String(groupResult.body._id)
              : '';
            if (groupResult.status < 200 || groupResult.status >= 300 || !groupId) {
              done({
                ok: false,
                stage: 'group',
                loginStatus: loginResult.status,
                groupStatus: groupResult.status,
              });
              return null;
            }
            return requestJson(
              `/api/rooms/${payload.roomId}/quick-text/groups/${groupId}/items`,
              {
                method: 'POST',
                headers,
                body: JSON.stringify({ label: payload.itemLabel, lang: 'ja' }),
              }
            ).then(function (itemResult) {
              const validItem =
                itemResult.body && objectIdPattern.test(String(itemResult.body._id || ''));
              done({
                ok: itemResult.status >= 200 && itemResult.status < 300 && validItem,
                stage: 'item',
                loginStatus: loginResult.status,
                groupStatus: groupResult.status,
                itemStatus: itemResult.status,
              });
              return null;
            });
          });
        })
        .catch(function () {
          done({ ok: false, stage: 'request' });
        });
    },
    [{ actorMail, actorPassword, roomId, groupTitle, itemLabel }],
    (result) => {
      const fixtureState = result?.value || { ok: false, stage: 'no-result' };
      browser.assert.ok(
        fixtureState.ok,
        `${label}: 製品APIで単語を作成しました（stage=${fixtureState.stage || 'unknown'}, login=${
          fixtureState.loginStatus || 0
        }, group=${fixtureState.groupStatus || 0}, item=${fixtureState.itemStatus || 0}）。`
      );
    }
  );
};

const clickQuickTextItem = (browser, itemLabel, label, attempt = 0) => {
  browser.execute(
    function (expectedLabel) {
      const dialog = document.querySelector('[data-testid="dialog-edit-post"]');
      if (!dialog) return { clicked: false, reason: 'dialog-not-found' };
      const buttons = Array.from(dialog.querySelectorAll('.template-button')).filter(
        (button) =>
          (button.offsetParent || button.getClientRects().length) &&
          button.textContent &&
          button.textContent.trim() === expectedLabel
      );
      if (buttons.length !== 1) {
        return { clicked: false, reason: `button-count:${buttons.length}` };
      }
      buttons[0].click();
      return { clicked: true };
    },
    [itemLabel],
    (result) => {
      const clicked = result?.value?.clicked === true;
      if (clicked) {
        browser.assert.ok(true, `${label}: 単語の項目をクリックしました。`);
        return;
      }
      if (attempt >= 20) {
        browser.assert.ok(false, `${label}: 単語の項目が操作可能になりませんでした。`);
        return;
      }
      browser.pause(250, () => clickQuickTextItem(browser, itemLabel, label, attempt + 1));
    }
  );
};

const selectTagByName = (browser, tagName, label) => {
  browser.execute(
    function (expectedName) {
      const dialog = document.querySelector('[data-testid="dialog-edit-post"]');
      const groups = dialog ? Array.from(dialog.querySelectorAll('.checkbox-group')) : [];
      const matches = groups.filter((group) => {
        const tagLabel = group.querySelector('label.checkbox-label');
        return tagLabel && tagLabel.textContent && tagLabel.textContent.trim() === expectedName;
      });
      if (matches.length !== 1) return { selected: false, matchCount: matches.length };
      const checkbox = matches[0].querySelector('input[type="checkbox"]');
      if (!checkbox) return { selected: false, matchCount: matches.length };
      if (!checkbox.checked) checkbox.click();
      return { selected: checkbox.checked, matchCount: matches.length };
    },
    [tagName],
    (result) => {
      const selected = result?.value?.selected === true;
      const matchCount = Number(result?.value?.matchCount || 0);
      browser.assert.ok(selected && matchCount === 1, `${label}: 指定した名前のタグを1件だけ選択しました。`);
    }
  );
};

module.exports = {
  '@tags': ['analytics'],

  before(browser, done) {
    checkpoint.index = 0;
    state.expectedNetwork = {
      dummyTagRequestCount: 0,
      configRequestCount: 0,
      identityRequestCount: 0,
    };
    installAnalyticsCdpGuard(browser).then(
      (guard) => {
        state.guard = guard;
        done();
      },
      () => done(new Error('アナリティクス検証用のCDP通信監視を準備できませんでした。'))
    );
  },

  after(browser, done) {
    finalizeAnalyticsCdpGuardWithBrowserClose(
      browser,
      state.guard,
      state.expectedNetwork,
      'タイムラインのアナリティクス検証の終了時の通信確認',
      done
    );
  },

  '投稿・タグ・単語・リアクションの計測イベントを送信する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';
    const adminMail = process.env.E2E_ADMIN_MAIL || '';
    const adminPassword = process.env.E2E_ADMIN_PASSWORD || '';
    if (
      !editorMail ||
      !editorPassword ||
      !userMail ||
      !userPassword ||
      !adminMail ||
      !adminPassword
    ) {
      browser.assert.ok(
        false,
        'タイムラインのアナリティクスのE2Eには、Git管理されたフロア編集ユーザ・投稿者・管理者アカウントが必要です。'
      );
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Analytics Floor ${stamp}`;
    const roomTitle = `E2E Analytics Room ${stamp}`;
    const tagName = `E2E Analytics Tag ${stamp}`;
    const quickTextGroup = `E2E Analytics Group ${stamp}`;
    const quickTextLabel = `E2E Analytics Phrase ${stamp}`;
    const privatePostBody = `E2E private post body ${stamp}`;
    const postText = `${privatePostBody}${quickTextLabel}`;
    const baseUrl = getBaseUrl(browser).replace(/\/$/, '');

    browser
      .url(`${baseUrl}/login?source=e2e#ignored-fragment`)
      .waitForElementVisible('#mail', 10000);
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 1,
        expectedConfigCount: 2,
        expectedIdentitySequence: ['guest'],
        historyIdentitySequence: ['guest'],
        configs: [
          clearConfig('login', 'guest', { update: false }),
          clearConfig('login', 'guest'),
        ],
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: {
              page_group: 'login',
              floor_id: null,
              floor_title: null,
              room_id: null,
              room_title: null,
              visitor_type: 'guest',
            },
          },
        ],
      },
      'タイムラインのE2E開始時のゲストのページビュー'
    );
    assertAnalyticsTagState(browser, true);
    browser.perform(() => {
      state.expectedNetwork.dummyTagRequestCount = 1;
      state.expectedNetwork.configRequestCount = 1;
    });

    const roomState = prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
      targetLangs: [],
    });
    advanceAnalyticsDataLayerCheckpoint(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        maximumRegisteredUserIdVariants: 2,
        events: [
          {
            name: 'timeline_view',
            count: 1,
            parameters: {
              floor_title: floorTitle,
              room_title: roomTitle,
              visitor_type: 'registered',
            },
            patterns: {
              floor_id: '^[a-f0-9]{24}$',
              room_id: '^[a-f0-9]{24}$',
            },
          },
        ],
      },
      'タイムラインのアナリティクス用履歴の安全性確認'
    );
    browser.perform(() => {
      state.expectedNetwork.identityRequestCount = 2;
    });
    assertAnalyticsNetworkSummary(
      browser,
      state.guard,
      { identityRequestCount: 2, unexpectedIdentityRequestCount: 0 },
      'タイムラインでのユーザ識別情報の要求'
    );

    browser.perform(() => {
      if (!roomState.floorId || !roomState.roomId) {
        browser.assert.ok(false, 'アナリティクス検証用のタイムラインのデータIDを取得できませんでした。');
        return;
      }
      createScopedTagByApiActor(
        browser,
        {
          actorMail: editorMail,
          actorPassword: editorPassword,
          scope: 'room',
          scopeId: roomState.roomId,
          name: tagName,
        },
        'アナリティクス検証用のルームタグ'
      );
      createRoomQuickTextByApiActor(
        browser,
        {
          actorMail: editorMail,
          actorPassword: editorPassword,
          roomId: roomState.roomId,
          groupTitle: quickTextGroup,
          itemLabel: quickTextLabel,
        },
        'アナリティクス検証用のルームの単語'
      );
    });

    browser.perform(() => {
      navigateToApp(browser, `${baseUrl}/floor/${encodeURIComponent(roomState.floorId)}`);
      browser.waitForElementVisible('.room-list', 20000);
      waitForAnalyticsDataLayer(
        browser,
        checkpoint,
        {
          expectedJsCount: 0,
          expectedConfigCount: 1,
          expectedIdentitySequence: ['registered'],
          maximumRegisteredUserIdVariants: 2,
          configs: [floorConfig(roomState.floorId, floorTitle)],
          events: [
            {
              name: 'page_view',
              count: 1,
              parameters: {
                page_group: 'room_list',
                floor_id: String(roomState.floorId).toLowerCase(),
                floor_title: floorTitle,
                room_id: null,
                room_title: null,
                visitor_type: 'registered',
              },
            },
          ],
        },
        'タイムラインのリソース再読み込み前のルーム一覧ページ'
      );
      navigateToApp(
        browser,
        `${baseUrl}/floor/${encodeURIComponent(roomState.floorId)}/room/${encodeURIComponent(
          roomState.roomId
        )}`
      );
      browser.waitForElementVisible('.timeline-page', 20000);
      waitForTimelineReady(browser);
      waitForAnalyticsDataLayer(
        browser,
        checkpoint,
        {
          expectedJsCount: 0,
          expectedConfigCount: 1,
          expectedIdentitySequence: ['registered'],
          maximumRegisteredUserIdVariants: 2,
          configs: [roomConfig(roomState.floorId, floorTitle, roomState.roomId, roomTitle)],
          events: [
            {
              name: 'page_view',
              count: 1,
              parameters: {
                page_group: 'timeline',
                floor_id: String(roomState.floorId).toLowerCase(),
                floor_title: floorTitle,
                room_id: String(roomState.roomId).toLowerCase(),
                room_title: roomTitle,
                visitor_type: 'registered',
              },
            },
            {
              name: 'timeline_view',
              count: 1,
              parameters: {
                floor_id: String(roomState.floorId).toLowerCase(),
                floor_title: floorTitle,
                room_id: String(roomState.roomId).toLowerCase(),
                room_title: roomTitle,
                visitor_type: 'registered',
              },
            },
          ],
        },
        '再読み込みしたタイムラインのページとコンテキストのイベントの確認'
      );
    });

    clickFirstVisible(browser, '[data-testid="timeline-post-button"]', 'アナリティクス検証用の投稿画面を開く');
    browser
      .waitForElementVisible('[data-testid="dialog-edit-post"]', 10000)
      .clearValue('#post_content')
      .setValue('#post_content', privatePostBody);
    clickQuickTextItem(browser, quickTextLabel, 'アナリティクス検証用の単語');
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 0,
        expectedIdentitySequence: [],
        maximumRegisteredUserIdVariants: 2,
        forbiddenFragments: [privatePostBody],
        events: [
          {
            name: 'timeline_quick_text_use',
            count: 1,
            parameters: {
              floor_title: floorTitle,
              room_title: roomTitle,
              content_type: 'post',
              quick_text_label: quickTextLabel,
              visitor_type: 'registered',
            },
            patterns: {
              floor_id: '^[a-f0-9]{24}$',
              room_id: '^[a-f0-9]{24}$',
              quick_text_id: '^quick_[a-f0-9]{24}$',
            },
          },
        ],
      },
      '単語のラベルとIDのイベント'
    );
    selectTagByName(browser, tagName, 'アナリティクス検証用のタグ');
    clickSingleVisibleAfterExactControls(browser, {
      anchorSelector: '#edit_post_dialog_title',
      submitSelector: '[data-testid="dialog-edit-post-submit"]',
      expectedControls: [{ selector: '#post_content', property: 'value', value: postText }],
      label: 'タグと単語を付けてアナリティクス検証用の投稿を送信',
    });
    waitForDialogClosed(browser, '[data-testid="dialog-edit-post"]', 'アナリティクス検証用の投稿');
    waitForPostVisibleByText(browser, postText, 'アナリティクス検証用の投稿');
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 0,
        expectedIdentitySequence: [],
        maximumRegisteredUserIdVariants: 2,
        forbiddenFragments: [privatePostBody, postText],
        events: [
          {
            name: 'timeline_content_change',
            count: 1,
            parameters: {
              floor_title: floorTitle,
              room_title: roomTitle,
              content_type: 'post',
              action_type: 'create',
              presentation_type: 'static',
              visitor_type: 'registered',
            },
            patterns: {
              floor_id: '^[a-f0-9]{24}$',
              room_id: '^[a-f0-9]{24}$',
            },
          },
          {
            name: 'timeline_tag_change',
            count: 1,
            parameters: {
              floor_title: floorTitle,
              room_title: roomTitle,
              content_type: 'post',
              tag_action: 'add',
              tag_name: tagName,
              visitor_type: 'registered',
            },
            patterns: {
              floor_id: '^[a-f0-9]{24}$',
              room_id: '^[a-f0-9]{24}$',
              tag_id: '^tag_[a-f0-9]{24}$',
            },
          },
        ],
      },
      '投稿作成とタグ名のイベント'
    );

    openReactionPickerForPost(browser, postText);
    clickLikeReaction(browser);
    waitForReactionCount(browser, postText, 1, 'アナリティクス検証用のリアクション追加');
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 0,
        expectedIdentitySequence: [],
        maximumRegisteredUserIdVariants: 2,
        forbiddenFragments: [postText],
        events: [
          {
            name: 'timeline_reaction_change',
            count: 1,
            parameters: {
              floor_title: floorTitle,
              room_title: roomTitle,
              content_type: 'post',
              reaction_action: 'add',
              reaction_type: 'いいね',
              visitor_type: 'registered',
            },
          },
        ],
      },
      'リアクション追加イベントの確認'
    );

    toggleReactionByExisting(browser, postText);
    waitForReactionCount(browser, postText, 0, 'アナリティクス検証用のリアクション削除');
    waitForAnalyticsDataLayer(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        expectedConfigCount: 0,
        expectedIdentitySequence: [],
        maximumRegisteredUserIdVariants: 2,
        forbiddenFragments: [postText],
        events: [
          {
            name: 'timeline_reaction_change',
            count: 1,
            parameters: {
              floor_title: floorTitle,
              room_title: roomTitle,
              content_type: 'post',
              reaction_action: 'remove',
              reaction_type: 'いいね',
              visitor_type: 'registered',
            },
          },
        ],
      },
      'リアクション削除イベントの確認'
    );

    logoutIfPossible(browser);
    loginByForm(browser, { mail: adminMail, password: adminPassword });
    advanceAnalyticsDataLayerCheckpoint(
      browser,
      checkpoint,
      {
        expectedJsCount: 0,
        maximumRegisteredUserIdVariants: 3,
        events: [
          {
            name: 'page_view',
            count: 1,
            parameters: {
              page_group: 'floor_list',
              floor_id: null,
              floor_title: null,
              room_id: null,
              room_title: null,
              visitor_type: 'registered',
            },
          },
        ],
      },
      '管理者への切り替え時のアナリティクスの安全性確認'
    );
    browser.perform(() => {
      state.expectedNetwork.identityRequestCount = 3;
    });
    navigateToApp(browser, `${baseUrl}/management/floor`);
    browser.waitForElementVisible('table.floor-management-table', 20000);
    assertNoAnalyticsDataLayerDelta(browser, checkpoint, '管理画面をpage_viewの対象から除外');
    navigateToApp(browser, `${baseUrl}/help`);
    browser
      .waitForElementPresent(HELP_ROUTE_CONTENT_SELECTOR, 10000)
      .assert.urlEquals(`${baseUrl}/help`)
      .pause(250);
    assertNoAnalyticsDataLayerDelta(browser, checkpoint, 'ヘルプ画面をpage_viewの対象から除外');

    assertAnalyticsTagState(browser, true);
    assertAnalyticsNetworkSummary(
      browser,
      state.guard,
      {
        dummyTagRequestCount: 1,
        unexpectedTagRequestCount: 0,
        collectionRequestCount: 0,
        configRequestCount: 1,
        unexpectedConfigRequestCount: 0,
        identityRequestCount: 3,
        unexpectedIdentityRequestCount: 0,
        handlerErrorCount: 0,
        connectionErrorCount: 0,
      },
      'タイムラインのアナリティクス通信確認'
    );
  },
};
