const {
  readSessionSummary,
  waitForTimelineReady,
  startTimelineProbe,
  readTimelineProbe,
  stopTimelineProbe,
  openSecondaryTimelineConnection,
  readSecondaryTimelineConnection,
  closeSecondaryTimelineConnection,
  verifyCapturedCredentialRejected,
} = require('./e2e-public-contract');

let roleDowngradeProbeId = '';
let publicConnectionId = '';
let publicInitialConnectionId = '';

const waitForProbeReady = (browser, attempt, onReady) => {
  const maxAttempts = 30;
  readTimelineProbe(browser, roleDowngradeProbeId, (probe) => {
    const ready = Boolean(probe && probe.found && probe.connected);

    if (ready || attempt >= maxAttempts) {
      browser.assert.ok(Boolean(probe && probe.found), '権限変更時のSocketの監視を設定しました。');
      browser.assert.ok(Boolean(probe && probe.connected), 'フロア編集ユーザがメンバー限定ルームに接続されています。');
      onReady(ready);
      return;
    }

    browser.pause(500, () => waitForProbeReady(browser, attempt + 1, onReady));
  });
};

const installRoleDowngradeProbe = (browser, { publicRoomId }, onReady) => {
  waitForTimelineReady(browser, {}, (ready) => {
    browser.assert.ok(ready, '権限を下げる前にフロア編集ユーザがメンバー限定ルームに接続されています。');
    if (!ready) return onReady(false);
    startTimelineProbe(browser, 'access-revoked', (id) => {
      roleDowngradeProbeId = id;
      waitForProbeReady(browser, 0, (privateReady) => {
        if (!privateReady) {
          onReady(false);
          return;
        }
        openSecondaryTimelineConnection(browser, publicRoomId, (connectionId) => {
          publicConnectionId = connectionId;
          const waitForPublicConnection = (attempt = 0) => {
            readSecondaryTimelineConnection(browser, publicConnectionId, (publicState) => {
              const connected = Boolean(
                publicState && publicState.found && publicState.connected && publicState.connectionId
              );
              if (connected || attempt >= 20) {
                browser.assert.ok(connected, '権限を下げる前にフロア編集ユーザの公開ルームのSocketが接続されています。');
                publicInitialConnectionId = connected ? publicState.connectionId : '';
                onReady(connected);
                return;
              }
              browser.pause(250, () => waitForPublicConnection(attempt + 1));
            });
          };
          waitForPublicConnection();
        });
      });
    });
  });
};

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
          const token = loginResult.body && loginResult.body.token ? String(loginResult.body.token) : '';
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
              role: request.role,
              delete_flg: request.user.delete_flg,
            }),
          }).then(function (updateResult) {
            done({
              ok: updateResult.status === 200 && updateResult.body && updateResult.body.role === request.role,
              stage: 'update',
              loginStatus: loginResult.status,
              requestStatus: updateResult.status,
              role: updateResult.body && updateResult.body.role ? updateResult.body.role : '',
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

const loadTargetEditor = (browser, { admin, targetMail }, onReady) => {
  runAdminUserOperation(
    browser,
    {
      operation: 'lookup',
      adminMail: admin.mail,
      adminPassword: admin.password,
      targetMail,
      search: targetMail.slice(0, 20),
    },
    '対象のフロア編集ユーザの検索に成功',
    (ok, state) => onReady(ok ? state.user : null)
  );
};

const setTargetUserRole = (browser, { admin, user, role }, onReady) => {
  runAdminUserOperation(
    browser,
    {
      operation: 'update',
      adminMail: admin.mail,
      adminPassword: admin.password,
      user,
      role,
    },
    `対象ユーザの権限を${role}へ変更`,
    onReady
  );
};

const verifyDowngradedRestAccess = (browser, { floorId, privateRoomId }, onReady) => {
  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin' });
        return;
      }
      const origin = window.location.origin;

      const requestJson = function (path, body, token) {
        return fetch(`${origin}${path}`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        }).then(function (response) {
          return response
            .json()
            .catch(function () {
              return null;
            })
            .then(function (responseBody) {
              return { status: response.status, body: responseBody };
            });
        });
      };

      let token = '';
      try {
        const raw = localStorage.getItem('iseeetl_store');
        const store = raw ? JSON.parse(raw) : null;
        token = store && store.user && store.user.token ? String(store.user.token) : '';
      } catch (_) {
        token = '';
      }
      if (!token) {
        done({ ok: false, stage: 'active-session-token' });
        return;
      }

      Promise.all([
        requestJson('/api/chat/role', { floor_id: payload.floorId, room_id: payload.privateRoomId }, token),
        requestJson('/api/kickeduser', { floor_id: payload.floorId }, token),
      ])
        .then(function (results) {
          const roleResult = results[0];
          const editorOnlyResult = results[1];
          done({
            ok: true,
            roleStatus: roleResult.status,
            currentRole: roleResult.body && roleResult.body.role ? roleResult.body.role : '',
            editorOnlyStatus: editorOnlyResult.status,
            editorOnlyCode:
              editorOnlyResult.body && editorOnlyResult.body.error ? editorOnlyResult.body.error.code || '' : '',
          });
        })
        .catch(function (error) {
          done({ ok: false, stage: 'request', error: error && error.message ? error.message : 'request-failed' });
        });
    },
    [{ floorId, privateRoomId }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result' };
      const passed =
        state.ok &&
        state.roleStatus === 200 &&
        state.currentRole === 'Author' &&
        state.editorOnlyStatus === 401 &&
        state.editorOnlyCode === 'INVALID_PERMISSION';
      browser.assert.equal(state.roleStatus, 200, '権限変更前のセッションで通常のAPIを利用できます。');
      browser.assert.equal(state.currentRole, 'Author', '権限変更前のJWTが、現在の投稿者の権限で再評価されます。');
      browser.assert.equal(state.editorOnlyStatus, 401, '権限変更前のセッションでフロア編集ユーザ専用APIを利用できません。');
      browser.assert.equal(
        state.editorOnlyCode,
        'INVALID_PERMISSION',
        'フロア編集ユーザ専用APIが現在の投稿者の権限を権限エラーとして拒否しました。'
      );
      onReady(passed);
    }
  );
};

