const {
  installSocketRevocationProbe,
  waitForReconnectRejected,
} = require('./socket-access-revocation');

const installKickedUserSocketProbe = (browser, targetCredentials, onReady) => {
  browser.executeAsync(
    function (credentials, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin', userId: '' });
        return;
      }
      const origin = window.location.origin;
      fetch(`${origin}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credentials),
      })
        .then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }))
        .then(({ status, body }) => done({ ok: status === 200 && !!body?.user_id, userId: body?.user_id || '' }))
        .catch(() => done({ ok: false, userId: '' }));
    },
    [{ mail: targetCredentials.mail, password: targetCredentials.password }],
    (result) => {
      const targetUserId = result && result.value && result.value.ok ? String(result.value.userId || '') : '';
      browser.assert.ok(Boolean(targetUserId), 'ログインAPIからキック対象のテスト用ユーザIDを取得しました。');
      if (!targetUserId) {
        onReady('');
        return;
      }
      installSocketRevocationProbe(browser, 'キックされたユーザ', (ready) => onReady(ready ? targetUserId : ''));
    }
  );
};

const waitForKickedReconnectRejected = (browser, _attempt = 0, onReady) => {
  waitForReconnectRejected(browser, 'キックされたユーザ', 0, onReady);
};

const runAuthenticatedRequestsThroughApi = (browser, { actorMail, actorPassword, requests, label }, onReady) => {
  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin', requestStatuses: [] });
        return;
      }
      const origin = window.location.origin;

      const requestJson = function (path, options) {
        return fetch(`${origin}${path}`, options).then(function (response) {
          return response
            .json()
            .catch(function () {
              return null;
            })
            .then(function (body) {
              return { status: response.status, body };
            });
        });
      };

      requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mail: payload.actorMail, password: payload.actorPassword }),
      })
        .then(function (loginResult) {
          const token = loginResult.body && loginResult.body.token ? String(loginResult.body.token) : '';
          if (loginResult.status !== 200 || !token) {
            done({ ok: false, stage: 'login', loginStatus: loginResult.status, requestStatuses: [] });
            return null;
          }

          const requestStatuses = [];
          return payload.requests
            .reduce(function (chain, request) {
              return chain.then(function () {
                return requestJson(request.path, {
                  method: request.method || 'POST',
                  headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(request.body || {}),
                }).then(function (requestResult) {
                  requestStatuses.push(requestResult.status);
                });
              });
            }, Promise.resolve())
            .then(function () {
              done({
                ok:
                  requestStatuses.length === payload.requests.length &&
                  requestStatuses.every((status) => status === 200),
                stage: 'requests',
                loginStatus: loginResult.status,
                requestStatuses,
              });
              return null;
            });
        })
        .catch(function (error) {
          done({
            ok: false,
            stage: 'request',
            requestStatuses: [],
            error: error && error.message ? error.message : 'request-failed',
          });
        });
    },
    [{ actorMail, actorPassword, requests }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result', requestStatuses: [] };
      browser.assert.ok(
        state.ok,
        `${label} (stage=${state.stage || 'unknown'}, login=${state.loginStatus || 0}, requests=${
          Array.isArray(state.requestStatuses) ? state.requestStatuses.join(',') : ''
        }, error=${state.error || 'none'}).`
      );
      onReady(state.ok === true, state);
    }
  );
};

const waitForKickedRoomRedirect = (browser, attempt = 0, onReady) => {
  const maxAttempts = 30;
  browser.execute(
    function () {
      return {
        path: window.location ? window.location.pathname || '' : '',
        timelineVisible: !!document.querySelector('.timeline-page'),
      };
    },
    [],
    (result) => {
      const state = result && result.value ? result.value : { path: '', timelineVisible: true };
      const completed = state.path === '/' && !state.timelineVisible;
      if (completed || attempt >= maxAttempts) {
        browser.assert.equal(state.path, '/', 'キックされたユーザがフロア一覧へ移動しました。');
        browser.assert.ok(!state.timelineVisible, 'キックされたユーザは同じフロアの別ルームにも入れません。');
        onReady(completed);
        return;
      }
      browser.pause(500, () => waitForKickedRoomRedirect(browser, attempt + 1, onReady));
    }
  );
};

module.exports = {
  installKickedUserSocketProbe,
  waitForKickedReconnectRejected,
  runAuthenticatedRequestsThroughApi,
  waitForKickedRoomRedirect,
};
