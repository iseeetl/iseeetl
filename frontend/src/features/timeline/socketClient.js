import { API_BASE_URL } from '@/api/apiClient';
import * as io from 'socket.io-client';
import { bindSocketHandlers, SOCKET_STATUS_VISIBLE_DELAY_MS } from '@/features/timeline/socket';

const SOCKET_CONNECT_STUCK_TIMEOUT_MS = 30000;

const nowFrom = (deps) => (typeof deps.now === 'function' ? deps.now() : Date.now());
const scheduleFrom = (deps) => deps.schedule || ((cb, ms) => setTimeout(cb, ms));
const cancelFrom = (deps) => deps.cancel || ((id) => clearTimeout(id));
const isDocumentHiddenFrom = (deps) =>
  typeof deps.isDocumentHidden === 'function'
    ? deps.isDocumentHidden()
    : typeof document !== 'undefined' && document.hidden === true;

const ensureReconnectState = (ctx) => {
  if (!Number.isInteger(ctx.infra.socketReconnectGeneration)) {
    ctx.infra.socketReconnectGeneration = 0;
  }
  if (typeof ctx.infra.socketRecoveryPending !== 'boolean') {
    ctx.infra.socketRecoveryPending = false;
  }
  if (typeof ctx.infra.socketDisposed !== 'boolean') {
    ctx.infra.socketDisposed = false;
  }
};

const isCurrentGeneration = (ctx, generation) =>
  ctx.infra.socketDisposed !== true && ctx.infra.socketReconnectGeneration === generation;

const hideSocketStatus = (ctx, deps = {}) => {
  if (typeof ctx.infra.hideSocketStatus === 'function') {
    ctx.infra.hideSocketStatus();
    return;
  }
  if (ctx.infra.socketStatusTimerId != null) {
    cancelFrom(deps)(ctx.infra.socketStatusTimerId);
    ctx.infra.socketStatusTimerId = null;
  }
  ctx.infra.socketStatusTimerGeneration = null;
  ctx.infra.socketStatusVisible = false;
};

const scheduleSocketStatusVisible = (ctx, generation, deps = {}) => {
  ctx.infra.socketStatusTimerDisabled = false;
  if (typeof ctx.infra.scheduleSocketStatusVisible === 'function') {
    ctx.infra.scheduleSocketStatusVisible();
    return;
  }
  if (isDocumentHiddenFrom(deps) || ctx.infra.socketStatusTimerId != null) return;
  const schedule = scheduleFrom(deps);
  const delay = Number.isFinite(deps.statusVisibleDelayMs) ? deps.statusVisibleDelayMs : SOCKET_STATUS_VISIBLE_DELAY_MS;
  ctx.infra.socketStatusTimerGeneration = generation;
  ctx.infra.socketStatusTimerId = schedule(() => {
    ctx.infra.socketStatusTimerId = null;
    if (ctx.infra.socketStatusTimerGeneration !== generation) return;
    ctx.infra.socketStatusTimerGeneration = null;
    if (!isCurrentGeneration(ctx, generation)) return;
    if (ctx.infra.isSocketConnect || isDocumentHiddenFrom(deps)) return;
    ctx.infra.socketStatusVisible = true;
  }, delay);
};

const clearSocketConnectWatchdog = (ctx, deps = {}, socket = null) => {
  if (socket && ctx.infra.socketConnectAttemptSocket !== socket) return false;
  if (ctx.infra.socketConnectWatchdogTimerId != null) {
    cancelFrom(deps)(ctx.infra.socketConnectWatchdogTimerId);
  }
  ctx.infra.socketConnectWatchdogTimerId = null;
  ctx.infra.socketConnectStartedAt = null;
  ctx.infra.socketConnectGeneration = null;
  ctx.infra.socketConnectAttemptSocket = null;
  return true;
};

const startSocketConnectWatchdog = (ctx, socket, generation, deps = {}) => {
  clearSocketConnectWatchdog(ctx, deps);
  ctx.infra.socketConnectStartedAt = nowFrom(deps);
  ctx.infra.socketConnectGeneration = generation;
  ctx.infra.socketConnectAttemptSocket = socket;
  ctx.infra.finishSocketConnectAttempt = (settledSocket) => {
    clearSocketConnectWatchdog(ctx, deps, settledSocket);
  };

  const schedule = scheduleFrom(deps);
  const timeout = Number.isFinite(deps.connectStuckTimeoutMs)
    ? deps.connectStuckTimeoutMs
    : SOCKET_CONNECT_STUCK_TIMEOUT_MS;
  let timerId = null;
  timerId = schedule(() => {
    if (ctx.infra.socketConnectWatchdogTimerId === timerId) {
      ctx.infra.socketConnectWatchdogTimerId = null;
    }
    if (!isCurrentGeneration(ctx, generation)) return;
    if (ctx.infra.socket !== socket || ctx.infra.socketStatus !== 'connecting') return;
    if (isDocumentHiddenFrom(deps)) return;
    void requestSocketReconnect(ctx, { force: true, reason: 'watchdog' }, deps).catch(() => undefined);
  }, timeout);
  ctx.infra.socketConnectWatchdogTimerId = timerId;
};