const waitForSocketAccessUpdate = (browser, expectedPath, attempt, onReady) => {
  const maxAttempts = 30;
  readTimelineProbe(browser, roleDowngradeProbeId, (probe) => {
    readSessionSummary(browser, (session) => {
      browser.execute(
        function () {
          return {
            path: window.location.pathname || '',
            timelineVisible: !!document.querySelector('.timeline-page'),
          };
        },
        [],
        (result) => {
          const page = result && result.value ? result.value : {};
          const completed = Boolean(
            probe && probe.found && probe.eventCount > 0 && probe.disconnected && !probe.connected &&
            session && session.role === 'Author' && page.path === expectedPath
          );
          if (completed || attempt >= maxAttempts) {
            browser.assert.ok(Boolean(probe && probe.found), '権限変更時のSocketの監視を引き続き利用できます。');
            browser.assert.ok(Boolean(probe && probe.eventCount > 0), 'メンバー限定ルームのSocketがアクセス失効を受信しました。');
            browser.assert.ok(Boolean(probe && probe.disconnected), 'メンバー限定ルームのSocketが切断されました。');
            browser.assert.ok(!Boolean(probe && probe.connected), 'メンバー限定ルームのSocketは切断されたままです。');
            browser.assert.equal(page.path, expectedPath, '権限が下がったユーザがルーム一覧へ移動しました。');
            browser.assert.ok(!page.timelineVisible, 'アクセスできなくなったメンバー限定ルームのタイムラインが非表示です。');
            browser.assert.equal(session && session.role, 'Author', '現在のセッションに投稿者の権限が反映されています。');
            if (!completed) {
              onReady(false);
              return;
            }
            const waitForExistingPublicConnection = (publicAttempt = 0) => {
              readSecondaryTimelineConnection(browser, publicConnectionId, (publicState) => {
                const preserved = Boolean(
                  publicState &&
                    publicState.found &&
                    publicState.connected &&
                    publicState.connectionId &&
                    publicState.connectionId === publicInitialConnectionId
                );
                if (preserved || publicAttempt >= 20) {
                  browser.assert.ok(preserved, '権限変更前の公開ルームのSocketが接続を維持しています。');
                  browser.assert.equal(
                    publicState && publicState.connectionId,
                    publicInitialConnectionId,
                    '権限変更後も公開ルームのSocketは同じ接続を維持しています。'
                  );
                  onReady(preserved);
                  return;
                }
                browser.pause(250, () => waitForExistingPublicConnection(publicAttempt + 1));
              });
            };
            waitForExistingPublicConnection();
            return;
          }
          browser.pause(500, () => waitForSocketAccessUpdate(browser, expectedPath, attempt + 1, onReady));
        }
      );
    });
  });
};

