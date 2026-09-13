const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');
const {
  waitForPostCount,
  disconnectTimelineSocket,
  reconnectTimelineSocket,
  armPostCreateProbe,
  waitForPostCreateProbe,
  captureTimelineSocketState,
} = require('../../helpers/timeline-two-client');
const { createTimelinePostByApiActor } = require('../../helpers/timeline-api-actor');

module.exports = {
  'タイムラインの再接続で未受信の投稿を取得し、新しい投稿作成イベントを受信する': (browser) => {
    const editorMail = process.env.E2E_FLOOR_EDITOR_MAIL || '';
    const editorPassword = process.env.E2E_FLOOR_EDITOR_PASSWORD || '';
    const userMail = process.env.E2E_USER_MAIL || '';
    const userPassword = process.env.E2E_USER_PASSWORD || '';

    if (!editorMail || !editorPassword || !userMail || !userPassword) {
      browser.assert.ok(false, 'タイムラインの再接続のE2Eには、手順書に記載された4項目すべての認証情報が必要です。');
      browser.end();
      return;
    }

    browser.assert.ok(editorMail !== userMail, 'タイムラインを監視するユーザとAPIを操作するユーザは別のアカウントです。');

    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Reconnect Floor ${stamp}`;
    const roomTitle = `E2E Reconnect Room ${stamp}`;
    const disconnectedText = `E2E Reconnect Missed ${stamp}`;
    const reconnectedText = `E2E Reconnect Live ${stamp}`;
    const state = prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
    });
    let finished = false;
    let socketBeforeDisconnectId = '';
    let roomSizeBeforeDisconnect = 0;

    const finish = () => {
      if (finished) return;
      finished = true;
      browser.end();
    };

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'タイムラインの再接続のE2E用のフロアIDまたはルームIDを取得できませんでした。');
        finish();
        return;
      }

      browser
        .waitForElementVisible('.timeline-page', 20000)
        .waitForElementPresent('[data-testid="timeline-connected"]', 20000);

      captureTimelineSocketState(browser, '切断前のタイムライン', (socketState) => {
        socketBeforeDisconnectId = socketState.socketId;
        roomSizeBeforeDisconnect = socketState.roomSize;
      });
      disconnectTimelineSocket(browser);

      createTimelinePostByApiActor(
        browser,
        {
          actorMail: editorMail,
          actorPassword: editorPassword,
          floorId: state.floorId,
          floorTitle,
          roomId: state.roomId,
          roomTitle,
          content: disconnectedText,
        },
        'タイムラインのSocket切断中に作成した投稿'
      );

      reconnectTimelineSocket(browser);
      captureTimelineSocketState(browser, '再接続後のタイムライン', (socketState) => {
        browser.assert.ok(
          socketState.socketId !== socketBeforeDisconnectId,
          '再接続後にタイムラインが新しいSocket IDを取得しました。'
        );
        browser.assert.ok(socketState.roomSize >= 1, '再接続後にタイムラインの参加者数が復元されました。');
        browser.assert.equal(
          socketState.roomSize,
          roomSizeBeforeDisconnect,
          'タイムラインの参加者数が切断前の値と一致しました。'
        );
      });
      waitForPostCount(browser, disconnectedText, 1, '初回取得により、切断中の投稿がタイムラインに復元されたことを確認');

      armPostCreateProbe(browser, reconnectedText, '再接続後のタイムライン');
      createTimelinePostByApiActor(
        browser,
        {
          actorMail: editorMail,
          actorPassword: editorPassword,
          floorId: state.floorId,
          floorTitle,
          roomId: state.roomId,
          roomTitle,
          content: reconnectedText,
        },
        'タイムラインのSocket再接続後に作成した投稿'
      );
      waitForPostCreateProbe(browser, '再接続後のタイムライン');
      waitForPostCount(browser, reconnectedText, 1, '新しいSocketでタイムラインがPOST_CREATEを受信したことを確認');
      finish();
    });
  },
};
