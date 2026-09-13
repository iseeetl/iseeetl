const { getBaseUrl, loginToTimeline, navigateToApp } = require('../../helpers/login');
const { prepareFloorRoom } = require('../../helpers/timeline-helpers');

const openRoomList = (browser, floorId) => {
  const base = getBaseUrl(browser);
  const url = `${base.replace(/\/$/, '')}/floor/${encodeURIComponent(floorId)}`;
  navigateToApp(browser, url).waitForElementVisible('.room-list', 10000);
};

const clickRoomLink = (browser, roomId) => {
  const selector = `a[href*="/room/${roomId}"]`;
  browser.waitForElementVisible(selector, 10000).click(selector);
};

module.exports = {
  'ルーム一覧からタイムラインへ移動できる': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'ルーム一覧からタイムラインへの遷移テストをスキップします。認証情報が未設定です。');
      browser.end();
      return;
    }

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Room To Timeline Floor ${stamp}`;
    const roomTitle = `E2E Room To Timeline Room ${stamp}`;

    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
      logoutAfter: true,
    });

    browser.perform((done) => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'ルーム一覧からタイムラインへの遷移テストの準備に失敗しました。フロアIDまたはルームIDを取得できませんでした。');
        done();
        return;
      }

      loginToTimeline(browser, {
        mail: userMail,
        password: userPassword,
        floorId: state.floorId,
        roomId: state.roomId,
        waitForConnected: false,
      });

      openRoomList(browser, state.floorId);
      clickRoomLink(browser, state.roomId);
      browser.waitForElementVisible('.timeline-page', 60000);
      browser.waitForElementPresent('[data-testid="timeline-connected"]', 60000);
      browser.assert.urlContains(`/floor/${state.floorId}/room/${state.roomId}`);
      done();
    });

    browser.end();
  },
};
