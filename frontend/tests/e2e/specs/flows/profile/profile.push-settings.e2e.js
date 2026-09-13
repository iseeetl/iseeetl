// provider-onesignalプロファイル専用。有効なOneSignalのトークンとアプリIDが必要。
// NightwatchのChromiumプロファイルで、ブラウザの通知権限を許可しておく。
const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const {
  openProfileFromMenu,
  waitForSnackbar,
  clickExactProfileSave,
} = require('../../helpers/profile-helpers');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');

const readPushState = (browser, onRead) => {
  browser.execute(
    function () {
      const button = document.querySelector('.push-notify-button');
      const reply = document.querySelector('#reply_push');
      const replied = document.querySelector('#replied_post_push');
      return {
        hasControls: !!button && !!reply && !!replied,
        buttonDisabled: button ? !!button.disabled : true,
        hasProviderApi: !!(
          window.OneSignal &&
          window.OneSignal.User &&
          window.OneSignal.User.PushSubscription &&
          window.OneSignal.Notifications
        ),
        browserPermission: typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
        providerPermission: !!(
          window.OneSignal &&
          window.OneSignal.Notifications &&
          window.OneSignal.Notifications.permission
        ),
        pushEnabled: reply ? !reply.disabled : false,
        replyPushEnabled: reply ? !!reply.checked : false,
        repliedPostPushEnabled: replied ? !!replied.checked : false,
      };
    },
    [],
    (result) => {
      const state =
        result && result.value
          ? result.value
          : {
              hasControls: false,
              buttonDisabled: true,
              hasProviderApi: false,
              browserPermission: 'unknown',
              providerPermission: false,
              pushEnabled: false,
              replyPushEnabled: false,
              repliedPostPushEnabled: false,
            };
      onRead(state);
    }
  );
};

const waitForPushControlsReady = (browser, onReady, attempt = 0) => {
  const maxAttempts = 20;
  readPushState(browser, (state) => {
    if (
      state.hasControls &&
      !state.buttonDisabled &&
      state.hasProviderApi &&
      state.browserPermission === 'granted' &&
      state.providerPermission
    ) {
      browser.assert.ok(true, 'OneSignal機能、操作要素、SDK、通知権限が利用可能です。');
      onReady(true, state);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `OneSignalのプッシュ通知の前提条件がそろっていません: ${JSON.stringify(state)}`);
      onReady(false, state);
      return;
    }
    browser.pause(500, () => waitForPushControlsReady(browser, onReady, attempt + 1));
  });
};

const waitForPushEnabled = (browser, expected, onDone, attempt = 0) => {
  const maxAttempts = 16;
  readPushState(browser, (state) => {
    if (state.pushEnabled === expected) {
      browser.assert.ok(true, `プッシュ通知の有効状態=${expected}。`);
      onDone(true, state);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `プッシュ通知の有効状態が一致しません: 期待値=${expected} 実際=${state.pushEnabled}`);
      onDone(false, state);
      return;
    }
    browser.pause(500, () => waitForPushEnabled(browser, expected, onDone, attempt + 1));
  });
};

const waitForPushCheckboxState = (browser, expected, onDone, attempt = 0) => {
  const maxAttempts = 12;
  readPushState(browser, (state) => {
    const matched =
      state.replyPushEnabled === expected.replyPushEnabled &&
      state.repliedPostPushEnabled === expected.repliedPostPushEnabled;
    if (matched) {
      browser.assert.ok(
        true,
        `プッシュ通知のチェック状態を確認しました: reply=${state.replyPushEnabled} replied=${state.repliedPostPushEnabled}`
      );
      onDone(true);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `プッシュ通知のチェック状態が一致しません: ${JSON.stringify(state)}`);
      onDone(false);
      return;
    }
    browser.pause(500, () => waitForPushCheckboxState(browser, expected, onDone, attempt + 1));
  });
};

const clickPushToggleButton = (browser) => {
  browser.waitForElementVisible('.push-notify-button', 10000).click('.push-notify-button');
};

