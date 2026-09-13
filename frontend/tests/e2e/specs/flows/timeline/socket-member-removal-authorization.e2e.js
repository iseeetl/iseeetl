const { requireEnv } = require('../../helpers/login');
const { prepareTimelineRoom } = require('../../helpers/timeline-helpers');
const { getBaseUrl } = require('../../helpers/login');
const { resolveBackendBaseUrl } = require('../../helpers/backend-url');
const { io } = require('socket.io-client');

module.exports = {
  '旧メンバー削除イベントを送っても参加者を退出させられない': (browser) => {
    const editorMail = requireEnv('E2E_FLOOR_EDITOR_MAIL');
    const editorPassword = requireEnv('E2E_FLOOR_EDITOR_PASSWORD');
    const userMail = requireEnv('E2E_USER_MAIL');
    const userPassword = requireEnv('E2E_USER_PASSWORD');
    const stamp = String(Date.now()).slice(-6);
    const floorTitle = `E2E Socket Auth Floor ${stamp}`;
    const roomTitle = `E2E Socket Auth Room ${stamp}`;
    const state = prepareTimelineRoom(browser, {
      editorMail,
      editorPassword,
      userMail,
      userPassword,
      floorTitle,
      roomTitle,
    });

    browser.perform(() => {
      if (!state.floorId || !state.roomId) {
        browser.assert.ok(false, 'SocketのE2E用のフロアIDまたはルームIDを取得できませんでした。');
        browser.end();
        return;
      }
      const timelinePath = `/floor/${encodeURIComponent(state.floorId)}/room/${encodeURIComponent(state.roomId)}`;

      browser.perform((done) => {
        const backendBaseUrl = resolveBackendBaseUrl(getBaseUrl(browser));
        fetch(`${backendBaseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mail: userMail, password: userPassword }),
        })
          .then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }))
          .then(({ status, body }) => {
            const token = body && body.token ? String(body.token) : '';
            if (status !== 200 || !token) throw new Error('legacy-event-actor-login-failed');
            return new Promise((resolve, reject) => {
              const socket = io(backendBaseUrl, {
                query: { room_id: state.roomId, user_token: token, lang: 'ja' },
                forceNew: true,
                reconnection: false,
              });
              const timer = setTimeout(() => {
                socket.disconnect();
                reject(new Error('legacy-event-socket-timeout'));
              }, 10000);
              socket.once('connect_error', (error) => {
                clearTimeout(timer);
                socket.disconnect();
                reject(error);
              });
              socket.once('connect', () => {
                socket.emit('SEND_COMPLETE_DELETE_ROOM_MEMBER', { data: { room: state.roomId } });
                setTimeout(() => {
                  clearTimeout(timer);
                  socket.disconnect();
                  resolve();
                }, 500);
              });
            });
          })
          .then(
            () => {
              browser.assert.ok(true, '認証済みの外部Socketクライアントが旧形式のイベントを送信しました。');
              done();
            },
            (error) => {
              browser.assert.ok(false, `旧形式のイベントを送信できませんでした: ${error.message || 'unknown'}。`);
              done();
            }
          );
      });

      browser.pause(1500);
      browser.execute(
        function () {
          const connected = document.querySelector('[data-testid="timeline-connected"]');
          return {
            path: window.location.pathname || '',
            timelineVisible: !!document.querySelector('.timeline-page'),
            connectedVisible: !!(connected && (connected.offsetParent || connected.getClientRects().length)),
          };
        },
        [],
        (result) => {
          const state = result && result.value ? result.value : {};
          browser.assert.equal(state.path, timelinePath, '旧形式のイベントを受けてもタイムラインから移動しません。');
          browser.assert.ok(state.timelineVisible, '旧形式のイベントを受けてもタイムラインが表示されています。');
          browser.assert.ok(state.connectedVisible, '旧形式のイベントを受けてもタイムラインのSocket接続を維持しています。');
        }
      );
      browser.assert.urlContains(timelinePath);
      browser.end();
    });
  },
};
