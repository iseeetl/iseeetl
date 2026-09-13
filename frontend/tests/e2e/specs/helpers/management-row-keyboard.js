const { getBaseUrl, navigateToApp, requireEnv } = require('./login');
const { sendKeysToActiveElement } = require('./dialog-focus');
const { waitForLoginSession, waitForUserRole } = require('./session-helpers');

const TARGET_ATTRIBUTE = 'data-e2e-management-row-keyboard-target';
const ROW_ACTION_SELECTOR = 'button.management-row-action-button';
const ACTION_SELECTOR = `${ROW_ACTION_SELECTOR}[${TARGET_ATTRIBUTE}="true"]`;
const MANAGEMENT_LIFECYCLE_DIALOG_SELECTOR =
  '[data-testid="management-lifecycle-dialog"] [role="dialog"]';
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const buildManagementRowScenario = () => {
  const stamp = String(Date.now()).slice(-8);
  const fixture = {
    categoryTagName: `E2E共通${stamp}`,
    floorTagName: `E2Eフロア${stamp}`,
    roomTagName: `E2Eルーム${stamp}`,
    floorTitle: `E2Eキーボードフロア${stamp}`,
    roomTitle: `E2Eキーボードルーム${stamp}`,
    spamWord: `E2Eスパム${stamp}`,
    postContent: `E2Eキーボード投稿${stamp}`,
  };

  return {
    fixture,
    cases: [
      {
        label: '共通タグ管理',
        path: '/management/categorytag',
        dialogTitleId: 'category-tag-management-dialog-title',
        buttonText: '編集',
        ariaLabel: `編集: 共通タグ「${fixture.categoryTagName}」`,
      },
      {
        label: 'フロアタグ管理',
        path: '/management/floortag',
        dialogTitleId: 'edit_floor_tag_dialog_title',
        buttonText: '編集',
        ariaLabel: `編集: フロアタグ「${fixture.floorTagName}」`,
      },
      {
        label: 'ルームタグ管理',
        path: '/management/roomtag',
        dialogTitleId: 'edit_room_tag_dialog_title',
        buttonText: '編集',
        ariaLabel: `編集: ルームタグ「${fixture.roomTagName}」`,
      },
      {
        label: 'フロア管理',
        path: '/management/floor',
        dialogTitleId: 'edit_floor_dialog_title',
        buttonText: '編集',
        ariaLabel: `編集: フロア「${fixture.floorTitle}」`,
      },
      {
        label: 'ルーム管理',
        path: '/management/room',
        dialogTitleId: 'edit_room_dialog_title',
        buttonText: '編集',
        ariaLabel: `編集: ルーム「${fixture.roomTitle}」`,
      },
      {
        label: 'ユーザ管理',
        path: '/management/user',
        dialogTitleId: 'user-management-edit-dialog-title',
        buttonText: '編集',
        ariaLabel: '編集: ユーザ「E2E Administrator」',
      },
      {
        label: 'スパム管理',
        path: '/management/spam',
        dialogTitleId: 'spam-management-edit-dialog-title',
        buttonText: '編集',
        ariaLabel: `スパムワード「${fixture.spamWord}」を編集`,
      },
      {
        label: 'フロアメンバー管理',
        path: '/management/floormember',
        dialogTitleId: 'floor-member-management-delete-dialog-title',
        buttonText: '削除',
        ariaLabel: `「${fixture.floorTitle}」のメンバー「E2E Author」を削除`,
      },
      {
        label: 'ルームメンバー管理',
        path: '/management/roommember',
        dialogTitleId: 'room-member-management-delete-dialog-title',
        buttonText: '削除',
        ariaLabel: `「${fixture.roomTitle}」のメンバー「E2E Administrator」を削除`,
      },
      {
        label: '投稿管理',
        path: '/management/post',
        dialogSelector: MANAGEMENT_LIFECYCLE_DIALOG_SELECTOR,
        buttonText: '削除',
        ariaLabel: `削除: 投稿「${fixture.postContent}」`,
      },
    ],
  };
};

const managementDialogSelector = (testCase) =>
  testCase.dialogSelector || `[role="dialog"][aria-labelledby="${testCase.dialogTitleId}"]`;

const buildManagementUrl = (browser, path) => `${getBaseUrl(browser).replace(/\/$/, '')}${path}`;

