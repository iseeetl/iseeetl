const USER_DETAIL_PATH = '/api/user/detail';
const GUEST_REFRESH_PATH = '/api/guest/refresh';
const AUTH_RACE_QUERY = 'e2e_auth_race';
const USER_401_SCENARIO = 'user-401';
const GUEST_REFRESH_SCENARIO = 'guest-refresh';

const AUTH_RACE_FETCH_PATTERNS = Object.freeze([
  Object.freeze({
    urlPattern: '*://localhost:3100/api/user/detail*',
    requestStage: 'Request',
  }),
  Object.freeze({
    urlPattern: '*://localhost:3100/api/guest/refresh*',
    requestStage: 'Request',
  }),
]);

const parseUrl = (value) => {
  try {
    return new URL(String(value || ''));
  } catch (_error) {
    return null;
  }
};

const classifyAuthRaceRequest = (rawUrl, method, applicationOrigin) => {
  const url = parseUrl(rawUrl);
  if (!url || url.origin !== applicationOrigin) return 'unrelated';

  if (url.pathname === USER_DETAIL_PATH) {
    if (!url.searchParams.has(AUTH_RACE_QUERY)) return 'unrelated';
    const exactQuery = [...url.searchParams.keys()].length === 1 && !url.hash;
    const scenario = url.searchParams.get(AUTH_RACE_QUERY);
    if (method !== 'GET' || !exactQuery) return 'unexpected';
    if (scenario === USER_401_SCENARIO) return 'user-401';
    if (scenario === GUEST_REFRESH_SCENARIO) return 'guest-initial-401';
    return 'unexpected';
  }

  if (url.pathname === GUEST_REFRESH_PATH) {
    if (method === 'POST' && !url.search && !url.hash) return 'guest-refresh';
    return 'unexpected';
  }

  return 'unrelated';
};

const createState = () => ({
  scenario: 'idle',
  user401RequestCount: 0,
  guestInitial401RequestCount: 0,
  guestRefreshRequestCount: 0,
  unexpectedRequestCount: 0,
  handlerErrorCount: 0,
  connectionErrorCount: 0,
  teardownErrorCount: 0,
  activeHandlerCount: 0,
  heldRequestCount: 0,
  listenerAttached: false,
  fetchEnabled: false,
  stopped: false,
});

const readSafeAuthRaceSummary = (state = {}) => Object.freeze({
  scenario: typeof state.scenario === 'string' ? state.scenario : 'idle',
  user401RequestCount: Number(state.user401RequestCount || 0),
  guestInitial401RequestCount: Number(state.guestInitial401RequestCount || 0),
  guestRefreshRequestCount: Number(state.guestRefreshRequestCount || 0),
  unexpectedRequestCount: Number(state.unexpectedRequestCount || 0),
  handlerErrorCount: Number(state.handlerErrorCount || 0),
  connectionErrorCount: Number(state.connectionErrorCount || 0),
  teardownErrorCount: Number(state.teardownErrorCount || 0),
  activeHandlerCount: Number(state.activeHandlerCount || 0),
  heldRequestCount: Number(state.heldRequestCount || 0),
  listenerAttached: state.listenerAttached === true,
  fetchEnabled: state.fetchEnabled === true,
  stopped: state.stopped === true,
});

const sendCdpCommand = async (connection, method, parameters) => {
  const result = await connection.send(method, parameters);
  if (result?.error) throw new Error(`Chrome DevToolsのコマンドに失敗しました: ${method}`);
};

const encodeJsonBody = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64');

const fulfillJson = (connection, requestId, responseCode, payload) =>
  sendCdpCommand(connection, 'Fetch.fulfillRequest', {
    requestId,
    responseCode,
    responseHeaders: [
      { name: 'Content-Type', value: 'application/json; charset=utf-8' },
      { name: 'Cache-Control', value: 'no-store' },
    ],
    body: encodeJsonBody(payload),
  });

const fulfillUnauthorized = (connection, requestId) =>
  fulfillJson(connection, requestId, 401, {
    error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
  });

