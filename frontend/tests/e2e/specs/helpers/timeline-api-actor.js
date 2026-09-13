const createTimelinePostsByApiActor = (browser, request, label) => {
  browser.executeAsync(
    function (fixture, done) {
      const dedicatedFrontend =
        window.location.protocol === 'http:' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
        window.location.port === '3100';
      if (!dedicatedFrontend) {
        done({ ok: false, stage: 'frontend-origin', requestStatus: 0 });
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
      const fail = function (stage, status) {
        const error = new Error(stage);
        error.stage = stage;
        error.requestStatus = status;
        throw error;
      };

      const authenticate =
        fixture.actorType === 'guest'
          ? requestJson('/api/guest/bootstrap', {
              method: 'POST',
              credentials: 'include',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ guest_name: fixture.guestName, lang: 'ja' }),
            }).then(function (result) {
              const body = result.body || {};
              const guestId = body.guest_id ? String(body.guest_id) : '';
              const guestToken = body.guest_token ? String(body.guest_token) : '';
              if (result.status !== 200 || !guestId || !guestToken) {
                return fail('bootstrap', result.status);
              }
              return {
                path: '/api/chat/guest/post',
                credentials: 'include',
                headers: { 'content-type': 'application/json', 'x-guest-token': guestToken },
                guestId,
              };
            })
          : requestJson('/api/auth/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ mail: fixture.actorMail, password: fixture.actorPassword }),
            }).then(function (result) {
              const body = result.body || {};
              const token = body.token ? String(body.token) : '';
              if (result.status !== 200 || !token) return fail('login', result.status);
              return {
                path: `/api/rooms/${fixture.roomId}/timeline/posts`,
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                userId: String(body.user_id),
                userName: body.user_name,
                lang: body.lang || 'ja',
              };
            });

      authenticate
        .then(function (actor) {
          return fixture.contents.reduce(function (chain, content, index) {
            return chain.then(function () {
              const body = { content, lang: actor.lang || 'ja' };
              if (fixture.actorType === 'guest') {
                Object.assign(body, {
                  floor_id: fixture.floorId,
                  floor_title: fixture.floorTitle,
                  room_id: fixture.roomId,
                  room_title: fixture.roomTitle,
                  guest_id: actor.guestId,
                  guest_name: fixture.guestName,
                  room_tags: [],
                  animation: null,
                  keyup: '',
                  target_langs: [],
                });
              }
              return requestJson(actor.path, {
                method: 'POST',
                credentials: actor.credentials,
                headers: actor.headers,
                body: JSON.stringify(body),
              }).then(function (result) {
                if (result.status < 200 || result.status >= 300) {
                  return fail(`post-${index + 1}`, result.status);
                }
                return null;
              });
            });
          }, Promise.resolve());
        })
        .then(function () {
          done({ ok: true, stage: 'complete', createdCount: fixture.contents.length });
        })
        .catch(function (error) {
          done({
            ok: false,
            stage: error && error.stage ? error.stage : 'request',
            requestStatus: error && error.requestStatus ? error.requestStatus : 0,
          });
        });
    },
    [request],
    (result) => {
      const state = result && result.value ? result.value : { ok: false, stage: 'no-result' };
      browser.assert.ok(
        state.ok && state.createdCount === request.contents.length,
        `${label}: APIを操作するユーザが、要求した投稿をすべて作成しました（stage=${state.stage || 'unknown'}, request=${
          state.requestStatus || 0
        }, created=${state.createdCount || 0}）。`
      );
    }
  );
};

const createTimelinePostByApiActor = (
  browser,
  { actorMail, actorPassword, floorId, floorTitle, roomId, roomTitle, content },
  label
) =>
  createTimelinePostsByApiActor(
    browser,
    {
      actorType: 'user',
      actorMail,
      actorPassword,
      floorId,
      floorTitle,
      roomId,
      roomTitle,
      contents: [content],
    },
    label
  );

const createTimelineGuestPostsByApiActor = (
  browser,
  { floorId, floorTitle, roomId, roomTitle, guestName, contents },
  label
) =>
  createTimelinePostsByApiActor(
    browser,
    {
      actorType: 'guest',
      floorId,
      floorTitle,
      roomId,
      roomTitle,
      guestName,
      contents,
    },
    label
  );

module.exports = {
  createTimelinePostByApiActor,
  createTimelineGuestPostsByApiActor,
};
