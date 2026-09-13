jest.mock('../../../bootstrap/initializeIndexes', () => ({ initializeIndexes: jest.fn() }));
const { initializeIndexes } = require('../../../bootstrap/initializeIndexes');
const { startServer, runServer } = require('../../../bootstrap/startServer');
const { EventEmitter } = require('events');

const ALL_DISABLED = Object.freeze({
  googleLogin: false,
  lineLogin: false,
  mailDelivery: false,
  oneSignalPush: false,
  googleTranslate: false,
  openaiTranscription: false,
  openaiAnalysis: false,
  googleAnalytics: false,
});

const buildConfig = (overrides = {}) => ({
  nodeEnv: 'test',
  capabilities: ALL_DISABLED,
  socketCors: { cors: null, originLabel: null },
  ...overrides,
});

describe('サーバの起動順序と失敗処理', () => {
  beforeEach(() => {
    initializeIndexes.mockReset().mockResolvedValue();
  });

  test.each(['listening', 'error', 'throw'])('待受の%sを待ち、一時リスナーを解放する', async (outcome) => {
    const server = new EventEmitter();
    const error = Object.assign(new Error('listen failed'), { code: 'EADDRINUSE' });
    let listeningStarted;
    const started = new Promise((resolve) => { listeningStarted = resolve; });
    server.listen = jest.fn(() => {
      listeningStarted();
      if (outcome === 'throw') throw error;
    });
    const registerShutdown = jest.fn();
    const consoleRef = { log: jest.fn(), error: jest.fn() };
    const exit = jest.fn();
    let finished = false;
    const pending = runServer({
      env: {}, resolveConfig: () => buildConfig(),
      database: { connect: jest.fn().mockResolvedValue(), connection: {} },
      createRuntimeServer: () => ({ server, io: {} }),
      registerShutdown, consoleRef, exit,
    }).then((result) => { finished = true; return result; });
    await started;
    expect(finished).toBe(false);
    expect(registerShutdown).not.toHaveBeenCalled();
    if (outcome !== 'throw') server.emit(outcome, error);
    const result = await pending;
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
    if (outcome === 'listening') {
      expect(result.server).toBe(server);
      expect(registerShutdown).toHaveBeenCalledTimes(1);
      expect(exit).not.toHaveBeenCalled();
    } else {
      expect(result).toBeNull();
      expect(exit).toHaveBeenCalledWith(1);
      expect(registerShutdown).not.toHaveBeenCalled();
      expect(consoleRef.error).toHaveBeenCalledWith('[SERVER] startup failed:', error);
    }
  });
  test('DB接続と索引作成後にlistenと終了ハンドラ登録を行う', async () => {
    const server = new EventEmitter();
    const listen = jest.fn(() => server.emit('listening'));
    server.listen = listen;
    const runtime = { app: {}, server, io: {}, roomParticipants: new Map() };
    const createRuntimeServer = jest.fn(() => runtime);
    const database = {
      connect: jest.fn().mockResolvedValue(),
      connection: { db: {}, close: jest.fn() },
    };
    const registerShutdown = jest.fn();
    const consoleRef = { log: jest.fn(), error: jest.fn() };
    const env = {
      DB_CONNECT: 'mongodb://unit.invalid/test',
      PORT: '5500',
      NODE_ENV: 'test',
      VUE_APP_APPNAME: 'unit',
      VUE_APP_APPURL: 'http://localhost:3000',
      MEDIA_PATH: '/test-fixtures/start-server/media/',
      PROFILE_PATH: '/test-fixtures/start-server/profile/',
    };

    const result = await startServer({
      config: buildConfig(),
      env,
      database,
      promiseImplementation: Promise,
      createRuntimeServer,
      registerShutdown,
      consoleRef,
      exit: jest.fn(),
      processRef: {},
    });

    expect(database.connect).toHaveBeenCalledWith('mongodb://unit.invalid/test', {
      connectTimeoutMS: 120000,
      serverSelectionTimeoutMS: 120000,
    });
    expect(database.connect.mock.invocationCallOrder[0]).toBeLessThan(
      createRuntimeServer.mock.invocationCallOrder[0]
    );
    expect(consoleRef.log).toHaveBeenCalledWith('[DATABASE] connected');
    expect(initializeIndexes).toHaveBeenCalledTimes(1);
    expect(initializeIndexes.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
    expect(consoleRef.log).toHaveBeenCalledWith('[DATABASE] indexes ready');
    expect(consoleRef.log).toHaveBeenCalledWith(
      '[EXTERNAL_CAPABILITIES] googleLogin=disabled lineLogin=disabled mailDelivery=disabled oneSignalPush=disabled googleTranslate=disabled openaiTranscription=disabled openaiAnalysis=disabled googleAnalytics=disabled'
    );
    expect(consoleRef.log).toHaveBeenCalledWith('[SERVER] listening port=5500');
    const startupLog = consoleRef.log.mock.calls.flat().join('\n');
    expect(startupLog).not.toContain(env.VUE_APP_APPNAME);
    expect(startupLog).not.toContain(env.VUE_APP_APPURL);
    expect(startupLog).not.toContain(env.MEDIA_PATH);
    expect(startupLog).not.toContain(env.PROFILE_PATH);
    expect(listen).toHaveBeenCalledWith('5500');
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
    expect(registerShutdown).toHaveBeenCalledWith(
      expect.objectContaining({
        connection: database.connection,
        server: runtime.server,
        io: runtime.io,
        logger: consoleRef,
      })
    );
    expect(result).toEqual({ ...runtime, port: '5500' });
  });

  test('DB接続と索引作成の完了を待つ間は受付を開始しない', async () => {
    let connectDatabase;
    const connected = new Promise((resolve) => { connectDatabase = resolve; });
    let completeIndexes;
    const indexesReady = new Promise((resolve) => { completeIndexes = resolve; });
    let beginIndexes;
    const indexesStarted = new Promise((resolve) => { beginIndexes = resolve; });
    initializeIndexes.mockImplementation(() => { beginIndexes(); return indexesReady; });
    const server = new EventEmitter();
    server.listen = jest.fn(() => server.emit('listening'));
    const registerShutdown = jest.fn();
    const pending = startServer({
      config: buildConfig(), env: {},
      database: { connect: () => connected, connection: {} },
      createRuntimeServer: () => ({ server, io: {} }),
      registerShutdown, consoleRef: { log: jest.fn() },
    });
    expect(initializeIndexes).not.toHaveBeenCalled();
    expect(server.listen).not.toHaveBeenCalled();
    connectDatabase();
    await indexesStarted;
    expect(server.listen).not.toHaveBeenCalled();
    expect(registerShutdown).not.toHaveBeenCalled();
    completeIndexes();
    await pending;
    expect(server.listen).toHaveBeenCalledTimes(1);
  });

  test('索引作成に失敗した場合は受付せず終了コード1で終了する', async () => {
    const error = new Error('Index initialization failed: model=User databaseCode=11000');
    initializeIndexes.mockRejectedValue(error);
    const server = { listen: jest.fn() };
    const registerShutdown = jest.fn();
    const exit = jest.fn();
    const consoleRef = { log: jest.fn(), error: jest.fn() };
    const result = await runServer({
      resolveConfig: () => buildConfig(), env: {},
      database: { connect: jest.fn().mockResolvedValue(), connection: {} },
      createRuntimeServer: () => ({ server, io: {} }),
      registerShutdown, exit, consoleRef,
    });
    expect(result).toBeNull();
    expect(exit).toHaveBeenCalledWith(1);
    expect(server.listen).not.toHaveBeenCalled();
    expect(registerShutdown).not.toHaveBeenCalled();
    expect(consoleRef.log).not.toHaveBeenCalledWith('[DATABASE] indexes ready');
    expect(consoleRef.error).toHaveBeenCalledWith('[SERVER] startup failed:', error);
  });

  test('設定解決失敗はENVエラーとして終了する', async () => {
    const error = new Error('missing');
    const exit = jest.fn();
    const consoleRef = { log: jest.fn(), error: jest.fn() };
    const start = jest.fn();

    const result = await runServer({
      resolveConfig: () => {
        throw error;
      },
      start,
      exit,
      consoleRef,
      env: {},
    });

    expect(result).toBeNull();
    expect(consoleRef.error).toHaveBeenCalledWith('[ENV] missing');
    expect(exit).toHaveBeenCalledWith(1);
    expect(start).not.toHaveBeenCalled();
  });

  test('DB接続失敗は起動失敗として終了する', async () => {
    const error = new Error('connect failed');
    const exit = jest.fn();
    const consoleRef = { log: jest.fn(), error: jest.fn() };

    const result = await runServer({
      resolveConfig: () => buildConfig(),
      start: jest.fn().mockRejectedValue(error),
      exit,
      consoleRef,
      env: {},
    });

    expect(result).toBeNull();
    expect(consoleRef.error).toHaveBeenCalledWith('[SERVER] startup failed:', error);
    expect(exit).toHaveBeenCalledWith(1);
  });
});


test('productionの配信先不備はDB接続・実行環境作成前に拒否する', async () => {
  const database = { connect: jest.fn() };
  const createRuntimeServer = jest.fn();
  await expect(startServer({ config: buildConfig({ nodeEnv: 'production' }), database, createRuntimeServer })).rejects.toThrow('DIST_PATH');
  expect(database.connect).not.toHaveBeenCalled();
  expect(createRuntimeServer).not.toHaveBeenCalled();
});
