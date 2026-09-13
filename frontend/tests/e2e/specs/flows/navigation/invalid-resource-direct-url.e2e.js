const {
  getBaseUrl,
  navigateDirectToApp,
  requireEnv,
  waitForAppBootstrap,
} = require('../../helpers/login');
const { prepareFloorRoom, deleteTimelineRoomThroughUi } = require('../../helpers/timeline-helpers');

const INVALID_FLOOR_ID = 'fffffffffffffffffffffff1';
const INVALID_ROOM_ID = 'fffffffffffffffffffffff2';
const INVALID_POST_ID = 'fffffffffffffffffffffff3';

const readFeedback = (browser, callback) => {
  browser.execute(
    function () {
      const snackbar = document.querySelector('[data-testid="app-snackbar"] span');
      const alert = document.querySelector('.screen-reader-only[role="alert"]');
      const timelineError = document.querySelector('[data-testid="timeline-initialization-error"]');
      return {
        path: window.location.pathname,
        pendingError: timelineError && timelineError.textContent ? timelineError.textContent.trim() : '',
        snackbarMessage: snackbar ? snackbar.textContent.trim() : '',
        alertMessage: alert ? alert.textContent.trim() : '',
      };
    },
    [],
    (result) => callback(result && result.value ? result.value : {})
  );
};

const waitForFeedback = (browser, label, predicate, attempt = 0) => {
  const maxAttempts = 30;
  readFeedback(browser, (state) => {
    if (predicate(state)) {
      browser.assert.ok(true, `${label}: エラー表示を確認しました。`);
      return;
    }
    if (attempt >= maxAttempts) {
      browser.assert.ok(false, `${label}: エラー表示を確認できませんでした: ${JSON.stringify(state)}`);
      return;
    }
    browser.pause(500, () => waitForFeedback(browser, label, predicate, attempt + 1));
  });
};

const waitForInvalidRoomState = (browser, expectedPath, attempt = 0) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      const title = document.querySelector('#timeline-room-title');
      const connected = document.querySelector('[data-testid="timeline-connected"]');
      return {
        path: window.location.pathname,
        roomTitle: title && title.textContent ? title.textContent.trim() : '',
        connected: !!connected,
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (state.path === expectedPath && !state.roomTitle && !state.connected) {
        browser.assert.ok(true, '存在しないルームではタイムラインが初期化されず、接続も行われません。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `無効なルームの状態が確定しませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForInvalidRoomState(browser, expectedPath, attempt + 1));
    }
  );
};

const waitForInvalidPostState = (browser, expectedPath, roomTitle, attempt = 0) => {
  const maxAttempts = 40;
  browser.execute(
    function (expectedRoomTitle, invalidPostId) {
      const title = document.querySelector('#timeline-room-title');
      const connected = document.querySelector('[data-testid="timeline-connected"]');
      const invalidPost = document.getElementById(`timeline_${invalidPostId}`);
      return {
        path: window.location.pathname,
        roomTitle: title && title.textContent ? title.textContent.trim() : '',
        connected: !!connected,
        invalidPostVisible: !!invalidPost,
      };
    },
    [roomTitle, INVALID_POST_ID],
    (result) => {
      const state = result && result.value ? result.value : {};
      if (
        state.path === expectedPath &&
        state.roomTitle === roomTitle &&
        state.connected &&
        !state.invalidPostVisible
      ) {
        browser.assert.ok(true, '存在しない投稿を開いても、有効なルームのタイムラインを置き換えません。');
        return;
      }
      if (attempt >= maxAttempts) {
        browser.assert.ok(false, `無効な投稿の状態が確定しませんでした: ${JSON.stringify(state)}`);
        return;
      }
      browser.pause(500, () => waitForInvalidPostState(browser, expectedPath, roomTitle, attempt + 1));
    }
  );
};

module.exports = {
  '存在しないフロアやルームのURLでは対象を表示しない': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Invalid URL Floor ${stamp}`;
    const roomTitle = `E2E Invalid URL Room ${stamp}`;
    const base = getBaseUrl(browser).replace(/\/$/, '');
    const state = prepareFloorRoom(browser, {
      editorMail,
      editorPassword,
      floorTitle,
      roomTitle,
      logoutAfter: false,
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, '無効なリソースのテストデータを取得できませんでした。');
        browser.end();
        return;
      }

      navigateDirectToApp(browser, `${base}/floor/${INVALID_FLOOR_ID}`);
      waitForAppBootstrap(browser, '存在しないフロアのURLを直接開いたときの初期化');
      browser.waitForElementVisible('body', 10000);
      waitForFeedback(
        browser,
        '存在しないフロア',
        (feedback) =>
          feedback.path === '/' && !!(feedback.snackbarMessage || feedback.alertMessage || feedback.pendingError)
      );

      const invalidRoomPath = `/floor/${state.floorId}/room/${INVALID_ROOM_ID}`;
      navigateDirectToApp(browser, `${base}${invalidRoomPath}`);
      waitForAppBootstrap(browser, '存在しないルームのURLを直接開いたときの初期化');
      browser.waitForElementVisible('.timeline-page', 20000);
      waitForFeedback(browser, '存在しないルーム', (feedback) => !!feedback.pendingError);
      waitForInvalidRoomState(browser, invalidRoomPath);

      const invalidPostPath = `/floor/${state.floorId}/room/${state.roomId}/post/${INVALID_POST_ID}`;
      navigateDirectToApp(browser, `${base}${invalidPostPath}`);
      waitForAppBootstrap(browser, '存在しない投稿のURLを直接開いたときの初期化');
      browser.waitForElementVisible('.timeline-page', 20000);
      waitForFeedback(browser, '存在しない投稿', (feedback) => !!(feedback.snackbarMessage || feedback.alertMessage));
      waitForInvalidPostState(browser, invalidPostPath, roomTitle);

      deleteTimelineRoomThroughUi(browser, {
        editorMail,
        editorPassword,
        state,
        floorTitle,
        roomTitle,
      });

      browser.perform(() => {
        navigateDirectToApp(browser, `${base}/floor/${state.floorId}`);
        waitForAppBootstrap(browser, '削除済みのフロアのURLを直接開いたときの初期化');
        browser.waitForElementVisible('body', 10000);
        waitForFeedback(
          browser,
          '論理削除済みのフロア',
          (feedback) =>
            feedback.path === '/' && !!(feedback.snackbarMessage || feedback.alertMessage || feedback.pendingError)
        );

        const deletedRoomPath = `/floor/${state.floorId}/room/${state.roomId}`;
        navigateDirectToApp(browser, `${base}${deletedRoomPath}`);
        waitForAppBootstrap(browser, '削除済みのルームのURLを直接開いたときの初期化');
        browser.waitForElementVisible('.timeline-page', 20000);
        waitForFeedback(browser, '論理削除済みのルーム', (feedback) => !!feedback.pendingError);
        waitForInvalidRoomState(browser, deletedRoomPath);
        browser.end();
      });
    });
  },
};