const detachCurrentSocket = (ctx, deps = {}, { preserveRecoveryListeners = true } = {}) => {
  clearSocketConnectWatchdog(ctx, deps);

  const cleanup = ctx.infra.socketCleanup || ctx.infra.socketRecoveryCleanup;
  if (typeof cleanup === 'function') {
    cleanup({ preserveRecoveryListeners });
    if (preserveRecoveryListeners) {
      ctx.infra.socketRecoveryCleanup = cleanup;
    }
  }
  ctx.infra.socketCleanup = null;
  if (!preserveRecoveryListeners) {
    ctx.infra.socketRecoveryCleanup = null;
  }

  const socket = ctx.infra.socket;
  ctx.infra.socket = null;
  if (socket && typeof socket.disconnect === 'function') {
    socket.disconnect();
  }
  ctx.infra.isSocketConnect = false;
  if (ctx.room) ctx.room.status = null;
};

const markRecoveryFailure = (ctx, generation, deps = {}) => {
  if (!isCurrentGeneration(ctx, generation)) return;
  ctx.infra.isSocketConnect = false;
  ctx.infra.socketRecoveryPending = false;
  ctx.infra.socketStatus = 'disconnected';
  scheduleSocketStatusVisible(ctx, generation, deps);
};

const resolveIoFactory = (ioClient) => {
  if (typeof ioClient === 'function') return ioClient;
  if (ioClient && typeof ioClient.io === 'function') return ioClient.io;
  if (ioClient && typeof ioClient.default === 'function') return ioClient.default;
  return null;
};

export const getSocketQuery = (ctx) => {
  const q = { room_id: ctx.$store.getters.roomId };
  if (ctx.$store.getters.guestToken !== null) q.guest_token = ctx.$store.getters.guestToken;
  if (ctx.$store.getters.userToken !== null) q.user_token = ctx.$store.getters.userToken;
  // クエリのlangで指定した一時的な表示言語も、Socketの接続情報へ反映する。
  const lang = ctx.$i18n?.locale || ctx.$store.getters.lang;
  if (lang) q.lang = lang;
  return q;
};

export const createSocket = (query, deps = {}) => {
  const rawClient = deps.ioClient || io;
  const ioClient = resolveIoFactory(rawClient);
  if (!ioClient) throw new Error('socket.io client is not available');
  const apiBaseUrl = typeof deps.apiBaseUrl !== 'undefined' ? deps.apiBaseUrl : API_BASE_URL;
  let baseUrl = deps.baseUrl || apiBaseUrl || window.location.origin;
  try {
    baseUrl = new URL(baseUrl, window.location.origin).origin;
  } catch (_) {
    void _;
  }
  return ioClient(baseUrl, { query, forceNew: true });
};

export const connectTimelineSocket = (ctx, deps = {}, options = {}) => {
  if (!options.force && ctx.infra.socket && ctx.infra.socketStatus === 'connecting') {
    return ctx.infra.socket;
  }

  ctx.infra.socketStatus = 'connecting';
  ctx.infra.socketStatusVisible = false;

  if (ctx.dialogs.sound.tags.length > 0) {
    ctx.showSoundCautionConfirm();
  }

  if (typeof ctx.infra.socketCleanup === 'function') {
    ctx.infra.socketCleanup();
    ctx.infra.socketCleanup = null;
  }
  ctx.infra.socketRecoveryCleanup = null;

  if (ctx.infra.socket) {
    ctx.infra.socket.disconnect();
    ctx.infra.socket = null;
  }

  const query = getSocketQuery(ctx);
  ctx.infra.socket = createSocket(query, deps);

  const bind = deps.bindSocketHandlers || bindSocketHandlers;
  const cleanup = bind(ctx.infra.socket, ctx, deps.socketHandlerDeps || deps);
  if (typeof cleanup === 'function') {
    ctx.infra.socketCleanup = cleanup;
  }
  return ctx.infra.socket;
};

export const connectInitialSocket = (ctx, deps = {}) => {
  ensureReconnectState(ctx);
  ctx.infra.socketDisposed = false;
  const generation = ctx.infra.socketReconnectGeneration + 1;
  ctx.infra.socketReconnectGeneration = generation;
  ctx.infra.socketRecoveryPending = true;

  const socket = connectTimelineSocket(ctx, deps, { force: false });
  startSocketConnectWatchdog(ctx, socket, generation, deps);
  return socket;
};

