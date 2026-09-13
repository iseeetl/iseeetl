const { resolveBackendBaseUrl } = require('./backend-url');
const { getBaseUrl, requireEnv } = require('./login');
const { io } = require('socket.io-client');

// 認証情報はNode.js側で保持し、エラーにはレスポンス本文・認証情報・トークンを含めない。
const createApiActor = async (browser, account = 'E2E_ADMIN', v1Token = '') => {
  const origin = resolveBackendBaseUrl(getBaseUrl(browser));
  let token = v1Token;
  const request = async (path, body, { method = 'POST', status = 200 } = {}) => {
    if (!/^\/api\/[a-z0-9/_-]+$/i.test(path)) throw new Error('テストデータ用APIのパスが不正です。');
    let response;
    try {
      response = await fetch(origin + path, {
        method,
        headers: { ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new Error('E2Eのテストデータ用APIの通信に失敗しました。');
    }
    if (response.status !== status) throw new Error(`E2Eのテストデータ用API ${path}: 期待値は${status}ですが、実際は${response.status}でした。`);
    return response.status === 204 ? null : response.json();
  };
  if (v1Token) return { request };
  const login = await request('/api/auth/login', {
    mail: requireEnv(`${account}_MAIL`), password: requireEnv(`${account}_PASSWORD`),
  });
  if (!login.token || !login.user_id) throw new Error('E2Eのテストデータを準備するためのログインが完了しませんでした。');
  token = login.token;
  const observeRoom = async (roomId) => {
    const events = [];
    const socket = io(origin, { query: { room_id: roomId, user_token: token, lang: 'ja' }, transports: ['websocket'], reconnection: false });
    for (const name of ['POST_CREATE', 'POST_UPDATE', 'POST_DELETE']) socket.on(name, () => events.push(name));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('E2Eの監視用接続がタイムアウトしました。')), 10000);
        socket.once('connect', () => { clearTimeout(timer); resolve(); });
        socket.once('connect_error', () => { clearTimeout(timer); reject(new Error('E2Eの監視用接続に失敗しました。')); });
      });
    } catch (error) {
      socket.disconnect();
      throw error;
    }
    return { events, connected: () => socket.connected, close: () => socket.disconnect() };
  };
  return { request, userId: login.user_id, observeRoom };
};

const createFloorRoomFixture = async (actor, suffix) => {
  const title = `E2E Coverage ${suffix} ${Date.now()}`;
  const floor = await actor.request('/api/floor/create', {
    title, description: 'E2E coverage fixture', lang: 'ja', target_langs: [], floor_display_hidden: false,
  });
  const room = await actor.request('/api/room/create', {
    floor_id: floor._id, title, description: 'E2E coverage fixture', lang: 'ja',
    guest_reaction_only: false, member_only: false, room_display_hidden: false,
    notification: false, external_sns_button: false,
  });
  if (!floor._id || !room._id) throw new Error('E2EのテストデータのリソースIDがありません。');
  return { floorId: floor._id, roomId: room._id, floorTitle: title, roomTitle: title };
};

module.exports = { createApiActor, createFloorRoomFixture };