const waitForManagementView = (browser, testCase, attempt = 0) => {
  const maxAttempts = 30;
  const expectedTitle = testCase.expectedTitle || testCase.label;
  browser.execute(
    function (expected) {
      const title = document.querySelector('.view h1.view-title');
      const visible = !!(title && (title.offsetParent || title.getClientRects().length));
      return {
        path: window.location.pathname,
        title: title && title.textContent ? title.textContent.trim() : '',
        visible,
        expectedPath: expected.path,
        expectedTitle: expected.title,
      };
    },
    [{ path: testCase.path, title: expectedTitle }],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.path === testCase.path && state.visible && state.title === expectedTitle) {
        browser.assert.ok(true, `${testCase.label}: 対象の管理画面を表示します`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `${testCase.label}: 対象の管理画面を表示できませんでした（${JSON.stringify(state)}）`);
        return;
      }
      browser.pause(200, () => waitForManagementView(browser, testCase, attempt + 1));
    }
  );
};

const prepareManagementRowFixtures = (browser, fixture) => {
  const credentials = {
    admin: {
      mail: requireEnv('E2E_ADMIN_MAIL'),
      password: requireEnv('E2E_ADMIN_PASSWORD'),
    },
    editor: {
      mail: requireEnv('E2E_FLOOR_EDITOR_MAIL'),
      password: requireEnv('E2E_FLOOR_EDITOR_PASSWORD'),
    },
    author: {
      mail: requireEnv('E2E_USER_MAIL'),
      password: requireEnv('E2E_USER_PASSWORD'),
    },
  };

  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin', requestStatus: 0 });
        return;
      }
      const requestJson = function (path, options) {
        return fetch(path, options).then(function (response) {
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
      const fail = function (stage, status) {
        const error = new Error(stage);
        error.stage = stage;
        error.requestStatus = status || 0;
        throw error;
      };
      const requireSuccess = function (result, stage) {
        if (!result || result.status < 200 || result.status >= 300) {
          return fail(stage, result ? result.status : 0);
        }
        return result.body || {};
      };
      const login = function (account, stage) {
        return requestJson('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(account),
        }).then(function (result) {
          const body = requireSuccess(result, stage);
          const token = body.token ? String(body.token) : '';
          if (!token) return fail(stage, result.status);
          return {
            token,
            userId: body.user_id ? String(body.user_id) : '',
            username: body.user_name ? String(body.user_name) : '',
            lang: body.lang || 'ja',
          };
        });
      };
      const post = function (actor, path, body, stage) {
        return requestJson(path, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${actor.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        }).then(function (result) {
          return requireSuccess(result, stage);
        });
      };

      let actors;
      let floor;
      let room;
      Promise.all([
        login(payload.credentials.admin, 'admin-login'),
        login(payload.credentials.editor, 'editor-login'),
        login(payload.credentials.author, 'author-login'),
      ])
        .then(function (resolvedActors) {
          actors = {
            admin: resolvedActors[0],
            editor: resolvedActors[1],
            author: resolvedActors[2],
          };
          return post(
            actors.editor,
            '/api/floor/create',
            {
              title: payload.fixture.floorTitle,
              description: 'E2E管理行キーボード操作確認用',
              floor_display_hidden: false,
              lang: 'ja',
              target_langs: [],
            },
            'floor-create'
          );
        })
        .then(function (createdFloor) {
          floor = createdFloor;
          if (!floor._id) return fail('floor-create-id', 200);
          return post(
            actors.editor,
            '/api/room/create',
            {
              floor_id: String(floor._id),
              title: payload.fixture.roomTitle,
              description: 'E2E管理行キーボード操作確認用',
              lang: 'ja',
              guest_reaction_only: false,
              member_only: false,
              room_display_hidden: false,
              notification: true,
              external_sns_button: false,
            },
            'room-create'
          );
        })
        .then(function (createdRoom) {
          room = createdRoom;
          if (!room._id) return fail('room-create-id', 200);

          const floorId = String(floor._id);
          const roomId = String(room._id);
          const createPost = post(
            actors.editor,
            `/api/rooms/${roomId}/timeline/posts`,
            {
              content: payload.fixture.postContent,
              lang: actors.editor.lang,
            },
            'post-create'
          );
          const createFloorMembership = post(
            actors.editor,
            '/api/floormember/invite',
            { floor_id: floorId, period: '8h' },
            'floor-invite'
          ).then(function (invite) {
            if (!invite.token) return fail('floor-invite-token', 200);
            return post(
              actors.author,
              '/api/floormember/create',
              { floor_id: floorId, invite_token: String(invite.token) },
              'floor-member-create'
            );
          });
          const createRoomMembership = post(
            actors.editor,
            '/api/roommember/invite',
            { room_id: roomId, period: '8h' },
            'room-invite'
          ).then(function (invite) {
            if (!invite.token) return fail('room-invite-token', 200);
            return post(
              actors.admin,
              '/api/roommember/create',
              { room_id: roomId, invite_token: String(invite.token) },
              'room-member-create'
            );
          });

          return Promise.all([
            post(
              actors.admin,
              '/api/categorytag/management/create',
              { order: 1, name: payload.fixture.categoryTagName },
              'category-tag-create'
            ),
            post(
              actors.editor,
              '/api/floortag/create',
              { floor_id: floorId, order: 1, name: payload.fixture.floorTagName, lang: 'ja' },
              'floor-tag-create'
            ),
            post(
              actors.editor,
              '/api/roomtag/create',
              { room_id: roomId, order: 1, name: payload.fixture.roomTagName, lang: 'ja' },
              'room-tag-create'
            ),
            post(
              actors.admin,
              '/api/spam/management/create',
              { word: payload.fixture.spamWord },
              'spam-create'
            ),
            createPost,
            createFloorMembership,
            createRoomMembership,
          ]);
        })
        .then(function () {
          done({ ok: true, stage: 'complete' });
        })
        .catch(function (error) {
          done({
            ok: false,
            stage: error && error.stage ? error.stage : 'request',
            requestStatus: error && error.requestStatus ? error.requestStatus : 0,
          });
        });
    },
    [{ credentials, fixture }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result', requestStatus: 0 };
      browser.assert.ok(
        state.ok,
        `10種類の管理画面の専用データを製品APIで作成します（stage=${state.stage}, status=${
          state.requestStatus || 0
        }）`
      );
    }
  );
};

