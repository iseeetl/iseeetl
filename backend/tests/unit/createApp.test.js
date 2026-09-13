const { EventEmitter } = require('events');

const { snapshotEnv, restoreEnv } = require('./_helpers/env');

jest.mock('http', () => ({
  ...jest.requireActual('http'),
  createServer: jest.fn(),
}));
jest.mock('mongoose', () => ({
  connect: jest.fn(),
}));
jest.mock('socket.io', () => ({
  Server: jest.fn(),
}));
jest.mock('../../routes/apiMounts', () => ({
  registerApiMounts: jest.fn(),
}));
jest.mock('../../routes/media.route', () =>
  jest.fn(() => (_req, _res, next) => next())
);
jest.mock('../../middlewares/errorHandler', () => ({
  createErrorHandler: jest.fn(
    () =>
      function mockedErrorHandler(err, _req, _res, next) {
        next(err);
      }
  ),
}));

const ENV_KEYS = ['NODE_ENV', 'MEDIA_PATH', 'PROFILE_PATH', 'DIST_PATH'];
const ORIGINAL_ENV = snapshotEnv(ENV_KEYS);

const buildConfig = (overrides = {}) => ({
  nodeEnv: 'test',
  capabilities: Object.freeze({
    googleLogin: false,
    lineLogin: false,
    mailDelivery: false,
    oneSignalPush: false,
    googleTranslate: false,
    openaiTranscription: false,
    openaiAnalysis: false,
    googleAnalytics: false,
  }),
  privateConfig: Object.freeze({
    analytics: Object.freeze({ measurementId: null, userIdSecret: null }),
  }),
  corsAllowedOrigins: ['https://allowed.example.invalid'],
  mediaRoot: '/test-fixtures/create-app/media',
  profileRoot: '/test-fixtures/create-app/profile',
  distRoot: '/test-fixtures/create-app/dist',
  ...overrides,
});

const buildLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const buildDependencies = (overrides = {}) => ({
  io: { to: jest.fn(), in: jest.fn() },
  config: buildConfig(),
  logger: buildLogger(),
  ...overrides,
});

const loadModules = () => ({
  factory: require('../../createApp'),
  registerApiMounts: require('../../routes/apiMounts').registerApiMounts,
  createErrorHandler: require('../../middlewares/errorHandler').createErrorHandler,
});

