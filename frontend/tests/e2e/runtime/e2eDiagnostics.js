import apiClient, { API_BASE_URL } from '@/api/apiClient';
import { createSocket } from '@/features/timeline/socketClient';

const FACADE_NAME = '__ISEEETL_E2E__';
const ALLOWED_PROBES = new Set([
  'connection-state',
  'post-created',
  'access-revoked',
  'session-revoked',
  'connect-error',
]);
const ALLOWED_AUTH_RACE_SCENARIOS = new Set(['user-401', 'guest-refresh']);

const normalizeReason = (value) => {
  const reason = typeof value === 'string' ? value : '';
  if (reason === 'io server disconnect') return 'server';
  if (reason === 'io client disconnect') return 'client';
  if (reason === 'transport close' || reason === 'transport error') return 'transport';
  return reason ? 'other' : '';
};

const createOpaqueIdFactory = () => {
  let sequence = 0;
  return (prefix) => {
    sequence += 1;
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${sequence.toString(36)}`;
    return `${prefix}-${random}`;
  };
};

const addSocketListener = (socket, event, handler, listeners) => {
  if (!socket || typeof socket.on !== 'function') return;
  socket.on(event, handler);
  listeners.push({ event, handler });
};

const removeSocketListeners = (socket, listeners) => {
  if (socket && typeof socket.off === 'function') {
    listeners.forEach(({ event, handler }) => socket.off(event, handler));
  }
  listeners.length = 0;
};

const emptySessionSummary = () => ({
  loggedIn: false,
  role: '',
  userIdPresent: false,
  guestIdPresent: false,
  credentialPresent: false,
});

const emptyTimelineSummary = () => ({
  mounted: false,
  connected: false,
  connectionId: '',
  roomMemberCount: 0,
  roomReady: false,
});

export const createE2EDiagnostics = ({
  createSocketImpl = createSocket,
  fetchImpl = (...args) => globalThis.fetch(...args),
  apiRequestImpl = (scenario) =>
    apiClient.get('/api/user/detail', { params: { e2e_auth_race: scenario } }),
  apiBaseUrl = API_BASE_URL,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timerId) => clearTimeout(timerId),
} = {}) => {
  const nextId = createOpaqueIdFactory();
  let sessionPort = null;
  let timelinePort = null;
  const probes = new Map();
  const secondaryConnections = new Map();
  const authRaceRequests = new Map();

  const captureCredential = () => {
    const snapshot = sessionPort?.captureCredential?.() || {};
    return {
      userToken: typeof snapshot.userToken === 'string' ? snapshot.userToken : '',
      guestToken: typeof snapshot.guestToken === 'string' ? snapshot.guestToken : '',
      guestId: typeof snapshot.guestId === 'string' ? snapshot.guestId : '',
      userId: typeof snapshot.userId === 'string' ? snapshot.userId : '',
      lang: typeof snapshot.lang === 'string' ? snapshot.lang : '',
    };
  };

  const getSessionSummary = () => {
    const summary = sessionPort?.getSummary?.() || {};
    return {
      loggedIn: summary.loggedIn === true,
      role: typeof summary.role === 'string' ? summary.role : '',
      userIdPresent: summary.userIdPresent === true,
      guestIdPresent: summary.guestIdPresent === true,
      credentialPresent: summary.credentialPresent === true,
    };
  };

  const getTimelineSummary = () => {
    const summary = timelinePort?.getSummary?.() || {};
    return {
      mounted: Boolean(timelinePort),
      connected: summary.connected === true,
      connectionId: typeof summary.connectionId === 'string' ? summary.connectionId : '',
      roomMemberCount: Number.isFinite(summary.roomMemberCount) ? Number(summary.roomMemberCount) : 0,
      roomReady: summary.roomReady === true,
    };
  };

  const disconnectTimeline = () => timelinePort?.disconnect?.() === true;

  const detachProbe = (probe) => {
    if (!probe || probe.detached) return;
    removeSocketListeners(probe.socket, probe.listeners);
    probe.detached = true;
  };

  const startTimelineProbe = (type) => {
    if (!ALLOWED_PROBES.has(type)) return '';
    const socket = timelinePort?.getSocket?.();
    if (!socket) return '';

    const id = nextId('probe');
    const credential = captureCredential();
    const timelineSummary = getTimelineSummary();
    const probe = {
      id,
      type,
      socket,
      listeners: [],
      detached: false,
      credential,
      initialConnectionId: timelineSummary.connectionId,
      connected: socket.connected === true,
      disconnected: false,
      disconnectCount: 0,
      connectCount: 0,
      connectErrorCount: 0,
      eventCount: 0,
      reason: '',
      reconnectAttempted: false,
      reconnectRejected: false,
      reconnected: false,
    };

    const onConnect = () => {
      probe.connected = true;
      probe.connectCount += 1;
    };
    const onDisconnect = (reason) => {
      probe.connected = false;
      probe.disconnected = true;
      probe.disconnectCount += 1;
      probe.reason = normalizeReason(reason);
    };
    const onConnectError = () => {
      probe.connected = false;
      probe.connectErrorCount += 1;
    };
    addSocketListener(socket, 'connect', onConnect, probe.listeners);
    addSocketListener(socket, 'disconnect', onDisconnect, probe.listeners);
    addSocketListener(socket, 'connect_error', onConnectError, probe.listeners);

    if (type === 'post-created') {
      addSocketListener(socket, 'POST_CREATE', () => (probe.eventCount += 1), probe.listeners);
    } else if (type === 'access-revoked') {
      addSocketListener(socket, 'ACCESS_REVOKED', () => (probe.eventCount += 1), probe.listeners);
      addSocketListener(
        socket,
        'RECEIVE_COMPLETE_DELETE_ROOM_MEMBER',
        () => (probe.eventCount += 1),
        probe.listeners
      );
      addSocketListener(socket, 'KICKED_USER', () => (probe.eventCount += 1), probe.listeners);
      addSocketListener(socket, 'POST_CREATE', () => (probe.postCreateCount = (probe.postCreateCount || 0) + 1), probe.listeners);
    } else if (type === 'session-revoked') {
      addSocketListener(socket, 'SESSION_REVOKED', () => (probe.eventCount += 1), probe.listeners);
      addSocketListener(socket, 'POST_CREATE', () => (probe.postCreateCount = (probe.postCreateCount || 0) + 1), probe.listeners);
    }

    probes.set(id, probe);
    return id;
  };

  const readTimelineProbe = (id) => {
    const probe = probes.get(id);
    if (!probe) {
      return {
        found: false,
        type: '',
        connected: false,
        disconnected: false,
        eventCount: 0,
        disconnectCount: 0,
        connectCount: 0,
        connectErrorCount: 0,
        postCreateCount: 0,
        reason: 'not-found',
        connectionChanged: false,
        guestIdentityPreserved: false,
        guestIdentityChanged: false,
        credentialChanged: false,
        roomReady: false,
      };
    }
    const currentCredential = captureCredential();
    const timelineSummary = getTimelineSummary();
    const hadGuestIdentity = Boolean(probe.credential.guestId);
    const hasCurrentGuestIdentity = Boolean(currentCredential.guestId);
    return {
      found: true,
      type: probe.type,
      connected: probe.socket?.connected === true,
      disconnected: probe.disconnected,
      eventCount: probe.eventCount,
      postCreateCount: probe.postCreateCount || 0,
      disconnectCount: probe.disconnectCount,
      connectCount: probe.connectCount,
      connectErrorCount: probe.connectErrorCount,
      reason: probe.reason,
      connectionChanged: Boolean(
        probe.initialConnectionId &&
          timelineSummary.connectionId &&
          probe.initialConnectionId !== timelineSummary.connectionId
      ),
      guestIdentityPreserved: Boolean(
        hadGuestIdentity && hasCurrentGuestIdentity && probe.credential.guestId === currentCredential.guestId
      ),
      guestIdentityChanged: Boolean(
        hadGuestIdentity && hasCurrentGuestIdentity && probe.credential.guestId !== currentCredential.guestId
      ),
      credentialChanged: Boolean(
        (probe.credential.userToken && probe.credential.userToken !== currentCredential.userToken) ||
          (probe.credential.guestToken && probe.credential.guestToken !== currentCredential.guestToken)
      ),
      roomReady: timelineSummary.roomReady,
    };
  };

  const stopTimelineProbe = (id) => {
    const probe = probes.get(id);
    if (!probe) return false;
    detachProbe(probe);
    probes.delete(id);
    return true;
  };

  const buildSocketQuery = (roomId, credential) => {
    const query = { room_id: roomId };
    if (credential.userToken) query.user_token = credential.userToken;
    if (credential.guestToken) query.guest_token = credential.guestToken;
    if (credential.lang) query.lang = credential.lang;
    return query;
  };

  const openSecondaryTimelineConnection = (roomId) => {
    const normalizedRoomId = typeof roomId === 'string' ? roomId.trim() : '';
    if (!normalizedRoomId) return '';
    const credential = captureCredential();
    if (!credential.userToken && !credential.guestToken) return '';

    const socket = createSocketImpl(buildSocketQuery(normalizedRoomId, credential));
    const id = nextId('secondary');
    const connection = {
      socket,
      listeners: [],
      connected: socket.connected === true,
      disconnected: false,
      connectCount: 0,
      disconnectCount: 0,
      connectErrorCount: 0,
      receivedCount: 0,
      reason: '',
      closed: false,
    };
    addSocketListener(
      socket,
      'connect',
      () => {
        connection.connected = true;
        connection.connectCount += 1;
      },
      connection.listeners
    );
    addSocketListener(
      socket,
      'disconnect',
      (reason) => {
        connection.connected = false;
        connection.disconnected = true;
        connection.disconnectCount += 1;
        connection.reason = normalizeReason(reason);
      },
      connection.listeners
    );
    addSocketListener(
      socket,
      'connect_error',
      () => {
        connection.connected = false;
        connection.connectErrorCount += 1;
      },
      connection.listeners
    );
    addSocketListener(socket, 'POST_CREATE', () => (connection.receivedCount += 1), connection.listeners);
    secondaryConnections.set(id, connection);
    return id;
  };

  const readSecondaryTimelineConnection = (id) => {
    const connection = secondaryConnections.get(id);
    if (!connection) {
      return {
        found: false,
        connected: false,
        connectionId: '',
        disconnected: false,
        connectCount: 0,
        disconnectCount: 0,
        connectErrorCount: 0,
        receivedCount: 0,
        reason: 'not-found',
      };
    }
    return {
      found: true,
      connected: connection.socket?.connected === true,
      connectionId: typeof connection.socket?.id === 'string' ? connection.socket.id : '',
      disconnected: connection.disconnected,
      connectCount: connection.connectCount,
      disconnectCount: connection.disconnectCount,
      connectErrorCount: connection.connectErrorCount,
      receivedCount: connection.receivedCount,
      reason: connection.reason,
    };
  };

  const closeSecondaryTimelineConnection = (id) => {
    const connection = secondaryConnections.get(id);
    if (!connection) return false;
    removeSocketListeners(connection.socket, connection.listeners);
    connection.socket?.disconnect?.();
    connection.closed = true;
    secondaryConnections.delete(id);
    return true;
  };

  const waitForReconnectResult = (probe) =>
    new Promise((resolve) => {
      const socket = probe.socket;
      if (!socket || typeof socket.connect !== 'function') {
        resolve({ attempted: false, rejected: false, reconnected: false });
        return;
      }
      probe.reconnectAttempted = true;
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        cancel(timerId);
        socket.off?.('connect_error', onError);
        socket.off?.('connect', onConnect);
        resolve(result);
      };
      const onError = () => {
        probe.reconnectRejected = true;
        finish({ attempted: true, rejected: true, reconnected: false });
      };
      const onConnect = () => {
        probe.reconnected = true;
        finish({ attempted: true, rejected: false, reconnected: true });
      };
      socket.once?.('connect_error', onError);
      socket.once?.('connect', onConnect);
      const timerId = schedule(
        () => finish({ attempted: true, rejected: false, reconnected: socket.connected === true }),
        10000
      );
      socket.connect();
    });

  const verifyCapturedCredentialRejected = async (id) => {
    const probe = probes.get(id);
    if (!probe) {
      return {
        found: false,
        attempted: false,
        socketRejected: false,
        httpChecked: false,
        httpRejected: false,
        reconnected: false,
        reason: 'not-found',
      };
    }
    const reconnect = await waitForReconnectResult(probe);
    let httpChecked = false;
    let httpRejected = false;
    if (probe.type === 'session-revoked' && probe.credential.userToken) {
      httpChecked = true;
      try {
        const response = await fetchImpl(`${apiBaseUrl || ''}/api/user/detail`, {
          method: 'GET',
          headers: { authorization: `Bearer ${probe.credential.userToken}` },
        });
        httpRejected = response.status === 401;
      } catch (_) {
        httpRejected = false;
      }
    }
    return {
      found: true,
      attempted: reconnect.attempted,
      socketRejected: reconnect.rejected,
      httpChecked,
      httpRejected,
      reconnected: reconnect.reconnected,
      reason: reconnect.rejected ? 'rejected' : reconnect.reconnected ? 'accepted' : 'timeout',
    };
  };

  const startAuthRaceRequest = (scenario) => {
    if (!ALLOWED_AUTH_RACE_SCENARIOS.has(scenario)) return '';
    const id = nextId('auth-race');
    const request = {
      scenario,
      settled: false,
      outcome: 'pending',
      status: 0,
    };
    authRaceRequests.set(id, request);
    void Promise.resolve()
      .then(() => apiRequestImpl(scenario))
      .then(
        (response) => {
          request.outcome = 'fulfilled';
          request.status = Number(response?.status || 0);
        },
        (error) => {
          request.outcome = 'rejected';
          request.status = Number(error?.response?.status || 0);
        }
      )
      .finally(() => {
        request.settled = true;
      });
    return id;
  };

  const readAuthRaceRequest = (id) => {
    const request = authRaceRequests.get(id);
    if (!request) {
      return {
        found: false,
        scenario: '',
        settled: false,
        outcome: 'not-found',
        status: 0,
      };
    }
    return {
      found: true,
      scenario: request.scenario,
      settled: request.settled,
      outcome: request.outcome,
      status: request.status,
    };
  };

  const stopAuthRaceRequest = (id) => {
    const request = authRaceRequests.get(id);
    if (!request || !request.settled) return false;
    authRaceRequests.delete(id);
    return true;
  };

  const registerSessionPort = (port) => {
    sessionPort = port && typeof port === 'object' ? port : null;
    return () => {
      if (sessionPort === port) sessionPort = null;
    };
  };

  const registerTimelinePort = (port) => {
    if (timelinePort && timelinePort !== port) {
      probes.forEach(detachProbe);
    }
    timelinePort = port && typeof port === 'object' ? port : null;
    return () => {
      if (timelinePort !== port) return;
      probes.forEach(detachProbe);
      timelinePort = null;
    };
  };

  const facade = Object.freeze({
    version: 1,
    getSessionSummary,
    getTimelineSummary,
    disconnectTimeline,
    startTimelineProbe,
    readTimelineProbe,
    stopTimelineProbe,
    openSecondaryTimelineConnection,
    readSecondaryTimelineConnection,
    closeSecondaryTimelineConnection,
    verifyCapturedCredentialRejected,
    startAuthRaceRequest,
    readAuthRaceRequest,
    stopAuthRaceRequest,
  });

  const install = (globalObject = globalThis.window) => {
    if (!globalObject || Object.prototype.hasOwnProperty.call(globalObject, FACADE_NAME)) return false;
    Object.defineProperty(globalObject, FACADE_NAME, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: facade,
    });
    return true;
  };

  return {
    facade,
    install,
    registerSessionPort,
    registerTimelinePort,
    getSessionSummary,
    getTimelineSummary,
    emptySessionSummary,
    emptyTimelineSummary,
  };
};

const createSessionPort = (applicationStore) => ({
  getSummary: () => ({
    loggedIn: applicationStore.getters.userIsLogin === true,
    role: applicationStore.getters.userRole || '',
    userIdPresent: Boolean(applicationStore.getters.userId),
    guestIdPresent: Boolean(applicationStore.getters.guestId),
    credentialPresent: Boolean(
      applicationStore.getters.userToken || applicationStore.getters.guestToken
    ),
  }),
  captureCredential: () => ({
    userToken: applicationStore.getters.userToken || '',
    guestToken: applicationStore.getters.guestToken || '',
    guestId: applicationStore.getters.guestId || '',
    userId: applicationStore.getters.userId || '',
    lang: applicationStore.getters.lang || '',
  }),
});

const createTimelinePort = (context) => ({
  getSocket: () => context.infra.socket,
  disconnect: () => {
    const socket = context.infra.socket;
    if (!socket || typeof socket.disconnect !== 'function') return false;
    socket.disconnect();
    return true;
  },
  getSummary: () => ({
    connected: context.infra.socket?.connected === true,
    connectionId: context.infra.socket?.id ? String(context.infra.socket.id) : '',
    roomMemberCount: Number(context.room.status?.roomSize) || 0,
    roomReady: Boolean(context.room.status),
  }),
});

export const createE2EDiagnosticsPlugin = ({
  applicationStore,
  diagnostics = createE2EDiagnostics(),
  globalObject = globalThis.window,
} = {}) => {
  const timelineCleanups = new WeakMap();

  return {
    diagnostics,
    install(application) {
      diagnostics.install(globalObject);
      diagnostics.registerSessionPort(createSessionPort(applicationStore));
      application.mixin({
        mounted() {
          if (this.$options?.name !== 'Timeline') return;
          timelineCleanups.set(this, diagnostics.registerTimelinePort(createTimelinePort(this)));
        },
        unmounted() {
          if (this.$options?.name !== 'Timeline') return;
          timelineCleanups.get(this)?.();
          timelineCleanups.delete(this);
        },
      });
    },
  };
};
