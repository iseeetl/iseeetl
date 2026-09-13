import { expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import {
  createE2EDiagnostics,
  createE2EDiagnosticsPlugin,
} from '../../e2e/runtime/e2eDiagnostics';

const createSocket = ({ connected = true, id = 'socket-1' } = {}) => {
  const listeners = new Map();
  const socket = {
    connected,
    id,
    on(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
      return this;
    },
    once(event, handler) {
      const wrapped = (...args) => {
        this.off(event, wrapped);
        handler(...args);
      };
      return this.on(event, wrapped);
    },
    off(event, handler) {
      const handlers = listeners.get(event) || [];
      listeners.set(
        event,
        handlers.filter((candidate) => candidate !== handler)
      );
      return this;
    },
    emitLocal(event, ...args) {
      [...(listeners.get(event) || [])].forEach((handler) => handler(...args));
    },
    connect: vi.fn(),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
    listenerCount(event) {
      return (listeners.get(event) || []).length;
    },
  };
  return socket;
};

const registerPorts = (diagnostics, socket = createSocket()) => {
  diagnostics.registerSessionPort({
    getSummary: () => ({
      loggedIn: true,
      role: 'User',
      userIdPresent: true,
      guestIdPresent: false,
      credentialPresent: true,
    }),
    captureCredential: () => ({
      userToken: 'secret-user-token',
      userId: 'secret-user-id',
      lang: 'ja',
    }),
  });
  const cleanup = diagnostics.registerTimelinePort({
    getSocket: () => socket,
    disconnect: () => {
      socket.disconnect();
      return true;
    },
    getSummary: () => ({
      connected: socket.connected,
      connectionId: socket.id,
      roomMemberCount: 2,
      roomReady: true,
    }),
  });
  return { socket, cleanup };
};

describe('E2E用の状態取得とイベント観測', () => {
  it('E2Eプラグインはセッションとタイムラインだけを公開APIへ接続する', () => {
    const target = {};
    const mixins = [];
    const socket = createSocket();
    const applicationStore = {
      getters: {
        userIsLogin: true,
        userRole: 'User',
        userId: 'user-1',
        guestId: '',
        userToken: 'secret-user-token',
        guestToken: '',
        lang: 'ja',
      },
    };
    const plugin = createE2EDiagnosticsPlugin({ applicationStore, globalObject: target });
    plugin.install({ mixin: (mixin) => mixins.push(mixin) });

    expect(target.__ISEEETL_E2E__.getSessionSummary()).to.deep.equal({
      loggedIn: true,
      role: 'User',
      userIdPresent: true,
      guestIdPresent: false,
      credentialPresent: true,
    });
    expect(mixins).to.have.length(1);

    const timeline = {
      $options: { name: 'Timeline' },
      infra: { socket },
      room: { status: { roomSize: 3 } },
    };
    mixins[0].mounted.call(timeline);
    expect(target.__ISEEETL_E2E__.getTimelineSummary()).to.deep.equal({
      mounted: true,
      connected: true,
      connectionId: 'socket-1',
      roomMemberCount: 3,
      roomReady: true,
    });
    expect(target.__ISEEETL_E2E__.disconnectTimeline()).to.equal(true);
    expect(socket.disconnect).toHaveBeenCalledOnce();

    mixins[0].unmounted.call(timeline);
    expect(target.__ISEEETL_E2E__.getTimelineSummary().mounted).to.equal(false);
  });

  it('公開APIを変更できない状態で1回だけ登録する', () => {
    const diagnostics = createE2EDiagnostics();
    const target = {};

    expect(diagnostics.install(target)).to.equal(true);
    expect(diagnostics.install(target)).to.equal(false);
    expect(target.__ISEEETL_E2E__).to.equal(diagnostics.facade);
    expect(Object.isFrozen(target.__ISEEETL_E2E__)).to.equal(true);
    expect(target.__ISEEETL_E2E__.version).to.equal(1);
  });

  it('TimeLineの製品側beforeUnmount後に診断ポートを解除する', () => {
    const events = [];
    const diagnostics = {
      install: vi.fn(),
      registerSessionPort: vi.fn(),
      registerTimelinePort: vi.fn(() => () => events.push('diagnostics-cleanup')),
    };
    const plugin = createE2EDiagnosticsPlugin({
      applicationStore: { getters: {} },
      diagnostics,
      globalObject: {},
    });
    const Timeline = defineComponent({
      name: 'Timeline',
      data: () => ({ infra: { socket: null }, room: { status: null } }),
      beforeUnmount: () => events.push('socket-disconnect'),
      render: () => h('div'),
    });
    const wrapper = mount(Timeline, { global: { plugins: [plugin] } });

    wrapper.unmount();

    expect(events).to.deep.equal(['socket-disconnect', 'diagnostics-cleanup']);
  });

  it('未登録時は秘密値を含めず空の状態情報を返す', () => {
    const { facade } = createE2EDiagnostics();

    expect(facade.getSessionSummary()).to.deep.equal({
      loggedIn: false,
      role: '',
      userIdPresent: false,
      guestIdPresent: false,
      credentialPresent: false,
    });
    expect(facade.getTimelineSummary()).to.deep.equal({
      mounted: false,
      connected: false,
      connectionId: '',
      roomMemberCount: 0,
      roomReady: false,
    });
    expect(JSON.stringify(facade)).not.to.contain('secret');
  });

  it('セッションとタイムラインの状態だけを公開し、内部の接続先を返さない', () => {
    const diagnostics = createE2EDiagnostics();
    registerPorts(diagnostics);

    expect(diagnostics.facade.getSessionSummary()).to.deep.equal({
      loggedIn: true,
      role: 'User',
      userIdPresent: true,
      guestIdPresent: false,
      credentialPresent: true,
    });
    expect(diagnostics.facade.getTimelineSummary()).to.deep.equal({
      mounted: true,
      connected: true,
      connectionId: 'socket-1',
      roomMemberCount: 2,
      roomReady: true,
    });
    expect(JSON.stringify(diagnostics.facade.getSessionSummary())).not.to.contain('secret-user-token');
    expect(JSON.stringify(diagnostics.facade.getTimelineSummary())).not.to.contain('secret-user-id');
  });

  it('許可リスト外のprobeを拒否し、許可されたイベントを件数だけで観測する', () => {
    const diagnostics = createE2EDiagnostics();
    const { socket } = registerPorts(diagnostics);

    expect(diagnostics.facade.startTimelineProbe('arbitrary-event')).to.equal('');
    const probeId = diagnostics.facade.startTimelineProbe('post-created');
    expect(probeId).to.match(/^probe-/);
    socket.emitLocal('POST_CREATE', { token: 'must-not-be-exposed' });
    socket.emitLocal('disconnect', 'io server disconnect');

    expect(diagnostics.facade.readTimelineProbe(probeId)).to.include({
      found: true,
      type: 'post-created',
      connected: true,
      disconnected: true,
      eventCount: 1,
      disconnectCount: 1,
      reason: 'server',
    });
    expect(JSON.stringify(diagnostics.facade.readTimelineProbe(probeId))).not.to.contain('must-not-be-exposed');
    expect(diagnostics.facade.stopTimelineProbe(probeId)).to.equal(true);
    expect(socket.listenerCount('POST_CREATE')).to.equal(0);
  });

  it('タイムラインアンマウント時にprobe リスナーを外し、結果の明示後処理は継続できる', () => {
    const diagnostics = createE2EDiagnostics();
    const { socket, cleanup } = registerPorts(diagnostics);
    const probeId = diagnostics.facade.startTimelineProbe('access-revoked');
    socket.emitLocal('RECEIVE_COMPLETE_DELETE_ROOM_MEMBER');

    cleanup();

    expect(diagnostics.facade.getTimelineSummary().mounted).to.equal(false);
    expect(diagnostics.facade.readTimelineProbe(probeId)).to.include({ found: true, eventCount: 1 });
    expect(socket.listenerCount('RECEIVE_COMPLETE_DELETE_ROOM_MEMBER')).to.equal(0);
    expect(diagnostics.facade.stopTimelineProbe(probeId)).to.equal(true);
  });

  it('タイムラインアンマウント後も副接続を維持し、明示後処理で切断する', () => {
    const secondarySocket = createSocket({ connected: false, id: 'secondary-1' });
    const createSocketImpl = vi.fn(() => secondarySocket);
    const diagnostics = createE2EDiagnostics({ createSocketImpl });
    const { cleanup } = registerPorts(diagnostics);

    const connectionId = diagnostics.facade.openSecondaryTimelineConnection('room-1');
    expect(connectionId).to.match(/^secondary-/);
    expect(createSocketImpl).toHaveBeenCalledWith({ room_id: 'room-1', user_token: 'secret-user-token', lang: 'ja' });
    secondarySocket.connected = true;
    secondarySocket.emitLocal('connect');
    secondarySocket.emitLocal('POST_CREATE', { content: 'must-not-be-exposed' });

    expect(diagnostics.facade.readSecondaryTimelineConnection(connectionId)).to.include({
      found: true,
      connected: true,
      connectionId: 'secondary-1',
      connectCount: 1,
      receivedCount: 1,
    });
    expect(JSON.stringify(diagnostics.facade.readSecondaryTimelineConnection(connectionId))).not.to.contain(
      'must-not-be-exposed'
    );
    cleanup();
    expect(diagnostics.facade.getTimelineSummary().mounted).to.equal(false);
    expect(diagnostics.facade.readSecondaryTimelineConnection(connectionId)).to.include({
      found: true,
      connected: true,
      connectionId: 'secondary-1',
    });
    expect(secondarySocket.disconnect).not.toHaveBeenCalled();
    expect(diagnostics.facade.closeSecondaryTimelineConnection(connectionId)).to.equal(true);
    expect(secondarySocket.disconnect).toHaveBeenCalledOnce();
  });

  it('失効した認証情報は固定APIとSocket再接続だけで拒否を確認する', async () => {
    let scheduledCallback;
    const fetchImpl = vi.fn(async () => ({ status: 401 }));
    const diagnostics = createE2EDiagnostics({
      fetchImpl,
      apiBaseUrl: 'http://backend.test',
      schedule: (callback) => {
        scheduledCallback = callback;
        return 1;
      },
      cancel: vi.fn(),
    });
    const { socket } = registerPorts(diagnostics);
    socket.connect.mockImplementation(() => socket.emitLocal('connect_error'));
    const probeId = diagnostics.facade.startTimelineProbe('session-revoked');

    const result = await diagnostics.facade.verifyCapturedCredentialRejected(probeId);

    expect(result).to.deep.equal({
      found: true,
      attempted: true,
      socketRejected: true,
      httpChecked: true,
      httpRejected: true,
      reconnected: false,
      reason: 'rejected',
    });
    expect(fetchImpl).toHaveBeenCalledWith('http://backend.test/api/user/detail', {
      method: 'GET',
      headers: { authorization: 'Bearer secret-user-token' },
    });
    expect(scheduledCallback).to.be.a('function');
  });

  it('認証競合probeは許可された実apiClient経路の安全な結果だけを公開する', async () => {
    let rejectRequest;
    const apiRequestImpl = vi.fn(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    const diagnostics = createE2EDiagnostics({ apiRequestImpl });

    expect(diagnostics.facade.startAuthRaceRequest('arbitrary')).to.equal('');
    const requestId = diagnostics.facade.startAuthRaceRequest('user-401');
    expect(requestId).to.match(/^auth-race-/);
    expect(diagnostics.facade.readAuthRaceRequest(requestId)).to.deep.equal({
      found: true,
      scenario: 'user-401',
      settled: false,
      outcome: 'pending',
      status: 0,
    });
    expect(diagnostics.facade.stopAuthRaceRequest(requestId)).to.equal(false);

    await vi.waitFor(() => expect(apiRequestImpl).toHaveBeenCalledWith('user-401'));
    rejectRequest({
      response: {
        status: 401,
        data: { token: 'must-not-be-exposed' },
      },
    });
    await vi.waitFor(() =>
      expect(diagnostics.facade.readAuthRaceRequest(requestId).settled).to.equal(true)
    );

    expect(diagnostics.facade.readAuthRaceRequest(requestId)).to.deep.equal({
      found: true,
      scenario: 'user-401',
      settled: true,
      outcome: 'rejected',
      status: 401,
    });
    expect(JSON.stringify(diagnostics.facade.readAuthRaceRequest(requestId))).not.to.contain(
      'must-not-be-exposed'
    );
    expect(diagnostics.facade.stopAuthRaceRequest(requestId)).to.equal(true);
    expect(diagnostics.facade.readAuthRaceRequest(requestId).found).to.equal(false);
  });
});