describe('アプリの生成と設定', () => {
  afterEach(() => {
    restoreEnv(ORIGINAL_ENV);
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('configureAppとcreateAppを名前付き関数として公開する', () => {
    const { factory } = loadModules();

    expect(factory).toEqual({
      configureApp: expect.any(Function),
      createApp: expect.any(Function),
    });
  });

  test('注入されたアプリを設定値で構成して返す', () => {
    const express = require('express');
    const app = express();
    const dependencies = buildDependencies();
    const { factory, registerApiMounts, createErrorHandler } = loadModules();

    process.env.NODE_ENV = 'environment-sentinel';
    process.env.MEDIA_PATH = 'environment-media-sentinel';
    process.env.PROFILE_PATH = 'environment-profile-sentinel';
    process.env.DIST_PATH = 'environment-dist-sentinel';
    const envBefore = snapshotEnv(ENV_KEYS);

    const result = factory.configureApp({ app, ...dependencies });

    expect(result).toBe(app);
    expect(app.get('trust proxy')).toBe(1);
    expect(registerApiMounts).toHaveBeenCalledWith({
      app,
      io: dependencies.io,
      capabilities: dependencies.config.capabilities,
      analyticsConfig: dependencies.config.privateConfig.analytics,
      logRequest: expect.any(Function),
    });
    expect(createErrorHandler).toHaveBeenCalledWith({ logger: dependencies.logger });
    expect(snapshotEnv(ENV_KEYS)).toEqual(envBefore);
  });

  test('設定済みのExpressアプリを返す', () => {
    const dependencies = buildDependencies();
    const { factory, registerApiMounts } = loadModules();

    const app = factory.createApp(dependencies);

    expect(typeof app).toBe('function');
    expect(app.get('trust proxy')).toBe(1);
    expect(registerApiMounts).toHaveBeenCalledWith(
      expect.objectContaining({
        app,
        io: dependencies.io,
      })
    );
    expect(registerApiMounts.mock.calls[0][0]).not.toHaveProperty('roomParticipants');
  });

  test('注入されたロガーを認証リクエストとエラーの処理へ渡す', () => {
    const express = require('express');
    const app = express();
    const dependencies = buildDependencies({
      config: buildConfig({ nodeEnv: 'development' }),
    });
    const { factory, registerApiMounts, createErrorHandler } = loadModules();
    const now = jest.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(125);

    factory.configureApp({ app, ...dependencies });
    const { logRequest } = registerApiMounts.mock.calls[0][0];
    const middleware = logRequest('AuthRequest');
    const response = new EventEmitter();
    response.statusCode = 204;
    const next = jest.fn();

    middleware(
      { method: 'GET', originalUrl: '/api/auth/example?source=unit' },
      response,
      next
    );
    response.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.info).toHaveBeenCalledWith('[AuthRequest]', {
      method: 'GET',
      path: '/api/auth/example?source=unit',
      status: 204,
      durationMs: 25,
    });
    expect(createErrorHandler).toHaveBeenCalledWith({ logger: dependencies.logger });
    now.mockRestore();
  });

  test('開発環境以外では認証リクエストの情報ログを出さない', () => {
    const express = require('express');
    const app = express();
    const dependencies = buildDependencies();
    const { factory, registerApiMounts } = loadModules();

    factory.configureApp({ app, ...dependencies });
    const { logRequest } = registerApiMounts.mock.calls[0][0];
    const response = new EventEmitter();
    response.statusCode = 204;
    const next = jest.fn();

    logRequest('AuthRequest')(
      { method: 'GET', originalUrl: '/api/auth/example' },
      response,
      next
    );
    response.emit('finish');

    expect(next).toHaveBeenCalledTimes(1);
    expect(dependencies.logger.info).not.toHaveBeenCalled();
  });

  test('ロガーが注入されなければ既定のロガーを使う', () => {
    const express = require('express');
    const app = express();
    const dependencies = buildDependencies();
    delete dependencies.logger;
    const { factory, createErrorHandler } = loadModules();
    const defaultLogger = require('../../utils/logger');

    factory.configureApp({ app, ...dependencies });

    expect(createErrorHandler).toHaveBeenCalledWith({ logger: defaultLogger });
  });

  test('モジュール読込とアプリ生成だけではサーバの起動処理を始めない', () => {
    const express = require('express');
    const http = require('http');
    const mongoose = require('mongoose');
    const socketIo = require('socket.io');
    const listen = jest.spyOn(express.application, 'listen');
    const processOn = jest.spyOn(process, 'on');
    const processOnce = jest.spyOn(process, 'once');
    const processExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const signalListenersBefore = ['SIGINT', 'SIGUSR2', 'SIGTERM'].map((signal) =>
      process.rawListeners(signal)
    );
    const { factory } = loadModules();
    const dependencies = buildDependencies();

    const app = express();
    factory.configureApp({ app, ...dependencies });
    factory.createApp(dependencies);

    expect(http.createServer).not.toHaveBeenCalled();
    expect(mongoose.connect).not.toHaveBeenCalled();
    expect(socketIo.Server).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    expect(processOn).not.toHaveBeenCalled();
    expect(processOnce).not.toHaveBeenCalled();
    expect(processExit).not.toHaveBeenCalled();
    ['SIGINT', 'SIGUSR2', 'SIGTERM'].forEach((signal, index) => {
      expect(process.rawListeners(signal)).toEqual(signalListenersBefore[index]);
    });
  });
});
