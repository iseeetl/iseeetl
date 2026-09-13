const { getBaseUrl, requireEnv, navigateToApp } = require('../../helpers/login');
const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');
const { openAppMenu, openProfileFromMenu, closeProfileDialog } = require('../../helpers/profile-helpers');
const { clickSingleVisible } = require('../../helpers/dialog-focus');

const waitForPath = (browser, path) => {
  browser.executeAsync(function (expected, done) {
    const deadline = Date.now() + 10000;
    const check = () => {
      if (window.location.pathname === expected) return done(true);
      if (Date.now() >= deadline) return done(false);
      window.setTimeout(check, 50);
    };
    check();
  }, [path], (result) => browser.assert.ok(result.value, '指定した画面へ移動しました。'));
};
const back = (browser) => {
  browser.waitForElementVisible('.back-button', 10000);
  clickSingleVisible(browser, '.back-button', '画面内の戻るボタン');
};
const menu = (browser, path) => {
  openAppMenu(browser);
  clickSingleVisible(browser, `#app_menu a[href="${path}"]`, 'メニューから画面を開く');
  waitForPath(browser, path);
};
const assertRoomContext = (browser, floorId, roomId) => {
  browser.execute(function (floor, room) {
    const query = new URLSearchParams(window.location.search);
    return query.get('floor_id') === floor && query.get('room_id') === room;
  }, [floorId, roomId], (result) => browser.assert.ok(result.value, '入室先を保持しています。'));
};

module.exports = {
  '@tags': ['mail-capture-enabled'],
  '画面ごとの戻り先とアカウント操作の開始元を保持する': (browser) => {
    const base = getBaseUrl(browser).replace(/\/$/, '');
    const floorId = '000000000000000000000001';
    const roomId = '000000000000000000000002';
    browser.url(`${base}/login?floor_id=${floorId}&room_id=${roomId}`).waitForElementVisible('#password', 10000);
    for (const path of ['/terms', '/privacy', '/cookie']) {
      browser.assert.attributeEquals(`.view a[href^="${path}"]`, 'target', '_blank');
    }
    clickSingleVisible(browser, '.view a[href^="/user/sendresetpasswordlink"]', '再設定リンク送信を開く');
    waitForPath(browser, '/user/sendresetpasswordlink');
    assertRoomContext(browser, floorId, roomId);
    back(browser);
    waitForPath(browser, '/login');
    assertRoomContext(browser, floorId, roomId);
    clickSingleVisible(browser, '.view a[href^="/register"]', 'ユーザ登録を開く');
    waitForPath(browser, '/register');
    for (const path of ['/terms', '/privacy', '/cookie']) {
      browser.assert.attributeEquals(`.view a[href^="${path}"]`, 'target', '_blank');
    }
    back(browser);
    waitForPath(browser, '/login');
    assertRoomContext(browser, floorId, roomId);
    back(browser);
    waitForPath(browser, '/');
    menu(browser, '/help');
    menu(browser, '/privacy');
    back(browser);
    waitForPath(browser, '/');
    browser.back();
    waitForPath(browser, '/privacy');
    browser.forward();
    waitForPath(browser, '/');

    const stamp = Date.now();
    const state = prepareTimelineRoom(browser, {
      editorMail: requireEnv('E2E_FLOOR_EDITOR_MAIL'),
      editorPassword: requireEnv('E2E_FLOOR_EDITOR_PASSWORD'),
      userMail: requireEnv('E2E_USER_MAIL'),
      userPassword: requireEnv('E2E_USER_PASSWORD'),
      floorTitle: `E2E Back Floor ${stamp}`,
      roomTitle: `E2E Back Room ${stamp}`,
    });
    browser.perform(() => {
      clickSingleVisible(browser, '.room-header button[aria-label="ルーム一覧へ戻る"]', 'タイムラインから戻る');
      waitForPath(browser, `/floor/${state.floorId}`);
      back(browser);
      waitForPath(browser, '/');
      navigateToApp(browser, `${base}/floor/${state.floorId}`);
      waitForPath(browser, `/floor/${state.floorId}`);
      openProfileFromMenu(browser);
      clickSingleVisible(browser, '.password-change-button', 'パスワード変更を開く');
      browser.waitForElementVisible('#old-password', 10000);
      clickSingleVisible(browser, '.view a[href^="/user/sendresetpasswordlink"]', '再設定リンク送信を開く');
      waitForPath(browser, '/user/sendresetpasswordlink');
      back(browser);
      browser.waitForElementVisible('#old-password', 10000);
      back(browser);
      waitForPath(browser, `/floor/${state.floorId}`);
      browser.waitForElementVisible('#username', 10000);
      browser.execute(function () {
        const dialog = document.querySelector('#username')?.closest('[role="dialog"]');
        return Boolean(dialog && dialog.contains(document.activeElement));
      }, [], (result) => browser.assert.ok(result.value, '復帰したプロフィール内にフォーカスがあります。'));
      closeProfileDialog(browser);
      browser.execute(function () {
        return document.activeElement?.matches('[data-testid="app-profile-button"]');
      }, [], (result) => browser.assert.ok(result.value, '閉じるとプロフィールの呼び出しボタンへ戻ります。'));
      browser.end();
    });
  },
};