const resolveApplicationOrigin = (browser) => {
  const url = parseUrl(browser?.launchUrl || browser?.globals?.launchUrl);
  if (!url || url.origin !== 'http://localhost:3100') {
    throw new Error('認証の競合のE2Eには専用のフロントエンドのオリジンが必要です。');
  }
  return url.origin;
};

const installAuthRaceCdpController = async (browser) => {
  if (!browser?.driver || typeof browser.driver.createCDPConnection !== 'function') {
    throw new Error('認証の競合のE2EにはChromiumのCDP接続が必要です。');
  }

  const applicationOrigin = resolveApplicationOrigin(browser);
  const connection = await browser.driver.createCDPConnection('page');
  const socket = connection?._wsConnection;
  if (!socket || typeof socket.on !== 'function' || typeof socket.off !== 'function') {
    throw new Error('認証の競合のE2E用のCDP応答制御を接続できませんでした。');
  }

  const state = createState();
  const activeHandlers = new Set();
  const heldRequests = new Map();
  const waiters = new Map();
  let stopPromise = null;

  const updateCounts = () => {
    state.activeHandlerCount = activeHandlers.size;
    state.heldRequestCount = heldRequests.size;
  };

  const settleWaiters = (kind, error = null) => {
    const queued = waiters.get(kind) || [];
    waiters.delete(kind);
    queued.forEach(({ resolve, reject, timer }) => {
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(readSafeAuthRaceSummary(state));
    });
  };

  const holdRequest = async (kind, requestId) => {
    if (heldRequests.has(kind)) {
      state.unexpectedRequestCount += 1;
      await sendCdpCommand(connection, 'Fetch.failRequest', {
        requestId,
        errorReason: 'BlockedByClient',
      });
      return;
    }
    heldRequests.set(kind, requestId);
    updateCounts();
    settleWaiters(kind);
  };

  const handlePausedRequest = async (request) => {
    const kind = classifyAuthRaceRequest(
      request?.url,
      request?.method,
      applicationOrigin
    );

    if (kind === 'unrelated' || (kind === 'guest-refresh' && state.scenario !== GUEST_REFRESH_SCENARIO)) {
      await sendCdpCommand(connection, 'Fetch.continueRequest', { requestId: request.requestId });
      return;
    }
    if (kind === 'unexpected') {
      state.unexpectedRequestCount += 1;
      await sendCdpCommand(connection, 'Fetch.continueRequest', { requestId: request.requestId });
      return;
    }
    if (kind === 'user-401') {
      state.user401RequestCount += 1;
      if (state.scenario !== USER_401_SCENARIO) {
        state.unexpectedRequestCount += 1;
        await fulfillUnauthorized(connection, request.requestId);
        return;
      }
      await holdRequest(kind, request.requestId);
      return;
    }
    if (kind === 'guest-initial-401') {
      state.guestInitial401RequestCount += 1;
      if (state.scenario !== GUEST_REFRESH_SCENARIO) state.unexpectedRequestCount += 1;
      await fulfillUnauthorized(connection, request.requestId);
      return;
    }

    state.guestRefreshRequestCount += 1;
    await holdRequest(kind, request.requestId);
  };

  const trackHandler = (request) => {
    let tracked;
    tracked = Promise.resolve()
      .then(() => handlePausedRequest(request))
      .catch(async () => {
        state.handlerErrorCount += 1;
        try {
          await sendCdpCommand(connection, 'Fetch.failRequest', {
            requestId: request.requestId,
            errorReason: 'Aborted',
          });
        } catch (_error) {
          state.connectionErrorCount += 1;
        }
      })
      .finally(() => {
        activeHandlers.delete(tracked);
        updateCounts();
      });
    activeHandlers.add(tracked);
    updateCounts();
  };

  const messageListener = (message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch (_error) {
      state.handlerErrorCount += 1;
      return;
    }
    if (payload.method !== 'Fetch.requestPaused') return;
    trackHandler({
      requestId: payload.params?.requestId,
      method: payload.params?.request?.method,
      url: payload.params?.request?.url,
    });
  };
  const errorListener = () => {
    state.connectionErrorCount += 1;
  };
  const closeListener = () => {
    if (!state.stopped) state.connectionErrorCount += 1;
    detachListeners();
  };
  const detachListeners = () => {
    socket.off('message', messageListener);
    socket.off('error', errorListener);
    socket.off('close', closeListener);
    state.listenerAttached = false;
  };
  const drainHandlers = async () => {
    while (activeHandlers.size > 0) await Promise.allSettled([...activeHandlers]);
  };

  socket.on('message', messageListener);
  socket.on('error', errorListener);
  socket.on('close', closeListener);
  state.listenerAttached = true;
  try {
    await sendCdpCommand(connection, 'Fetch.enable', { patterns: AUTH_RACE_FETCH_PATTERNS });
    state.fetchEnabled = true;
  } catch (_error) {
    detachListeners();
    throw new Error('認証の競合のE2E用のCDP応答制御を有効にできませんでした。');
  }

  const beginScenario = (scenario) => {
    if (
      state.stopped ||
      state.scenario !== 'idle' ||
      heldRequests.size > 0 ||
      ![USER_401_SCENARIO, GUEST_REFRESH_SCENARIO].includes(scenario)
    ) {
      return false;
    }
    state.scenario = scenario;
    return true;
  };

  const waitForHeldRequest = (kind, timeoutMs = 10000) => {
    if (heldRequests.has(kind)) return Promise.resolve(readSafeAuthRaceSummary(state));
    if (!['user-401', 'guest-refresh'].includes(kind)) {
      return Promise.reject(new Error('認証の競合テストの要求種別が未定義です。'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const queued = waiters.get(kind) || [];
        waiters.set(kind, queued.filter((entry) => entry.resolve !== resolve));
        reject(new Error('認証の競合テストで、応答の保留待ちがタイムアウトしました。'));
      }, timeoutMs);
      const queued = waiters.get(kind) || [];
      queued.push({ resolve, reject, timer });
      waiters.set(kind, queued);
    });
  };

  const releaseHeldRequest = async (kind, responseCode, payload) => {
    const requestId = heldRequests.get(kind);
    if (!requestId) throw new Error('認証の競合テストで応答が保留されていません。');
    await fulfillJson(connection, requestId, responseCode, payload);
    heldRequests.delete(kind);
    updateCounts();
    await drainHandlers();
    return readSafeAuthRaceSummary(state);
  };

  const completeScenario = (scenario) => {
    if (state.scenario !== scenario || heldRequests.size > 0 || activeHandlers.size > 0) return false;
    state.scenario = 'idle';
    return true;
  };

  return Object.freeze({
    summary: () => readSafeAuthRaceSummary(state),
    beginScenario,
    waitForHeldRequest,
    releaseUser401: () =>
      releaseHeldRequest('user-401', 401, {
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      }),
    releaseGuestRefresh: () =>
      releaseHeldRequest('guest-refresh', 200, {
        guest_id: '00000000-0000-4000-8000-000000000001',
        guest_token: 'discarded-stale-credential',
        expires_in: 3600,
      }),
    completeScenario,
    stop: () => {
      if (stopPromise) return stopPromise;
      stopPromise = (async () => {
        await drainHandlers();
        for (const [kind, requestId] of heldRequests.entries()) {
          try {
            await sendCdpCommand(connection, 'Fetch.failRequest', {
              requestId,
              errorReason: 'Aborted',
            });
          } catch (_error) {
            state.teardownErrorCount += 1;
          }
          settleWaiters(kind, new Error('認証の競合テストの応答制御を停止しました。'));
        }
        heldRequests.clear();
        updateCounts();
        try {
          await sendCdpCommand(connection, 'Fetch.disable', {});
          state.fetchEnabled = false;
        } catch (_error) {
          state.teardownErrorCount += 1;
        }
        for (const kind of waiters.keys()) {
          settleWaiters(kind, new Error('認証の競合テストの応答制御を停止しました。'));
        }
        state.stopped = true;
        detachListeners();
        return readSafeAuthRaceSummary(state);
      })();
      return stopPromise;
    },
  });
};

module.exports = {
  AUTH_RACE_FETCH_PATTERNS,
  GUEST_REFRESH_SCENARIO,
  USER_401_SCENARIO,
  classifyAuthRaceRequest,
  installAuthRaceCdpController,
  readSafeAuthRaceSummary,
};