const setPushCheckboxState = (browser, { replyPushEnabled, repliedPostPushEnabled }) => {
  browser.execute(
    function (next) {
      const reply = document.querySelector('#reply_push');
      const replied = document.querySelector('#replied_post_push');
      if (!reply || !replied) return { ok: false, reason: 'push-checkbox-not-found' };
      if (reply.disabled || replied.disabled) return { ok: false, reason: 'push-checkbox-disabled' };

      if (reply.checked !== !!next.replyPushEnabled) reply.click();
      if (replied.checked !== !!next.repliedPostPushEnabled) replied.click();

      return {
        ok: true,
        replyPushEnabled: !!reply.checked,
        repliedPostPushEnabled: !!replied.checked,
      };
    },
    [{ replyPushEnabled, repliedPostPushEnabled }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, reason: 'unknown' };
      if (!state.ok) {
        browser.assert.ok(false, `プッシュ通知のチェック状態を設定できませんでした: ${state.reason || 'unknown'}`);
      }
    }
  );
};

const reopenProfileWithSpaNavigation = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/`)
    .waitForElementNotPresent('#username', 10000)
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000);
  openProfileFromMenu(browser);
};

module.exports = {
  '@tags': ['provider-onesignal', 'fixed-seed-mutation'],

  'プロフィールのプッシュ通知設定を変更できる': (browser) => {
    const mail = requireEnv('E2E_USER_MAIL');
    const password = requireEnv('E2E_USER_PASSWORD');

    loginByForm(browser, { mail, password });
    waitForUserRole(browser, 'Author');
    openProfileFromMenu(browser);

    waitForPushControlsReady(browser, (ready, initialState) => {
      if (!ready) {
        browser.end();
        return;
      }

      const target = {
        replyPushEnabled: !initialState.replyPushEnabled,
        repliedPostPushEnabled: !initialState.repliedPostPushEnabled,
      };

      const saveAndVerifyCheckboxes = () => {
        setPushCheckboxState(browser, target);
        clickExactProfileSave(browser, {
          expectedControls: [
            { selector: '#reply_push', property: 'checked', value: target.replyPushEnabled },
            {
              selector: '#replied_post_push',
              property: 'checked',
              value: target.repliedPostPushEnabled,
            },
          ],
          label: 'プロフィールのプッシュ通知設定の更新',
        });
        waitForSnackbar(browser);
        reopenProfileWithSpaNavigation(browser);
        waitForPushControlsReady(browser, (reopenedReady) => {
          if (!reopenedReady) {
            browser.end();
            return;
          }

          waitForPushCheckboxState(browser, target, (savedOk) => {
            if (!savedOk) {
              browser.end();
              return;
            }

            readPushState(browser, (reloadedState) => {
              if (reloadedState.pushEnabled) {
                browser.end();
                return;
              }

              clickPushToggleButton(browser);
              waitForPushEnabled(browser, true, (resynced) => {
                if (!resynced) {
                  browser.end();
                  return;
                }
                waitForSnackbar(browser);
                waitForPushCheckboxState(browser, target, () => browser.end());
              });
            });
          });
        });
      };

      const enableForCheckboxPersistence = () => {
        if (initialState.pushEnabled) {
          saveAndVerifyCheckboxes();
          return;
        }

        clickPushToggleButton(browser);
        waitForPushEnabled(browser, true, (enabled) => {
          if (!enabled) {
            browser.end();
            return;
          }
          waitForSnackbar(browser);
          saveAndVerifyCheckboxes();
        });
      };

      clickPushToggleButton(browser);
      waitForPushEnabled(browser, !initialState.pushEnabled, (firstToggleOk) => {
        if (!firstToggleOk) {
          browser.end();
          return;
        }
        waitForSnackbar(browser);

        clickPushToggleButton(browser);
        waitForPushEnabled(browser, initialState.pushEnabled, (secondToggleOk) => {
          if (!secondToggleOk) {
            browser.end();
            return;
          }
          waitForSnackbar(browser);
          enableForCheckboxPersistence();
        });
      });
    });
  },
};
