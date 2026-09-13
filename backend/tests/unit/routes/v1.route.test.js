const express = require('express');
const request = require('supertest');

const buildApp = (router, errorResponse) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    next();
  });
  app.use('/v1', router);
  app.use(errorResponse);
  return app;
};

describe('routes/v1 エラー応答', () => {
  let app;
  let router;
  let Messages;
  let ensureJsonWebTokenV1;
  let ensureDeveloperUserV1;
  let uploaders;
  let authorizeV1TimelineUpload;

  beforeEach(() => {
    jest.resetModules();

    jest.doMock('../../../middlewares/ensureJsonWebTokenV1', () => (req, _res, next) => {
      const role = req.headers['x-test-role'] || 'developer';
      req.jwtPayload = { user_role: role, user_id: 'user1' };
      next();
    });
    jest.doMock('../../../middlewares/ensureDeveloperUserV1', () => (_req, _res, next) => next());
    jest.doMock('@google-cloud/translate', () => ({
      v3: { TranslationServiceClient: jest.fn().mockImplementation(() => ({})) },
      v3beta1: { TranslationServiceClient: jest.fn().mockImplementation(() => ({})) },
    }));
    jest.doMock('fluent-ffmpeg', () => {
      const ffmpeg = jest.fn(() => ({}));
      ffmpeg.ffprobe = jest.fn();
      return ffmpeg;
    });

    const AppError = require('../../../utils/appError');
    const { resolveErrorCode, buildErrorResponse } = require('../../../utils/errorResponse');
    Messages = require('../../../constants/messages');
    const routerFactory = require('../../../routes/v1');
    const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
    ensureJsonWebTokenV1 = require('../../../middlewares/ensureJsonWebTokenV1');
    ensureDeveloperUserV1 = require('../../../middlewares/ensureDeveloperUserV1');
    uploaders = require('../../../middlewares/uploaders');
    ({ authorizeV1TimelineUpload } = require('../../../middlewares/authorizeUploadTarget'));

    const errorResponse = (err, req, res, _next) => {
      const status = err?.status || err?.statusCode || 500;
      const code = resolveErrorCode(err, status);
      const isAppError = err instanceof AppError || err?.name === 'AppError';
      const message = isAppError ? err.message : 'サーバーでエラーが発生しました';
      const details = isAppError ? err.details : undefined;
      res.status(status).json(buildErrorResponse({ code, message, details, status }));
    };

    router = routerFactory(io);
    app = buildApp(router, errorResponse);
  });

  const routeHandlers = (method, path) => {
    const routeLayer = router.stack.find(
      (layer) => layer.route?.path === path && layer.route.methods[method]
    );
    expect(routeLayer).toBeDefined();
    return routeLayer.route.stack.map((layer) => layer.handle);
  };

  test('広範囲のタイムライン取得ルートを公開せず、ルーム単位の取得だけを公開する', () => {
    const routePaths = router.stack
      .filter((layer) => layer.route)
      .map((layer) => layer.route.path);

    expect(routePaths).not.toContain('/timeline');
    expect(routePaths).not.toContain('/timeline/floor/:floor_id');
    expect(routePaths).toContain('/timeline/floor/:floor_id/room/:room_id');
  });

  test('すべての変更ルートでv1のJWT認証直後に有効な開発者権限を確認する', () => {
    const mutationPaths = [
      '/post/create',
      '/post/update',
      '/post/delete',
      '/post/supplement/create',
      '/post/supplement/update',
      '/post/supplement/delete',
      '/reply/create',
      '/reply/update',
      '/reply/delete',
      '/reply/supplement/create',
      '/reply/supplement/update',
      '/reply/supplement/delete',
    ];

    for (const path of mutationPaths) {
      expect(routeHandlers('post', path).slice(0, 2)).toEqual([
        ensureJsonWebTokenV1,
        ensureDeveloperUserV1,
      ]);
    }
  });

  test('すべてのアップロードルートで受信前に有効な開発者権限を確認する', () => {
    const uploadRoutes = [
      ['/upload/image', 'timelineImageUploader'],
      ['/upload/video', 'timelineVideoUploader'],
      ['/upload/audio', 'timelineAudioUploader'],
    ];

    for (const [path, uploaderName] of uploadRoutes) {
      expect(routeHandlers('post', path).slice(0, 4)).toEqual([
        ensureJsonWebTokenV1,
        ensureDeveloperUserV1,
        authorizeV1TimelineUpload,
        uploaders[uploaderName],
      ]);
    }
  });

  test('破棄ルートで有効な開発者権限を確認する', () => {
    expect(routeHandlers('post', '/upload/discard').slice(0, 2)).toEqual([
      ensureJsonWebTokenV1,
      ensureDeveloperUserV1,
    ]);
  });

  test('開発者以外は共通エラー形式で401を返す', async () => {
    const res = await request(app).post('/v1/roomtag').set('x-test-role', 'Author').send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_PERMISSION');
    expect(res.body.error.status).toBe(401);
    expect(res.body.error.message).toBe(Messages.INVALID_PERMISSION);
    expect(res.body.error.requestId).toBeUndefined();
  });

  test('不正な引数には共通エラー形式で400を返す', async () => {
    const res = await request(app).post('/v1/post/create').set('x-test-role', 'developer').send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('INVALID_PARAMS');
    expect(res.body.error.status).toBe(400);
    expect(res.body.error.message).toBe(Messages.INVALID_PARAMS);
    expect(res.body.error.requestId).toBeUndefined();
  });
});
