const { getBaseUrl, navigateToApp } = require('../../helpers/login');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { closeSoundCautionIfVisible } = require('../../helpers/invite-ui-helpers');
const { runConfigurationOperation } = require('../../helpers/configuration-revocation');
const { installSocketRevocationProbe, waitForSocketRevocation, waitForReconnectRejected } = require('../../helpers/socket-access-revocation');

for (const kind of ['room_restricted', 'room_deleted', 'floor_deleted']) {
  module.exports[`設定変更後にゲストの接続を失効させる（${kind}）`] = (browser) => {
    clearBrowserSession(browser);
    navigateToApp(browser, getBaseUrl(browser));
    browser.waitForElementVisible('[data-testid="app-menu-button"]', 10000);
    runConfigurationOperation(browser, { kind: 'setup' }, (state) => {
      if (!state.ok) return browser.end();
      navigateToApp(browser, `${getBaseUrl(browser)}/floor/${state.floorId}/room/${state.roomId}`);
      closeSoundCautionIfVisible(browser);
      installSocketRevocationProbe(browser, kind, (ready) => {
        if (!ready) return browser.end();
        runConfigurationOperation(browser, { ...state, kind }, () => {
          const expectedPath = kind === 'floor_deleted' ? '/' : `/floor/${state.floorId}`;
          waitForSocketRevocation(browser, { label: kind, expectedPath }, 0, () => {
            waitForReconnectRejected(browser, kind, 0, () => browser.end());
          });
        });
      });
    });
  };
}
