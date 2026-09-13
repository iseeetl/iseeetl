const { getBaseUrl, navigateToApp, requireEnv } = require('../../helpers/login');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { loginByForm, waitForUserRole } = require('../../helpers/session-helpers');
const { closeSoundCautionIfVisible } = require('../../helpers/invite-ui-helpers');
const { runConfigurationOperation, openConnectedSecondary } = require('../../helpers/configuration-revocation');
const { readSecondaryTimelineConnection, closeSecondaryTimelineConnection, waitForTimelineReady } = require('../../helpers/e2e-public-contract');
const { installUserSessionRevocationProbe, waitForSessionRevocation, verifyOldSessionRejected, closeUserSessionRevocationProbe } = require('../../helpers/user-session-revocation');

module.exports = {
  '@tags': ['fixed-seed-mutation'],
  'パスワード変更で本人の2接続を失効させ、別ユーザの接続を維持する': (browser) => {
    const nextPassword = 'E2Enextpass123';
    clearBrowserSession(browser);
    navigateToApp(browser, getBaseUrl(browser));
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    runConfigurationOperation(browser, { kind: 'setup' }, (state) => {
      if (!state.ok) return browser.end();
      const timelineUrl = `${getBaseUrl(browser)}/floor/${state.floorId}/room/${state.roomId}`;
      loginByForm(browser, { mail: requireEnv('E2E_ADMIN_MAIL'), password: requireEnv('E2E_ADMIN_PASSWORD') });
      waitForUserRole(browser, 'Administrator');
      navigateToApp(browser, timelineUrl);
      closeSoundCautionIfVisible(browser);
      waitForTimelineReady(browser, {}, (ready) => {
        browser.assert.ok(ready, '比較対象のユーザが接続されています。');
        if (!ready) return browser.end();
        openConnectedSecondary(browser, state.roomId, '比較対象の接続を確認', (control) => {
          if (!control) return browser.end();
          // SPA内の画面遷移で、別管理の比較用Socket接続を維持する。
          loginByForm(browser, { mail: requireEnv('E2E_USER_MAIL'), password: requireEnv('E2E_USER_PASSWORD') });
          waitForUserRole(browser, 'Author');
          navigateToApp(browser, timelineUrl);
          closeSoundCautionIfVisible(browser);
          installUserSessionRevocationProbe(browser, (targetReady) => {
            if (!targetReady) {
              closeSecondaryTimelineConnection(browser, control.id);
              return browser.end();
            }
            openConnectedSecondary(browser, state.roomId, '対象ユーザの2本目の接続を確認', (target) => {
              if (!target) {
                closeSecondaryTimelineConnection(browser, control.id);
                return browser.end();
              }
              runConfigurationOperation(browser, { kind: 'password', nextPassword }, () => {
                waitForSessionRevocation(browser, 0, () => {
                  readSecondaryTimelineConnection(browser, target.id, (connection) => {
                    browser.assert.ok(connection?.found && !connection.connected && connection.disconnectCount > 0, '対象ユーザの2本目の接続も切断されました。');
                    closeSecondaryTimelineConnection(browser, target.id);
                    readSecondaryTimelineConnection(browser, control.id, (preserved) => {
                      browser.assert.ok(preserved?.connected && preserved.connectionId === control.connectionId && preserved.disconnectCount === 0, '別のユーザは元の接続を維持しています。');
                      closeSecondaryTimelineConnection(browser, control.id);
                      verifyOldSessionRejected(browser, 'password-change', () => {
                        closeUserSessionRevocationProbe(browser);
                        loginByForm(browser, { mail: requireEnv('E2E_USER_MAIL'), password: nextPassword });
                        waitForUserRole(browser, 'Author');
                        browser.end();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },
};
