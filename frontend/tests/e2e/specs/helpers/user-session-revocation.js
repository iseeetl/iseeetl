const {
  waitForTimelineReady,
  startTimelineProbe,
  readTimelineProbe,
  stopTimelineProbe,
  verifyCapturedCredentialRejected,
} = require('./e2e-public-contract');

let sessionRevocationProbeId = '';

const runAdminUserOperation = (browser, payload, label, onReady) => {
  browser.executeAsync(
    function (request, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin' });
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
        body: JSON.stringify({ mail: request.adminMail, password: request.adminPassword }),
      })
        .then(function (loginResult) {
          const login = loginResult.body || {};
          const token = login.token ? String(login.token) : '';
          if (loginResult.status !== 200 || !token) {
            done({ ok: false, stage: 'login', loginStatus: loginResult.status });
            return null;
          }

          if (request.operation === 'lookup') {
            return requestJson('/api/user/management/paginate', {
              method: 'POST',
              headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({ page: 1, search: request.search }),
            }).then(function (listResult) {
              const docs = listResult.body && Array.isArray(listResult.body.docs) ? listResult.body.docs : [];
              const user = docs.find(function (entry) {
                return entry && entry.mail === request.targetMail;
              });
              done({
                ok: listResult.status === 200 && !!user,
                stage: 'lookup',
                loginStatus: loginResult.status,
                requestStatus: listResult.status,
                user: user
                  ? {
                      _id: String(user._id),
                      username: user.username,
                      mail: user.mail,
                      role: user.role,
                      delete_flg: user.delete_flg === true,
                    }
                  : null,
              });
              return null;
            });
          }

          if (request.operation === 'post') {
            return requestJson(`/api/rooms/${request.roomId}/timeline/posts`, {
              method: 'POST',
              headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                content: request.content,
                lang: login.lang || 'ja',
              }),
            }).then(function (postResult) {
              done({
                ok: postResult.status === 201,
                stage: 'post',
                loginStatus: loginResult.status,
                requestStatus: postResult.status,
              });
              return null;
            });
          }

          return requestJson('/api/user/management/update', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              _id: request.user._id,
              username: request.user.username,
              mail: request.user.mail,
              role: request.user.role,
              delete_flg: request.deleteFlg,
            }),
          }).then(function (updateResult) {
            done({
              ok: updateResult.status === 200 && updateResult.body?.delete_flg === request.deleteFlg,
              stage: request.deleteFlg ? 'delete' : 'restore',
              loginStatus: loginResult.status,
              requestStatus: updateResult.status,
            });
            return null;
          });
        })
        .catch(function (error) {
          done({
            ok: false,
            stage: 'request',
            error: error && error.message ? error.message : 'request-failed',
          });
        });
    },
    [payload],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result' };
      browser.assert.ok(
        state.ok,
        `${label} (stage=${state.stage || 'unknown'}, login=${state.loginStatus || 0}, request=${
          state.requestStatus || 0
        }, error=${state.error || 'none'}).`
      );
      onReady(state.ok === true, state);
    }
  );
};

const loadManagedUser = (browser, { admin, targetMail }, onReady) => {
  runAdminUserOperation(
    browser,
    {
      operation: 'lookup',
      adminMail: admin.mail,
      adminPassword: admin.password,
      targetMail,
      search: targetMail.slice(0, 20),
    },
    '管理対象ユーザの検索に成功',
    (ok, state) => onReady(ok ? state.user : null)
  );
};

const setManagedUserDeleted = (browser, { admin, user, deleteFlg }, onReady) => {
  runAdminUserOperation(
    browser,
    {
      operation: 'update',
      adminMail: admin.mail,
      adminPassword: admin.password,
      user,
      deleteFlg,
    },
    deleteFlg ? '管理対象ユーザの論理削除に成功' : '管理対象ユーザの復元に成功',
    onReady
  );
};

const createAdminRoomPost = (browser, { admin, floorId, floorTitle, roomId, roomTitle, content }, onReady) => {
  runAdminUserOperation(
    browser,
    {
      operation: 'post',
      adminMail: admin.mail,
      adminPassword: admin.password,
      floorId,
      floorTitle,
      roomId,
      roomTitle,
      content,
    },
    'ユーザ削除後のテスト用投稿の作成に成功',
    onReady
  );
};