const loginAsAdmin = (browser) => {
  const baseUrl = getBaseUrl(browser).replace(/\/$/, '');
  const mail = requireEnv('E2E_ADMIN_MAIL');
  const password = requireEnv('E2E_ADMIN_PASSWORD');

  navigateToApp(browser, `${baseUrl}/login`)
    .waitForElementVisible('#mail', 10000)
    .execute(
      function (credentials) {
        const mailInput = document.querySelector('#mail');
        const passwordInput = document.querySelector('#password');
        if (!mailInput || !passwordInput) return { filled: false };
        mailInput.value = credentials.mail;
        mailInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.value = credentials.password;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        return { filled: true };
      },
      [{ mail, password }],
      (result) => {
        const state = result && result.value ? result.value : { filled: false };
        browser.assert.ok(state.filled, '管理者ログインフォームへ認証情報を入力します');
      }
    )
    .waitForElementVisible('[data-testid="login-submit"]', 10000)
    .click('[data-testid="login-submit"]')
    .waitForElementVisible('[data-testid="app-menu-button"]', 20000);
  waitForLoginSession(browser);
  waitForUserRole(browser, 'Administrator');
};

const ensureManagementRow = (browser, testCase, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function (payload) {
      document.querySelectorAll(`[${payload.targetAttribute}]`).forEach((node) => {
        node.removeAttribute(payload.targetAttribute);
      });
      const view = document.querySelector('.view');
      const matches = Array.from(document.querySelectorAll(payload.rowActionSelector)).filter(
        (button) =>
          button.getAttribute('aria-label') === payload.ariaLabel &&
          !button.disabled &&
          button.getAttribute('aria-disabled') !== 'true'
      );
      if (matches.length === 1) matches[0].setAttribute(payload.targetAttribute, 'true');
      const target = matches.length === 1 ? matches[0] : null;
      return {
        busy: view ? view.getAttribute('aria-busy') === 'true' : null,
        matchCount: matches.length,
        ariaLabel: target ? target.getAttribute('aria-label') || '' : '',
        text: target && target.textContent ? target.textContent.trim() : '',
        type: target ? target.getAttribute('type') || '' : '',
      };
    },
    [
      {
        targetAttribute: TARGET_ATTRIBUTE,
        rowActionSelector: ROW_ACTION_SELECTOR,
        ariaLabel: testCase.ariaLabel,
      },
    ],
    (result) => {
      const state = result && result.value ? result.value : { busy: null, matchCount: -1 };
      if (
        state.busy === false &&
        state.matchCount === 1 &&
        state.ariaLabel === testCase.ariaLabel &&
        state.text === testCase.buttonText &&
        state.type === 'button'
      ) {
        browser.assert.ok(true, `${testCase.label}: 専用の行の操作ボタンを1件に特定します`);
        return;
      }
      if (state.matchCount > 1 || attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `${testCase.label}: 専用の行の操作ボタンを特定できませんでした（busy=${state.busy}, matches=${
            state.matchCount
          }, aria=${state.ariaLabel || ''}）`
        );
        return;
      }
      browser.pause(300, () => ensureManagementRow(browser, testCase, attempt + 1));
    }
  );
};