const createAdminRoomPost = (browser, { admin, floorId, floorTitle, roomId, roomTitle, content }, onReady) => {
  browser.executeAsync(
    function (payload, done) {
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
        body: JSON.stringify({ mail: payload.adminMail, password: payload.adminPassword }),
      })
        .then(function (loginResult) {
          const login = loginResult.body || {};
          if (loginResult.status !== 200 || !login.token || !login.user_id) {
            done({ ok: false, stage: 'login', loginStatus: loginResult.status });
            return null;
          }

          return requestJson(`/api/rooms/${payload.roomId}/timeline/posts`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${login.token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              content: payload.content,
              lang: login.lang || 'ja',
            }),
          }).then(function (postResult) {
            done({
              ok: postResult.status === 201,
              stage: 'post',
              loginStatus: loginResult.status,
              postStatus: postResult.status,
            });
            return null;
          });
        })
        .catch(function (error) {
          done({ ok: false, stage: 'request', error: error && error.message ? error.message : 'request-failed' });
        });
    },
    [
      {
        adminMail: admin.mail,
        adminPassword: admin.password,
        floorId,
        floorTitle,
        roomId,
        roomTitle,
        content,
      },
    ],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result' };
      browser.assert.ok(
        state.ok,
        `管理者のテスト用投稿を作成しました（stage=${state.stage || 'unknown'}, login=${state.loginStatus || 0}, post=${
          state.postStatus || 0
        }, error=${state.error || 'none'}）。`
      );
      onReady(state.ok === true);
    }
  );
};

const waitForBroadcastIsolation = (browser, { privateContent: _privateContent, publicContent: _publicContent }, attempt, onReady) => {
  const maxAttempts = 20;
  readTimelineProbe(browser, roleDowngradeProbeId, (privateState) => {
    readSecondaryTimelineConnection(browser, publicConnectionId, (publicState) => {
      const completed = Boolean(
        publicState &&
          publicState.found &&
          publicState.receivedCount > 0 &&
          publicState.connected &&
          publicState.connectionId === publicInitialConnectionId
      );

      if (completed || attempt >= maxAttempts) {
        browser.assert.ok(Boolean(privateState && privateState.found), 'メンバー限定ルームの監視を引き続き利用できます。');
        browser.assert.equal(
          Number(privateState && privateState.postCreateCount),
          0,
          '切断したメンバー限定ルームのSocketは、その後の投稿を受信していません。'
        );
        browser.assert.equal(
          Number(publicState && publicState.receivedCount),
          1,
          '権限のある公開ルームのSocketは、自身のルームの投稿だけを受信しました。'
        );
        browser.assert.ok(Boolean(publicState && publicState.connected), '公開ルームのSocketが接続を維持しています。');
        browser.assert.equal(
          publicState && publicState.connectionId,
          publicInitialConnectionId,
          '公開ルームのSocketは権限変更前の接続のままです。'
        );
        onReady(
          completed &&
            Number(privateState && privateState.postCreateCount) === 0 &&
            Number(publicState && publicState.receivedCount) === 1 &&
            publicState.connected &&
            publicState.connectionId === publicInitialConnectionId
        );
        return;
      }

      browser.pause(500, () =>
        waitForBroadcastIsolation(browser, { privateContent: '', publicContent: '' }, attempt + 1, onReady)
      );
    });
  });
};

const waitForPrivateReconnectRejected = (browser, _attempt, onReady) => {
  verifyCapturedCredentialRejected(browser, roleDowngradeProbeId, (state) => {
    readSecondaryTimelineConnection(browser, publicConnectionId, (publicState) => {
      const completed = Boolean(
        state && state.found && state.attempted && state.socketRejected && !state.reconnected &&
        publicState && publicState.connected && publicState.connectionId === publicInitialConnectionId
      );
      browser.assert.ok(Boolean(state && state.socketRejected), 'サーバがメンバー限定ルームへの再接続を拒否しました。');
      browser.assert.ok(!Boolean(state && state.reconnected), '投稿者はメンバー限定ルームに再接続していません。');
      browser.assert.ok(Boolean(publicState && publicState.connected), '公開ルームのSocketが接続を維持しています。');
      browser.assert.equal(
        publicState && publicState.connectionId,
        publicInitialConnectionId,
        '公開ルームのSocketは引き続き権限変更前の接続を使用しています。'
      );
      onReady(completed);
    });
  });
};

const closeRoleDowngradeProbe = (browser) => {
  stopTimelineProbe(browser, roleDowngradeProbeId);
  closeSecondaryTimelineConnection(browser, publicConnectionId);
  roleDowngradeProbeId = '';
  publicConnectionId = '';
  publicInitialConnectionId = '';
};

module.exports = {
  installRoleDowngradeProbe,
  loadTargetEditor,
  setTargetUserRole,
  verifyDowngradedRestAccess,
  waitForSocketAccessUpdate,
  createAdminRoomPost,
  waitForBroadcastIsolation,
  waitForPrivateReconnectRejected,
  closeRoleDowngradeProbe,
};
