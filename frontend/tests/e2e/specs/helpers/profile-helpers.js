const { getBaseUrl, navigateToApp } = require('./login');
const { clickSingleVisible, clickSingleVisibleAfterExactControls } = require('./dialog-focus');

const openAppMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000)
    .click('[data-testid="app-menu-button"]')
    .waitForElementVisible('[data-testid="app-menu"]', 10000, false, (result) => {
      if (typeof result.status === 'number' && result.status !== 0) {
        browser.click('[data-testid="app-menu-button"]').waitForElementVisible('[data-testid="app-menu"]', 10000);
      }
    });
};

const clickProfileMenuItem = (browser) => {
  browser.execute(
    function () {
      const menu = document.querySelector('#app_menu');
      if (!menu) return { clicked: false, reason: 'menu-not-found' };
      const profileButton = menu.querySelector('[data-testid="app-menu-profile"]');
      if (!profileButton) return { clicked: false, reason: 'button-not-found' };
      profileButton.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `プロフィールボタンをクリックできませんでした: ${reason}`);
      }
    }
  );
};

const waitForProfileView = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const username = document.querySelector('#username');
      const dialog = username ? username.closest('[role="dialog"]') : null;
      const title = dialog
        ? dialog.querySelector('.ui-dialog__heading')
        : document.querySelector('.view-header h1.view-title');
      return {
        title: title ? title.textContent.trim() : '',
        hasUsername: !!username,
        hasDialog: !!dialog,
      };
    },
    [],
    (result) => {
      const state = result && result.value
        ? result.value
        : { title: '', hasUsername: false, hasDialog: false };
      const hasTitle = state.title.includes('プロフィール') || state.title.includes('Profile');
      if (state.hasUsername && state.hasDialog && hasTitle) {
        browser.assert.ok(true, 'プロフィールダイアログを操作できます。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `プロフィールダイアログを操作できません: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForProfileView(browser, attempt + 1));
    }
  );
};

const openProfileFromMenu = (browser) => {
  openAppMenu(browser);
  clickProfileMenuItem(browser);
  waitForProfileView(browser);
};

const closeProfileDialog = (browser) => {
  clickSingleVisible(
    browser,
    '[data-testid="dialog-profile-cancel-desktop"], [data-testid="dialog-profile-cancel-mobile"]',
    'プロフィールダイアログを閉じる'
  );
  browser.waitForElementNotPresent('#username', 10000);
};

const reopenProfileView = (browser) => {
  const base = getBaseUrl(browser).replace(/\/$/, '');
  navigateToApp(browser, `${base}/`)
    .waitForElementNotPresent('#username', 10000)
    .waitForElementVisible('[data-testid="app-menu-button"]', 10000);
  openProfileFromMenu(browser);
};

const waitForSnackbar = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const snackbar = document.querySelector('[data-testid="app-snackbar"]');
      const visible = !!(snackbar && (snackbar.offsetParent || snackbar.getClientRects().length));
      const text = snackbar ? snackbar.textContent.trim() : '';
      return { visible, text };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { visible: false, text: '' };
      if (state.visible && state.text) {
        browser.assert.ok(true, `通知が表示されています: ${state.text}`);
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, '通知が表示されませんでした。');
        return;
      }
      browser.pause(500, () => waitForSnackbar(browser, attempt + 1));
    }
  );
};

const clickExactProfileSave = (browser, { expectedControls, label }, onResult) => {
  clickSingleVisibleAfterExactControls(
    browser,
    {
      anchorSelector: '#username',
      submitSelector: '[data-testid="dialog-profile-confirm"]',
      expectedControls,
      label,
    },
    onResult
  );
};

module.exports = {
  openAppMenu,
  clickProfileMenuItem,
  waitForProfileView,
  openProfileFromMenu,
  closeProfileDialog,
  reopenProfileView,
  waitForSnackbar,
  clickExactProfileSave,
};