const focusActionButtonWithTab = (browser, label) => {
  browser.execute(
    function (payload) {
      const target = document.querySelector(payload.actionSelector);
      if (!target) return { focused: false, reason: '操作ボタンが見つかりません' };
      const focusable = Array.from(document.querySelectorAll(payload.focusableSelector)).filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          element.tabIndex >= 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        );
      });
      const targetIndex = focusable.indexOf(target);
      if (targetIndex < 1) {
        return {
          focused: false,
          reason: `直前のフォーカス可能な要素が見つかりません: ${targetIndex}`,
          targetTabIndex: target.tabIndex,
        };
      }
      const previous = focusable[targetIndex - 1];
      previous.focus();
      return {
        focused: document.activeElement === previous,
        targetIndex,
        targetTabIndex: target.tabIndex,
      };
    },
    [{ actionSelector: ACTION_SELECTOR, focusableSelector: FOCUSABLE_SELECTOR }],
    (result) => {
      const state = result && result.value ? result.value : { focused: false };
      browser.assert.ok(
        state.focused,
        `${label}: 操作ボタンの直前の要素へフォーカスを移します（targetIndex=${state.targetIndex}, tabIndex=${state.targetTabIndex}）`
      );
    }
  );

  browser.perform((done) => {
    const maxAttempts = 3;
    const advanceFocus = (attempt) => {
      sendKeysToActiveElement(browser, browser.Keys.TAB, (keyState) => {
        if (!keyState.ok) {
          browser.assert.ok(false, `${label}: フォーカス中の要素へTabキーを送れませんでした（${keyState.reason}）`);
          done();
          return;
        }
        browser.pause(50, () => {
          browser.execute(
            function (payload) {
              const target = document.querySelector(payload.actionSelector);
              const active = document.activeElement;
              const focusable = Array.from(document.querySelectorAll(payload.focusableSelector)).filter((element) => {
                const style = window.getComputedStyle(element);
                const rect = element.getBoundingClientRect();
                return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
              });
              const identify = (element) => {
                if (!element) return 'none';
                return (
                  element.getAttribute('aria-label') ||
                  element.getAttribute('data-testid') ||
                  element.id ||
                  element.tagName.toLowerCase()
                );
              };
              return {
                focused: !!target && active === target,
                active: identify(active),
                targetIndex: focusable.indexOf(target),
              };
            },
            [{ actionSelector: ACTION_SELECTOR, focusableSelector: FOCUSABLE_SELECTOR }],
            (result) => {
              const state = result && result.value ? result.value : { focused: false, active: '実行に失敗しました' };
              if (state.focused) {
                browser.assert.ok(true, `${label}: Tabキーで行の操作ボタンへ移動します（${attempt}回）`);
                done();
                return;
              }
              if (attempt >= maxAttempts) {
                browser.assert.ok(
                  false,
                  `${label}: Tabキーで行の操作ボタンへ移動できませんでした（active=${state.active}, targetIndex=${state.targetIndex}）`
                );
                done();
                return;
              }
              advanceFocus(attempt + 1);
            }
          );
        });
      });
    };

    advanceFocus(1);
  });
};

const assertVisibleDialog = (browser, testCase, keyLabel) => {
  const dialogSelector = managementDialogSelector(testCase);
  browser.execute(
    function (selector) {
      const dialogs = Array.from(document.querySelectorAll(selector)).filter(
        (dialog) => dialog.offsetParent || dialog.getClientRects().length
      );
      const titleId = dialogs.length === 1 ? dialogs[0].getAttribute('aria-labelledby') || '' : '';
      const titles = Array.from(document.querySelectorAll('[id]')).filter((element) => element.id === titleId);
      return {
        dialogCount: dialogs.length,
        titleCount: titles.length,
        titleInside: dialogs.length === 1 && titles.length === 1 && dialogs[0].contains(titles[0]),
      };
    },
    [dialogSelector],
    (result) => {
      const state = result && result.value ? result.value : { dialogCount: -1, titleCount: -1, titleInside: false };
      browser.assert.ok(
        state.dialogCount === 1 && state.titleCount === 1 && state.titleInside,
        `${testCase.label}: ${keyLabel}で対象のダイアログだけを表示します（dialogs=${
          state.dialogCount
        }, titles=${state.titleCount}）`
      );
    }
  );
};

