const { getBaseUrl, navigateToApp, requireEnv, waitForAppBootstrap } = require('../../helpers/login');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');
const {
  closeSoundCautionIfVisible,
  createFloor,
  createRoom,
  findFloorIdByTitle,
  findRoomIdByTitle,
  logoutIfPossible,
  openFloorList,
  openRoomList: openEditableRoomList,
  waitForFloorTitle,
  waitForRoomTitle,
} = require('../../helpers/guest-helpers');
const { waitForPostVisibleByText } = require('../../helpers/timeline-helpers');
const { clickSingleVisible } = require('../../helpers/dialog-focus');
const {
  createCategoryTagByApiActor,
  assertOpenAIProviderDisabled,
  waitForCommonSetting,
  waitForCommonSettingAbsent,
  clickCommonSettingAction,
  submitCommonSettingForm,
  waitForScopedSetting,
  selectAlternateScopedResultUser,
  updateScopedSettingPrompt,
  closeScopedDialog,
  deleteScopedSetting,
  submitTaggedPost,
  assertPostHasNoSupplements,
} = require('../../helpers/ai-analysis-settings');

const waitForEnabled = (browser, selector, label, attempt = 0) => {
  browser.execute(
    function (targetSelector) {
      const candidates = Array.from(document.querySelectorAll(targetSelector)).filter(
        (node) => node.offsetParent || node.getClientRects().length
      );
      return {
        ready: candidates.length === 1 && !candidates[0].disabled,
        count: candidates.length,
        disabled: candidates.length === 1 ? !!candidates[0].disabled : null,
      };
    },
    [selector],
    (result) => {
      const state = result && result.value ? result.value : { ready: false, count: 0 };
      if (state.ready) {
        browser.assert.ok(true, `${label}が有効です。`);
        return;
      }
      if (attempt >= 30) {
        browser.assert.ok(false, `${label}が有効になりませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(300, () => waitForEnabled(browser, selector, label, attempt + 1));
    }
  );
};

const assertSelectorsAbsent = (browser, selectors, label) => {
  browser.execute(
    function (targetSelectors) {
      return targetSelectors.map((selector) => ({
        selector,
        count: document.querySelectorAll(selector).length,
      }));
    },
    [selectors],
    (result) => {
      const counts = result && Array.isArray(result.value) ? result.value : [];
      browser.assert.ok(
        counts.length === selectors.length && counts.every((entry) => entry.count === 0),
        `${label}: ${JSON.stringify(counts)}`
      );
    }
  );
};

const openRoomList = (browser, floorId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/floor/${encodeURIComponent(floorId)}`)
    .waitForElementVisible('.room-list', 20000);
};

const openTimeline = (browser, floorId, roomId) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(
    browser,
    `${base}/floor/${encodeURIComponent(floorId)}/room/${encodeURIComponent(roomId)}`
  )
    .waitForElementVisible('.timeline-page', 20000)
    .waitForElementPresent('[data-testid="timeline-connected"]', 30000);
};

module.exports = {
  '@tags': ['core-all-off', 'fixed-seed-mutation'],

  'AI解析設定の管理・コピー・権限と、OpenAI無効時の通常投稿を確認する': (browser) => {
    const adminMail = requireEnv('E2E_ADMIN_MAIL');
    const adminPassword = requireEnv('E2E_ADMIN_PASSWORD');
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const userMail = requireEnv('E2E_USER_MAIL');
    const userPassword = requireEnv('E2E_USER_PASSWORD');
    const suffix = String(Date.now()).slice(-8);
    const tagName = `ai${suffix}`;
    const initialPrompt = `initial-${suffix}`;
    const commonPrompt = `common-${suffix}`;
    const floorPrompt = `floor-${suffix}`;
    const floorTitle = `E2E AI Floor ${suffix}`;
    const roomTitle = `E2E AI Room ${suffix}`;
    const postContent = `E2E AI provider off ${suffix}`;
    const commonPath = '/management/ai-analysis-settings';
    const commonUrl = `${getBaseUrl(browser).replace(/\/$/, '')}${commonPath}`;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    const runTimelineAndPermissionChecks = (floorId, roomId) => {
      openTimeline(browser, floorId, roomId);
      submitTaggedPost(browser, { content: postContent, tagName }, (submitted) => {
        if (!submitted) {
          finish();
          return;
        }
        waitForPostVisibleByText(browser, postContent, '外部サービス無効時のタグ付き投稿');
        assertPostHasNoSupplements(browser, postContent, 0, (stayedEmpty) => {
          if (!stayedEmpty) {
            finish();
            return;
          }

          const checkPermissions = () => {
          navigateToApp(browser, commonUrl).waitForElementVisible('#mail', 10000);
          browser.assert.urlContains('/login');

          loginByForm(browser, { mail: userMail, password: userPassword });
          openRoomList(browser, floorId);
          assertSelectorsAbsent(
            browser,
            [
              '[data-testid="room-floor-ai-analysis-settings-button"]',
              `[data-testid="room-ai-analysis-settings-button-${roomId}"]`,
              '[data-testid="app-menu-ai-analysis-settings"]',
            ],
            '一般ユーザはAI設定を管理できません'
          );
          navigateToApp(browser, commonUrl).waitForElementVisible('#mail', 10000);
          browser.assert.urlContains('/login');
          finish();
          };
          openRoomList(browser, floorId);
          clickSingleVisible(browser, `[data-testid="room-ai-analysis-settings-button-${roomId}"]`, 'ルームAI設定を開く');
          waitForScopedSetting(browser, { scope: 'room', tagName, prompt: floorPrompt, kindLabel: '会話解析' }, 0, (ready) => {
            if (!ready) return finish();
            deleteScopedSetting(browser, { scope: 'room', tagName }, (deleted) => {
              if (!deleted) return finish();
              closeScopedDialog(browser, 'room', () => {
                clickSingleVisible(browser, '[data-testid="room-floor-ai-analysis-settings-button"]', 'フロアAI設定を開く');
                waitForScopedSetting(browser, { scope: 'floor', tagName, prompt: floorPrompt, kindLabel: '会話解析' }, 0, (floorReady) => {
                  if (!floorReady) return finish();
                  deleteScopedSetting(browser, { scope: 'floor', tagName }, (floorDeleted) => {
                    if (!floorDeleted) return finish();
                    closeScopedDialog(browser, 'floor', () => checkPermissions());
                  });
                });
              });
            });
          });
        });
      });
    };

    const inspectRoomSetting = (floorId, roomId, expectedResultUser) => {
      clickSingleVisible(
        browser,
        `[data-testid="room-ai-analysis-settings-button-${roomId}"]`,
        'ルームのAI設定を開く'
      );
      waitForScopedSetting(
        browser,
        {
          scope: 'room',
          tagName,
          prompt: floorPrompt,
          kindLabel: '会話解析',
          expectedResultUser,
        },
        0,
        (roomReady) => {
          if (!roomReady) {
            finish();
            return;
          }
          closeScopedDialog(browser, 'room', (roomClosed) => {
            if (roomClosed) runTimelineAndPermissionChecks(floorId, roomId);
            else finish();
          });
        }
      );
    };

    const createRoomAfterFloorUpdate = (floorId, expectedResultUser) => {
      createRoom(browser, roomTitle);
      waitForRoomTitle(browser, roomTitle, true);
      let roomId = '';
      findRoomIdByTitle(browser, roomTitle, (resolvedRoomId) => {
        roomId = resolvedRoomId;
      });
      browser.perform(() => {
        if (!roomId) {
          browser.assert.ok(false, 'AI解析のE2E用ルームIDを取得できませんでした。');
          finish();
          return;
        }
        browser.waitForElementVisible(
          `[data-testid="room-ai-analysis-settings-button-${roomId}"]`,
          10000
        );
        inspectRoomSetting(floorId, roomId, expectedResultUser);
      });
    };

    const inspectAndUpdateFloorSetting = (floorId) => {
      browser.waitForElementVisible('[data-testid="room-floor-ai-analysis-settings-button"]', 10000);
      assertSelectorsAbsent(
        browser,
        ['[data-testid="app-menu-ai-analysis-settings"]'],
        'フロア編集ユーザには共通AI設定の管理メニューが表示されません'
      );
      clickSingleVisible(
        browser,
        '[data-testid="room-floor-ai-analysis-settings-button"]',
        'フロアのAI設定を開く'
      );
      waitForScopedSetting(
        browser,
        { scope: 'floor', tagName, prompt: commonPrompt, kindLabel: '会話解析' },
        0,
        (floorReady, floorState) => {
          if (!floorReady) {
            finish();
            return;
          }
          selectAlternateScopedResultUser(
            browser,
            {
              scope: 'floor',
              tagName,
              expectedResultUser: floorState.resultUser,
            },
            0,
            (selectorReady, selectedResultUser) => {
              if (!selectorReady) {
                finish();
                return;
              }
              updateScopedSettingPrompt(
                browser,
                { scope: 'floor', prompt: floorPrompt },
                (saved) => {
                  if (!saved) {
                    finish();
                    return;
                  }
                  waitForScopedSetting(
                    browser,
                    {
                      scope: 'floor',
                      tagName,
                      prompt: floorPrompt,
                      kindLabel: '会話解析',
                      expectedResultUser: selectedResultUser,
                    },
                    0,
                    (updatedFloorReady) => {
                      if (!updatedFloorReady) {
                        finish();
                        return;
                      }
                      closeScopedDialog(browser, 'floor', (floorClosed) => {
                        if (floorClosed) {
                          createRoomAfterFloorUpdate(floorId, selectedResultUser);
                        } else {
                          finish();
                        }
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    };

    const createFloorThenVerifyInheritance = () => {
      loginByForm(browser, { mail: editorMail, password: editorPassword });
      closeSoundCautionIfVisible(browser);
      browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
      waitForUserRole(browser, 'Editor');
      openFloorList(browser);
      createFloor(browser, floorTitle);
      waitForFloorTitle(browser, floorTitle, true);
      let floorId = '';
      findFloorIdByTitle(browser, floorTitle, (resolvedFloorId) => {
        floorId = resolvedFloorId;
      });
      browser.perform(() => {
        if (!floorId) {
          browser.assert.ok(false, 'AI解析のE2E用フロアIDを取得できませんでした。');
          finish();
          return;
        }
        openEditableRoomList(browser, floorId);
        inspectAndUpdateFloorSetting(floorId);
      });
    };

    loginByForm(browser, { mail: adminMail, password: adminPassword });
    assertOpenAIProviderDisabled(browser);
    createCategoryTagByApiActor(browser, {
      actorMail: adminMail,
      actorPassword: adminPassword,
      name: tagName,
    });

    browser
      .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
      .click('[data-testid="app-menu-button"]')
      .waitForElementVisible('[data-testid="app-menu-ai-analysis-settings"]', 10000)
      .click('[data-testid="app-menu-ai-analysis-settings"]')
      .waitForElementVisible('[data-testid="ai-analysis-setting-create"]', 20000);
    waitForEnabled(browser, '[data-testid="ai-analysis-setting-create"]', '共通AI設定の作成');
    clickSingleVisible(
      browser,
      '[data-testid="ai-analysis-setting-create"]',
      '共通AI設定の作成ダイアログを開く'
    );
    submitCommonSettingForm(browser, {
      tagName,
      analysisKind: 'conversation',
      prompt: initialPrompt,
    });
    waitForCommonSetting(browser, { tagName, prompt: initialPrompt });

    clickCommonSettingAction(browser, tagName, '編集');
    submitCommonSettingForm(browser, {
      tagName,
      analysisKind: 'conversation',
      prompt: commonPrompt,
    });
    waitForCommonSetting(browser, { tagName, prompt: commonPrompt });

    clickCommonSettingAction(browser, tagName, '削除');
    waitForCommonSettingAbsent(browser, tagName);
    browser.refresh();
    waitForAppBootstrap(browser, '共通AI設定管理の再読み込み');
    waitForUserRole(browser, 'Administrator');
    browser.waitForElementVisible('[data-testid="ai-analysis-setting-create"]', 20000);
    waitForCommonSettingAbsent(browser, tagName);
    waitForEnabled(browser, '[data-testid="ai-analysis-setting-create"]', '共通AI設定の再作成');
    clickSingleVisible(browser, '[data-testid="ai-analysis-setting-create"]', '共通AI設定を再作成する');
    submitCommonSettingForm(browser, { tagName, analysisKind: 'conversation', prompt: commonPrompt });
    waitForCommonSetting(browser, { tagName, prompt: commonPrompt });

    logoutIfPossible(browser);
    createFloorThenVerifyInheritance();
  },
};