const installUserSessionRevocationProbe = (browser, onReady) => {
  if (sessionRevocationProbeId) stopTimelineProbe(browser, sessionRevocationProbeId);
  waitForTimelineReady(browser, {}, (ready) => {
    browser.assert.ok(ready, '論理削除前に管理対象ユーザのSocketが接続されています。');
    if (!ready) return onReady(false);
    startTimelineProbe(browser, 'session-revoked', (id) => {
      sessionRevocationProbeId = id;
      onReady(Boolean(id));
    });
  });
};

const verifyRevokedSocketDidNotReceivePost = (browser, _content, onReady) => {
  browser.pause(500, () => {
    readTimelineProbe(browser, sessionRevocationProbeId, (state) => {
      browser.assert.ok(Boolean(state && state.found), '後続の投稿後もユーザセッションの監視を利用できます。');
      browser.assert.ok(!Boolean(state && state.connected), '失効したユーザのSocketは切断されたままです。');
      browser.assert.equal(Number(state && state.postCreateCount), 0, '失効したユーザのSocketは、その後のルームの投稿を受信していません。');
      onReady(Boolean(state && state.found && !state.connected && Number(state.postCreateCount) === 0));
    });
  });
};

const waitForSessionRevocation = (browser, attempt = 0, onReady) => {
  const maxAttempts = 30;
  readTimelineProbe(browser, sessionRevocationProbeId, (probe) => {
    browser.execute(
    function () {
      let isLogin = true;
      let hasToken = true;
      try {
        const raw = localStorage.getItem('iseeetl_store');
        const saved = raw ? JSON.parse(raw) : null;
        isLogin = !!(saved && saved.user && saved.user.isLogin);
        hasToken = !!(saved && saved.user && saved.user.token);
      } catch (_) {
        isLogin = true;
        hasToken = true;
      }
      return {
        path: window.location ? window.location.pathname || '' : '',
        timelineVisible: !!document.querySelector('.timeline-page'),
        isLogin,
        hasToken,
      };
    },
    [],
    (result) => {
      const page = result && result.value ? result.value : {};
      const completed =
        probe && probe.found && probe.eventCount > 0 && probe.disconnected && !probe.connected &&
        page.path === '/login' && !page.timelineVisible && !page.isLogin && !page.hasToken;

      if (completed || attempt >= maxAttempts) {
        browser.assert.ok(Boolean(probe && probe.found), 'ログアウト後もユーザセッションの監視を利用できます。');
        browser.assert.ok(Boolean(probe && probe.eventCount > 0), '管理対象ユーザがSESSION_REVOKEDを受信しました。');
        browser.assert.ok(Boolean(probe && probe.disconnected), '管理対象ユーザのSocketが切断されました。');
        browser.assert.ok(!Boolean(probe && probe.connected), '管理対象ユーザのSocketは切断されたままです。');
        browser.assert.equal(page.path, '/login', '管理対象ユーザがログイン画面へ移動しました。');
        browser.assert.ok(!page.timelineVisible, '管理対象ユーザにはタイムラインが表示されていません。');
        browser.assert.ok(!page.isLogin && !page.hasToken, '管理対象ユーザのログイン状態とJWTを削除しました。');
        onReady(completed);
        return;
      }

      browser.pause(500, () => waitForSessionRevocation(browser, attempt + 1, onReady));
    }
    );
  });
};

const verifyOldSessionRejected = (browser, phase, onReady) => {
  verifyCapturedCredentialRejected(browser, sessionRevocationProbeId, (state) => {
    const completed = Boolean(
      state && state.found && state.socketRejected && state.httpChecked && state.httpRejected && !state.reconnected
    );
    browser.assert.ok(Boolean(state && state.httpRejected), `${phase}中に古いJWTが拒否されました。`);
    browser.assert.ok(Boolean(state && state.socketRejected), `${phase}中に古いSocketの再接続が拒否されました。`);
    browser.assert.ok(!Boolean(state && state.reconnected), `${phase}中に古いSocketは再接続しませんでした。`);
    if (phase === 'restored') {
      stopTimelineProbe(browser, sessionRevocationProbeId);
      sessionRevocationProbeId = '';
    }
    onReady(completed);
  });
};

const closeUserSessionRevocationProbe = (browser) => {
  if (!sessionRevocationProbeId) return;
  stopTimelineProbe(browser, sessionRevocationProbeId);
  sessionRevocationProbeId = '';
};

module.exports = {
  loadManagedUser,
  setManagedUserDeleted,
  createAdminRoomPost,
  installUserSessionRevocationProbe,
  waitForSessionRevocation,
  verifyRevokedSocketDidNotReceivePost,
  verifyOldSessionRejected,
  closeUserSessionRevocationProbe,
};
