const { createServer, normalizeSocketRoom } = require('../../../bootstrap/createServer');

const buildConfig = () => ({
  nodeEnv: 'test',
  capabilities: Object.freeze({ googleLogin: false }),
  privateConfig: Object.freeze({
    analytics: Object.freeze({ measurementId: null, userIdSecret: null }),
  }),
  corsAllowedOrigins: ['https://allowed.example.invalid'],
  mediaRoot: '/test-fixtures/create-server/media',
  profileRoot: '/test-fixtures/create-server/profile',
  distRoot: '/test-fixtures/create-server/dist',
  socketCors: { cors: { origin: ['https://socket.example.invalid'] }, originLabel: 'test' },
});

describe('HTTP・Socketサーバの構成', () => {
  test('HTTP、Socket、Express設定を同じ実行環境へ組み立てる', () => {
    const app = jest.fn();
    const server = { kind: 'http-server' };
    const originalTo = jest.fn(() => ({ emit: jest.fn() }));
    const originalIn = jest.fn(() => ({ emit: jest.fn() }));
    const io = { to: originalTo, in: originalIn };
    const SocketServer = jest.fn(function SocketServer() {
      return io;
    });
    const createHttpServer = jest.fn(() => server);
    const registerSocketHandlers = jest.fn();
    const configureHttpApp = jest.fn();
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const config = buildConfig();

    const runtime = createServer({
      config,
      logger,
      createExpressApp: () => app,
      createHttpServer,
      SocketServer,
      registerSocketHandlers,
      configureHttpApp,
    });

    expect(createHttpServer).toHaveBeenCalledWith(app);
    expect(SocketServer).toHaveBeenCalledWith(server, {
      pingInterval: 5000,
      pingTimeout: 15000,
      allowEIO3: true,
      cors: config.socketCors.cors,
    });
    expect(registerSocketHandlers).toHaveBeenCalledWith(io, runtime.roomParticipants);
    expect(io.roomLanguageProvider.getLanguages('missing-room')).toEqual([]);
    expect(configureHttpApp).toHaveBeenCalledWith({
      app,
      io,
      config: {
        nodeEnv: config.nodeEnv,
        capabilities: config.capabilities,
        privateConfig: config.privateConfig,
        corsAllowedOrigins: config.corsAllowedOrigins,
        mediaRoot: config.mediaRoot,
        profileRoot: config.profileRoot,
        distRoot: config.distRoot,
      },
      logger,
    });
    expect(runtime).toEqual({ app, server, io, roomParticipants: expect.any(Map) });
  });

  test('Socketの配信グループ指定を文字列へ統一する', () => {
    const id = { toString: () => 'room-1' };

    expect(normalizeSocketRoom(id)).toBe('room-1');
    expect(normalizeSocketRoom([id, 'room-2'])).toEqual(['room-1', 'room-2']);
    expect(normalizeSocketRoom(null)).toBeNull();
  });

  test('設定なしでは構築しない', () => {
    expect(() => createServer()).toThrow('createServer requires config');
  });
});
