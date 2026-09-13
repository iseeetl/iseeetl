const { clickSingleVisible } = require('./dialog-focus');
const buildScopedTagRequest = ({ scope, scopeId, name, order = 10 }) => {
  if (scope !== 'floor' && scope !== 'room') {
    throw new Error('タグのテストデータの範囲はfloorまたはroomにしてください。');
  }
  if (!scopeId) {
    throw new Error('タグのテストデータの対象範囲のIDが必要です。');
  }

  const idKey = scope === 'floor' ? 'floor_id' : 'room_id';
  return {
    path: `/api/${scope}tag/create`,
    body: {
      [idKey]: String(scopeId),
      order,
      name,
      lang: 'ja',
    },
  };
};

const createScopedTagByApiActor = (
  browser,
  { actorMail, actorPassword, scope, scopeId, name, order = 10 },
  label
) => {
  const request = buildScopedTagRequest({ scope, scopeId, name, order });

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
        body: JSON.stringify({ mail: payload.actorMail, password: payload.actorPassword }),
      })
        .then(function (loginResult) {
          const token = loginResult.body && loginResult.body.token ? String(loginResult.body.token) : '';
          if (loginResult.status !== 200 || !token) {
            done({ ok: false, stage: 'login', loginStatus: loginResult.status });
            return null;
          }

          return requestJson(payload.request.path, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify(payload.request.body),
          }).then(function (createResult) {
            done({
              ok: createResult.status >= 200 && createResult.status < 300,
              stage: 'create',
              loginStatus: loginResult.status,
              requestStatus: createResult.status,
            });
            return null;
          });
        })
        .catch(function () {
          done({ ok: false, stage: 'request' });
        });
    },
    [{ actorMail, actorPassword, request }],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result' };
      browser.assert.ok(
        state.ok,
        `${label}: 製品APIでテストデータを作成しました（stage=${state.stage || 'unknown'}, login=${
          state.loginStatus || 0
        }, request=${state.requestStatus || 0}）。`
      );
    }
  );
};

const deleteManagedTagByName = (browser, { scope, name }, finish) => {
  browser.execute(function (targetScope, targetName) {
    const rows = Array.from(document.querySelectorAll('table.management-table tbody tr'));
    const matches = rows.filter((item) => item.querySelectorAll('td')[1]?.textContent.trim() === targetName);
    if (matches.length !== 1) return { id: '' };
    const button = matches[0].querySelector(`[data-testid="management-${targetScope}tag-lifecycle"]`);
    if (!button) return { id: '' };
    const id = button.getAttribute('data-management-lifecycle-id');
    button.click();
    return { id };
  }, [scope, name], (result) => {
    const id = result.value?.id;
    browser.assert.ok(Boolean(id), '対象タグの削除確認を開きます。');
    if (!id) return finish();
    const dialog = '[data-testid="management-lifecycle-dialog"]';
    browser.waitForElementVisible(dialog, 10000);
    browser.assert.textContains(dialog, 'この操作は元に戻せません');
    clickSingleVisible(browser, `${dialog} [data-testid="management-lifecycle-confirm"]`, 'タグの削除を確定');
    browser.waitForElementNotPresent(dialog, 10000);
    browser.waitForElementNotPresent(`[data-management-lifecycle-id="${id}"]`, 10000);
    browser.perform((done) => { finish(); done(); });
  });
};

module.exports = {
  buildScopedTagRequest,
  deleteManagedTagByName,
  createScopedTagByApiActor,
};