const waitForTargetDialogClosed = (browser, testCase, keyLabel, attempt = 0) => {
  const maxAttempts = 20;
  const dialogSelector = managementDialogSelector(testCase);
  browser.execute(
    function (selector) {
      const visible = Array.from(document.querySelectorAll(selector)).filter(
        (dialog) => dialog.offsetParent || dialog.getClientRects().length
      );
      return { visibleCount: visible.length };
    },
    [dialogSelector],
    (result) => {
      const state = result && result.value ? result.value : { visibleCount: -1 };
      if (state.visibleCount === 0) {
        browser.assert.ok(true, `${testCase.label}（${keyLabel}）: 対象のダイアログが閉じました`);
        return;
      }
      if (state.visibleCount > 1 || attempt >= maxAttempts) {
        browser.assert.ok(
          false,
          `${testCase.label}（${keyLabel}）: 対象のダイアログが閉じませんでした（count=${state.visibleCount}）`
        );
        return;
      }
      browser.pause(100, () => waitForTargetDialogClosed(browser, testCase, keyLabel, attempt + 1));
    }
  );
};

const closeVisibleDialog = (browser, testCase, keyLabel) => {
  const dialogSelector = managementDialogSelector(testCase);
  browser.execute(
    function (selector) {
      const dialogs = Array.from(document.querySelectorAll(selector)).filter(
        (dialog) => dialog.offsetParent || dialog.getClientRects().length
      );
      if (dialogs.length !== 1) return { clicked: false, reason: `dialog-count:${dialogs.length}` };

      const buttons = Array.from(dialogs[0].querySelectorAll('button')).filter(
        (button) =>
          /キャンセル|閉じる/.test((button.textContent || '').trim()) &&
          !button.disabled &&
          button.getAttribute('aria-disabled') !== 'true' &&
          !!(button.offsetParent || button.getClientRects().length)
      );
      if (buttons.length !== 1) return { clicked: false, reason: `dismiss-count:${buttons.length}` };
      buttons[0].click();
      return { clicked: true, reason: '' };
    },
    [dialogSelector],
    (result) => {
      const state = result && result.value ? result.value : { clicked: false, reason: '実行に失敗しました' };
      browser.assert.ok(
        state.clicked,
        `${testCase.label}（${keyLabel}）: 対象のダイアログを閉じます（${state.reason || ''}）`
      );
    }
  );
  waitForTargetDialogClosed(browser, testCase, keyLabel);
};

const activateActionWithKey = (browser, testCase, key, keyLabel) => {
  focusActionButtonWithTab(browser, `${testCase.label} (${keyLabel})`);
  browser.perform((done) => {
    sendKeysToActiveElement(browser, key, (keyState) => {
      browser.assert.ok(
        keyState.ok,
        keyState.ok
          ? `${testCase.label} (${keyLabel}): アクティブ要素へキーを送信する`
          : `${testCase.label} (${keyLabel}): キーを送信できない (${keyState.reason})`
      );
      done();
    });
  });
  browser.waitForElementVisible(managementDialogSelector(testCase), 10000);
  assertVisibleDialog(browser, testCase, keyLabel);
  closeVisibleDialog(browser, testCase, keyLabel);
};

const runManagementRowKeyboardCases = (browser, cases) => {
  cases.forEach((testCase) => {
    navigateToApp(browser, buildManagementUrl(browser, testCase.path));
    waitForManagementView(browser, testCase);

    ensureManagementRow(browser, testCase);
    browser
      .waitForElementVisible(ACTION_SELECTOR, 10000)
      .assert.attributeEquals(ACTION_SELECTOR, 'type', 'button')
      .assert.textContains(ACTION_SELECTOR, testCase.buttonText)
      .assert.attributeEquals(ACTION_SELECTOR, 'aria-label', testCase.ariaLabel);

    activateActionWithKey(browser, testCase, browser.Keys.ENTER, 'Enter');
    ensureManagementRow(browser, testCase);
    activateActionWithKey(browser, testCase, browser.Keys.SPACE, 'Space');
  });
};

module.exports = {
  ACTION_SELECTOR,
  buildManagementRowScenario,
  ensureManagementRow,
  loginAsAdmin,
  managementDialogSelector,
  prepareManagementRowFixtures,
  runManagementRowKeyboardCases,
  waitForManagementView,
};
