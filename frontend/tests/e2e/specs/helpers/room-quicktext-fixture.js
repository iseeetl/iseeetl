const createRoomQuickTextByApiActor = (
  browser,
  { actorMail, actorPassword, roomId, groupTitle, itemLabel },
  label
) => {
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
      const objectIdPattern = /^[a-f0-9]{24}$/i;
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
            done({ ok: false, stage: 'login', loginStatus: loginResult.status });
            return null;
          }
          const headers = {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          };
          return requestJson(`/api/rooms/${payload.roomId}/quick-text/groups`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ title: payload.groupTitle, lang: 'ja' }),
          }).then(function (groupResult) {
            const groupId =
              groupResult.body && objectIdPattern.test(String(groupResult.body._id || ''))
                ? String(groupResult.body._id)
                : '';
            if (groupResult.status < 200 || groupResult.status >= 300 || !groupId) {
              done({
                ok: false,
                stage: 'group',
                loginStatus: loginResult.status,
                groupStatus: groupResult.status,
              });
              return null;
            }
            return requestJson(`/api/rooms/${payload.roomId}/quick-text/groups/${groupId}/items`, {
              method: 'POST',
              headers,
              body: JSON.stringify({ label: payload.itemLabel, lang: 'ja' }),
            }).then(function (itemResult) {
              const validItem = itemResult.body && objectIdPattern.test(String(itemResult.body._id || ''));
              done({
                ok: itemResult.status >= 200 && itemResult.status < 300 && validItem,
                stage: 'item',
                loginStatus: loginResult.status,
                groupStatus: groupResult.status,
                itemStatus: itemResult.status,
              });
              return null;
            });
          });
        })
        .catch(function () {
          done({ ok: false, stage: 'request' });
        });
    },
    [{ actorMail, actorPassword, roomId, groupTitle, itemLabel }],
    (result) => {
      const fixtureState = result?.value || { ok: false, stage: 'no-result' };
      browser.assert.ok(
        fixtureState.ok,
        `${label}: 製品APIで単語を作成しました（stage=${fixtureState.stage || 'unknown'}, login=${
          fixtureState.loginStatus || 0
        }, group=${fixtureState.groupStatus || 0}, item=${fixtureState.itemStatus || 0}）。`
      );
    }
  );
};

module.exports = {
  createRoomQuickTextByApiActor,
};
