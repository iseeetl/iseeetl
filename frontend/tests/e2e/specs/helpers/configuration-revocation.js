const { requireEnv } = require('./login');
const { openSecondaryTimelineConnection, readSecondaryTimelineConnection, closeSecondaryTimelineConnection } = require('./e2e-public-contract');

const runConfigurationOperation = (browser, operation, onReady) => {
  browser.executeAsync(async function (payload, done) {
    if (window.location.origin !== 'http://localhost:3100') return done({ ok: false });
    try {
      const send = async (path, body, token) => {
        const response = await fetch(path, { method: 'POST', credentials: 'omit',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body) });
        if (response.status !== 200) throw new Error('request-failed');
        return response.json().catch(() => ({}));
      };
      const login = await send('/api/auth/login', { mail: payload.mail, password: payload.password });
      if (!login.token) return done({ ok: false });
      if (payload.kind === 'setup') {
        const floor = await send('/api/floor/create', { title: 'E2E Revocation Floor', description: 'E2E', lang: 'ja',
          floor_display_hidden: false, target_langs: [] }, login.token);
        const room = await send('/api/room/create', { floor_id: floor._id, title: 'E2E Revocation Room', description: 'E2E',
          lang: 'ja', guest_reaction_only: false, member_only: false, room_display_hidden: false,
          notification: false, external_sns_button: false }, login.token);
        return done({ ok: Boolean(floor._id && room._id), floorId: floor._id, roomId: room._id });
      }
      if (payload.kind === 'password') {
        const result = await send('/api/user/changepassword', { old_password: payload.password, new_password: payload.nextPassword }, login.token);
        return done({ ok: !result.token });
      }
      if (payload.kind === 'room_restricted') {
        const room = await send('/api/room/detail', { _id: payload.roomId });
        await send('/api/room/update', { _id: room._id, title: room.title, description: room.description, lang: room.lang,
          image_name: room.image_name, member_only: true, guest_reaction_only: room.guest_reaction_only,
          room_display_hidden: room.room_display_hidden, notification: room.notification, external_sns_button: room.external_sns_button }, login.token);
      } else {
        const floor = payload.kind === 'floor_deleted';
        await send(floor ? '/api/floor/delete' : '/api/room/delete', { _id: floor ? payload.floorId : payload.roomId }, login.token);
      }
      done({ ok: true });
    } catch (_) { done({ ok: false }); }
  }, [{ mail: requireEnv(operation.kind === 'password' ? 'E2E_USER_MAIL' : 'E2E_ADMIN_MAIL'),
    password: requireEnv(operation.kind === 'password' ? 'E2E_USER_PASSWORD' : 'E2E_ADMIN_PASSWORD'), ...operation }], (result) => {
    const state = result?.value || {};
    browser.assert.ok(state.ok === true, `設定操作${operation.kind}が成功しました。`);
    onReady(state);
  });
};

const openConnectedSecondary = (browser, roomId, label, onReady) => {
  openSecondaryTimelineConnection(browser, roomId, (id) => {
    const poll = (attempt = 0) => {
      readSecondaryTimelineConnection(browser, id, (state) => {
        const ready = Boolean(state?.found && state.connected && state.connectionId);
        if (ready || attempt >= 40) {
          browser.assert.ok(ready, `${label}: found=${Boolean(state?.found)}, connected=${Boolean(state?.connected)}, errors=${state?.connectErrorCount || 0}, reason=${state?.reason || 'none'}`);
          if (!ready) closeSecondaryTimelineConnection(browser, id);
          onReady(ready ? { id, connectionId: state.connectionId } : null);
          return;
        }
        browser.pause(250, () => poll(attempt + 1));
      });
    };
    poll();
  });
};

module.exports = { runConfigurationOperation, openConnectedSecondary };
