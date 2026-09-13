const { getBaseUrl } = require('../../helpers/login');
const { clearBrowserSession } = require('../../helpers/auth-security');
const { sendKeysToActiveElement } = require('../../helpers/dialog-focus');
const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');
const {
  openAppMenu,
  clickProfileMenuItem,
  closeProfileDialog,
  waitForProfileView,
} = require('../../helpers/profile-helpers');

const closeMenu = (browser) => {
  browser
    .waitForElementVisible('[data-testid="app-menu-close"]', 10000)
    .click('[data-testid="app-menu-close"]')
    .pause(300);
};

const waitForMenuClosed = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      const menu = document.querySelector('#app_menu');
      return { closed: !menu };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { closed: false };
      if (state.closed) {
        browser.assert.ok(true, 'アプリメニューが閉じました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `アプリメニューが閉じていません: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(300, () => waitForMenuClosed(browser, attempt + 1));
    }
  );
};

const waitForLoginState = (browser, attempt = 0) => {
  const maxAttempts = 10;
  browser.execute(
    function () {
      return {
        isLogin: !!document.querySelector('[data-testid="app-menu-button"]') && !document.querySelector('#mail'),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { isLogin: false };
      if (state.isLogin) {
        browser.assert.ok(true, 'ログイン状態を確認しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ログイン状態を確認できませんでした。');
        return;
      }
      browser.pause(500, () => waitForLoginState(browser, attempt + 1));
    }
  );
};

const waitForLogoutState = (browser, attempt = 0) => {
  const maxAttempts = 20;
  browser.execute(
    function () {
      let loggedIn = false;
      try {
        const persisted = JSON.parse(window.localStorage.getItem('iseeetl_store') || '{}');
        loggedIn = persisted && persisted.user ? persisted.user.isLogin === true : false;
      } catch (_) {
        loggedIn = false;
      }
      return {
        isLogin: loggedIn,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { isLogin: true };
      if (!state.isLogin) {
        browser.assert.ok(true, 'ログアウト状態を確認しました。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, 'ログアウト状態を確認できませんでした。');
        return;
      }
      browser.pause(300, () => waitForLogoutState(browser, attempt + 1));
    }
  );
};

const clickLogoutMenuItem = (browser) => {
  browser.execute(
    function () {
      const target = document.querySelector('[data-testid="app-menu-logout"]');
      if (!target) return { clicked: false, reason: 'item-not-found' };
      target.click();
      return { clicked: true };
    },
    [],
    (result) => {
      const clicked = result && result.value ? result.value.clicked : false;
      if (!clicked) {
        const reason = result && result.value ? result.value.reason : 'unknown';
        browser.assert.ok(false, `ログアウト項目をクリックできませんでした: ${reason}`);
      }
    }
  );
};

const assertMenuKeyboardFocusRing = (browser) => {
  browser.perform((done) => {
    sendKeysToActiveElement(browser, browser.Keys.TAB, (keyState) => {
      if (!keyState.ok) {
        browser.assert.ok(false, `フォーカス中のアプリメニューの操作要素へTabキーを送れませんでした: ${keyState.reason}`);
        done();
        return;
      }

      browser.pause(100, () => {
        browser.execute(
          function () {
            const menu = document.querySelector('#app_menu');
            const active = document.activeElement;
            const style = active ? window.getComputedStyle(active) : null;
            return {
              activeWithinMenu: !!(menu && active && menu.contains(active)),
              outlineWidth: style ? style.outlineWidth : '',
              outlineStyle: style ? style.outlineStyle : '',
              outlineOffset: style ? style.outlineOffset : '',
              outlineColor: style ? style.outlineColor : '',
            };
          },
          [],
          (result) => {
            const state = result && result.value ? result.value : {};
            const expectedColors = ['rgb(0, 90, 255)', 'rgba(0, 90, 255, 1)', '#005aff'];
            browser.assert.ok(state.activeWithinMenu, 'Tabキーでアプリメニューの操作要素へフォーカスが移ります。');
            browser.assert.equal(state.outlineWidth, '2px', 'アプリメニューのフォーカス枠の太さは2pxです。');
            browser.assert.equal(state.outlineStyle, 'solid', 'アプリメニューのフォーカス枠は実線です。');
            browser.assert.equal(state.outlineOffset, '2px', 'アプリメニューのフォーカス枠のオフセットは2pxです。');
            browser.assert.ok(
              expectedColors.includes(String(state.outlineColor || '').toLowerCase()),
              `アプリメニューのフォーカス枠の色が#005affと同じです: ${state.outlineColor || 'missing'}`
            );
            done();
          }
        );
      });
    });
  });
};

module.exports = {
  'ゲストのアプリメニューにログインを表示する': (browser) => {
    const base = getBaseUrl(browser);
    clearBrowserSession(browser);
    browser.url(base).waitForElementVisible('body', 10000);

    openAppMenu(browser);
    assertMenuKeyboardFocusRing(browser);
    browser.waitForElementVisible('[data-testid="app-menu-login"]', 10000);
    closeMenu(browser);

    browser.end();
  },

  'アプリメニューからプロフィールを開き、ログアウトできる': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const mail = process.env.E2E_USER_MAIL || '';
    const password = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !mail || !password) {
      browser.assert.ok(false, 'アプリメニューのテストに失敗しました。必須の認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E App Menu Floor ${stamp}`;
    const roomTitle = `E2E App Menu Room ${stamp}`;

    prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail: mail,
      userPassword: password,
      floorTitle,
      roomTitle,
    });

    waitForLoginState(browser);

    openAppMenu(browser);
    clickProfileMenuItem(browser);
    waitForProfileView(browser);
    waitForMenuClosed(browser);
    closeProfileDialog(browser);

    openAppMenu(browser);
    clickLogoutMenuItem(browser);
    waitForLogoutState(browser);
    openAppMenu(browser);
    browser.waitForElementVisible('[data-testid="app-menu-login"]', 10000);
    closeMenu(browser);

    browser.end();
  },
};