const recoverGuestAuthentication = async (ctx) => {
  if (ctx.$store.getters.userIsLogin) return { status: 'not-required' };
  return ctx.$store.dispatch('doRecoverGuestSocketAuth');
};

const performReconnect = async (ctx, generation, roomId, wasUserLogin, deps = {}) => {
  try {
    const authResult = await recoverGuestAuthentication(ctx);
    if (!isCurrentGeneration(ctx, generation)) return null;

    if (authResult?.status === 'failed') {
      markRecoveryFailure(ctx, generation, deps);
      return null;
    }
    if (authResult?.status === 'stale') {
      ctx.infra.socketRecoveryPending = false;
      return null;
    }
    if (ctx.timelineResourcesReady === false) {
      ctx.infra.socketRecoveryPending = false;
      return null;
    }
    if (ctx.$store.getters.roomId !== roomId || Boolean(ctx.$store.getters.userIsLogin) !== wasUserLogin) {
      ctx.infra.socketRecoveryPending = false;
      return null;
    }

    const socket = connectTimelineSocket(ctx, deps, { force: true });
    const socketCleanup = ctx.infra.socket === socket ? ctx.infra.socketCleanup : null;
    if (!isCurrentGeneration(ctx, generation)) {
      if (ctx.infra.socket === socket && typeof socketCleanup === 'function') socketCleanup();
      if (socket && typeof socket.disconnect === 'function') socket.disconnect();
      if (ctx.infra.socket === socket) ctx.infra.socket = null;
      return null;
    }
    startSocketConnectWatchdog(ctx, socket, generation, deps);
    return socket;
  } catch {
    if (isCurrentGeneration(ctx, generation)) {
      detachCurrentSocket(ctx, deps, { preserveRecoveryListeners: true });
    }
    markRecoveryFailure(ctx, generation, deps);
    return null;
  }
};

export const requestSocketReconnect = (ctx, { force = false, reason = 'unknown' } = {}, deps = {}) => {
  ensureReconnectState(ctx);
  if (ctx.infra.socketDisposed || ctx.timelineResourcesReady === false) {
    return Promise.resolve(null);
  }

  if (!force && isDocumentHiddenFrom(deps)) {
    hideSocketStatus(ctx, deps);
    return Promise.resolve(null);
  }

  const currentSocket = ctx.infra.socket;
  const socketConnected = Boolean(currentSocket) && currentSocket.connected !== false;
  if (!force && ctx.infra.isSocketConnect && ctx.infra.socketStatus === 'connected' && socketConnected) {
    hideSocketStatus(ctx, deps);
    return Promise.resolve(currentSocket);
  }

  if (!force && ctx.infra.socketStatus === 'connecting' && currentSocket) {
    const startedAt = ctx.infra.socketConnectStartedAt;
    const elapsed = Number.isFinite(startedAt) ? nowFrom(deps) - startedAt : 0;
    const timeout = Number.isFinite(deps.connectStuckTimeoutMs)
      ? deps.connectStuckTimeoutMs
      : SOCKET_CONNECT_STUCK_TIMEOUT_MS;
    if (elapsed < timeout) {
      return ctx.infra.socketReconnectPromise || Promise.resolve(currentSocket);
    }
    force = true;
  }

  if (!force && ctx.infra.socketReconnectPromise) {
    return ctx.infra.socketReconnectPromise;
  }

  const generation = ctx.infra.socketReconnectGeneration + 1;
  ctx.infra.socketReconnectGeneration = generation;
  const roomId = ctx.$store.getters.roomId;
  const wasUserLogin = Boolean(ctx.$store.getters.userIsLogin);

  hideSocketStatus(ctx, deps);
  detachCurrentSocket(ctx, deps, { preserveRecoveryListeners: true });
  ctx.infra.socketStatus = 'disconnected';
  ctx.infra.socketRecoveryPending = true;
  ctx.infra.socketReconnectReason = reason;

  const reconnectPromise = performReconnect(ctx, generation, roomId, wasUserLogin, deps);
  ctx.infra.socketReconnectPromise = reconnectPromise;
  void reconnectPromise.finally(() => {
    if (ctx.infra.socketReconnectPromise === reconnectPromise) {
      ctx.infra.socketReconnectPromise = null;
    }
  });
  return reconnectPromise;
};

export const disposeTimelineSocket = (ctx, deps = {}) => {
  ensureReconnectState(ctx);
  ctx.infra.socketReconnectGeneration += 1;
  ctx.infra.socketDisposed = true;
  ctx.infra.socketRecoveryPending = false;
  ctx.infra.socketReconnectPromise = null;
  detachCurrentSocket(ctx, deps, { preserveRecoveryListeners: false });
  ctx.infra.finishSocketConnectAttempt = null;
};
