const {
  waitForTimelineReady,
  startTimelineProbe,
  readTimelineProbe,
  stopTimelineProbe,
  verifyCapturedCredentialRejected,
} = require('./e2e-public-contract');

let accessRevocationProbeId = '';

const installSocketRevocationProbe = (browser, label, onReady) => {
  if (accessRevocationProbeId) stopTimelineProbe(browser, accessRevocationProbeId);
  waitForTimelineReady(browser, {}, (ready) => {
    browser.assert.ok(ready, `失効前に対象の${label}のSocketが接続されています。`);
    if (!ready) {
      onReady(false);
      return;
    }
    startTimelineProbe(browser, 'access-revoked', (id) => {
      accessRevocationProbeId = id;
      onReady(Boolean(id));
    });
  });
};

const removeMemberThroughApi = (
  browser,
  { memberType, actorMail, actorPassword, targetMail, targetPassword, scopeId, label },
  onReady
) => {
  browser.executeAsync(
    function (payload, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(window.location.hostname) &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin' });
        return;
      }
      const origin = window.location.origin;

      const requestJson = (path, options) =>
        fetch(`${origin}${path}`, options).then(async (response) => ({
          status: response.status,
          body: await response.json().catch(() => null),
        }));
      const login = (mail, password) =>
        requestJson('/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mail, password }),
        });

      Promise.all([
        login(payload.targetMail, payload.targetPassword),
        login(payload.actorMail, payload.actorPassword),
      ])
        .then(([targetLogin, actorLogin]) => {
          const targetUserId = targetLogin.body?.user_id ? String(targetLogin.body.user_id) : '';
          const actorToken = actorLogin.body?.token ? String(actorLogin.body.token) : '';
          if (targetLogin.status !== 200 || !targetUserId || actorLogin.status !== 200 || !actorToken) {
            done({ ok: false, stage: 'login', targetLoginStatus: targetLogin.status, actorLoginStatus: actorLogin.status });
            return null;
          }

          const isFloorMember = payload.memberType === 'floor';
          const apiPath = isFloorMember ? '/api/floormember' : '/api/roommember';
          const scopeBody = isFloorMember ? { floor_id: payload.scopeId } : { room_id: payload.scopeId };
          return requestJson(apiPath, {
            method: 'POST',
            headers: { authorization: `Bearer ${actorToken}`, 'content-type': 'application/json' },
            body: JSON.stringify(scopeBody),
          }).then((listResult) => {
            if (listResult.status !== 200 || !Array.isArray(listResult.body)) {
              done({ ok: false, stage: 'list', listStatus: listResult.status });
              return null;
            }
            const member = listResult.body.find((entry) => {
              const user = entry && entry.user;
              const userId = user && typeof user === 'object' ? user._id : user;
              return userId != null && String(userId) === targetUserId;
            });
            if (!member?._id) {
              done({ ok: false, stage: 'member', listStatus: listResult.status });
              return null;
            }
            const deleteBody = { _id: String(member._id) };
            if (isFloorMember) deleteBody.floor_id = payload.scopeId;
            return requestJson(`${apiPath}/delete`, {
              method: 'POST',
              headers: { authorization: `Bearer ${actorToken}`, 'content-type': 'application/json' },
              body: JSON.stringify(deleteBody),
            }).then((deleteResult) =>
              done({
                ok: deleteResult.status === 200,
                stage: 'delete',
                listStatus: listResult.status,
                deleteStatus: deleteResult.status,
              })
            );
          });
        })
        .catch((error) => done({ ok: false, stage: 'request', error: error?.message || 'request-failed' }));
    },
    [{ memberType, actorMail, actorPassword, targetMail, targetPassword, scopeId }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result' };
      browser.assert.ok(
        state.ok,
        `${label}が接続中のメンバーを削除しました(stage=${state.stage || 'unknown'}, ` +
          `list=${state.listStatus || 0}, delete=${state.deleteStatus || 0}, error=${state.error || 'none'}).`
      );
      onReady(state.ok === true);
    }
  );
};

const waitForSocketRevocation = (browser, { label, expectedPath }, attempt = 0, onReady) => {
  const maxAttempts = 30;
  readTimelineProbe(browser, accessRevocationProbeId, (probe) => {
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
          probe && probe.found && probe.eventCount > 0 && probe.disconnected && !probe.connected && page.path === expectedPath
        );
        if (completed || attempt >= maxAttempts) {
          browser.assert.ok(Boolean(probe && probe.found), `画面遷移後も${label}のSocketの監視を利用できます。`);
          browser.assert.ok(Boolean(probe && probe.eventCount > 0), `対象のSocketが${label}の失効イベントを受信しました。`);
          browser.assert.ok(Boolean(probe && probe.disconnected), `対象の${label}のSocketが切断されました。`);
          browser.assert.ok(!Boolean(probe && probe.connected), `対象の${label}のSocketは切断されたままです。`);
          browser.assert.equal(page.path, expectedPath, `失効した${label}が別画面へ移動しました。`);
          browser.assert.ok(!page.timelineVisible, `失効した${label}にはタイムラインが表示されていません。`);
          onReady(completed);
          return;
        }
        browser.pause(500, () => waitForSocketRevocation(browser, { label, expectedPath }, attempt + 1, onReady));
      }
    );
  });
};

const waitForReconnectRejected = (browser, label, _attempt = 0, onReady) => {
  verifyCapturedCredentialRejected(browser, accessRevocationProbeId, (state) => {
    const completed = Boolean(state && state.found && state.attempted && state.socketRejected && !state.reconnected);
    browser.assert.ok(Boolean(state && state.found), `切断した${label}の監視を引き続き利用できます。`);
    browser.assert.ok(Boolean(state && state.attempted), `${label}の失効後に再接続を試みました。`);
    browser.assert.ok(Boolean(state && state.socketRejected), `サーバが${label}の再接続を拒否しました。`);
    browser.assert.ok(!Boolean(state && state.reconnected), `失効した${label}は再接続していません。`);
    stopTimelineProbe(browser, accessRevocationProbeId);
    accessRevocationProbeId = '';
    onReady(completed);
  });
};

module.exports = {
  installSocketRevocationProbe,
  removeMemberThroughApi,
  waitForSocketRevocation,
  waitForReconnectRejected,
};
