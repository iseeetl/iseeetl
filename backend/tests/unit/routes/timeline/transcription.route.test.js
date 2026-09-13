const express = require('express');
const request = require('supertest');

const routerPath = require.resolve('../../../../routes/timeline/transcription.route');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const basePath = require.resolve('../../../../validates/base.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const controllerPath = require.resolve('../../../../controllers/timeline/transcription.controller');
const appErrorPath = require.resolve('../../../../utils/appError');
const errorResponsePath = require.resolve('../../../../utils/errorResponse');
const featureFlagsPath = require.resolve('../../../../config/featureFlags');

let ensureJwt, baseValidate, sharedMiddleware, ctrl, app;

const buildApp = (router, errorResponse) => {
  const a = express();
  a.use('/tl', router);
  a.use(errorResponse);
  return a;
};

const buildMulterMock = (mode, AppError) => {
  const multerMock = () => ({
    single: (fieldName) => (req, _res, next) => {
      if (mode === 'limit-file-size') {
        return next({ name: 'MulterError', code: 'LIMIT_FILE_SIZE' });
      }
      if (mode === 'limit-unexpected-file') {
        return next({ name: 'MulterError', code: 'LIMIT_UNEXPECTED_FILE' });
      }
      if (mode === 'invalid-file-type') {
        return next(new AppError({ code: 'INVALID_FILE_TYPE' }));
      }
      if (mode === 'no-file') {
        return next();
      }
      req.file = { fieldname: fieldName, originalname: 'fake.wav', buffer: Buffer.from('x') };
      return next();
    },
  });
  multerMock.memoryStorage = () => ({});
  return multerMock;
};

const setupWithMocks = ({
  multerMode = 'success',
  finalizeErrorCode = null,
  transcriptionEnabled = true,
} = {}) => {
  jest.resetModules();

  const AppError = require(appErrorPath);
  const { resolveErrorCode, buildErrorResponse } = require(errorResponsePath);

  jest.doMock('multer', () => buildMulterMock(multerMode, AppError));
  jest.doMock(featureFlagsPath, () => ({
    isOpenAITranscriptionEnabled: jest.fn(() => transcriptionEnabled),
  }));

  jest.doMock(ensureJwtPath, () => {
    const m = jest.fn((req, res, next) => next());
    return m;
  });

  const pass = () => (req, res, next) => next();
  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
    validateLang: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn((req, res, next) => {
      if (!finalizeErrorCode) return next();
      return next(new AppError({ code: finalizeErrorCode }));
    }),
  }));

  jest.doMock(controllerPath, () => ({
    transcribe: jest.fn((req, res) => {
      res.status(200).json({ ok: true, action: 'transcribe', hasFile: !!req.file });
    }),
  }));

  const router = require(routerPath);
  ensureJwt = require(ensureJwtPath);
  baseValidate = require(basePath);
  sharedMiddleware = require(sharedPath);
  ctrl = require(controllerPath);

  const errorResponse = (err, req, res, next) => {
    const status = err?.status || err?.statusCode || 500;
    const code = resolveErrorCode(err, status);
    const isAppError = err instanceof AppError || err?.name === 'AppError';
    const message = isAppError ? err.message : 'サーバーでエラーが発生しました';
    const details = isAppError ? err.details : undefined;
    res.status(status).json(buildErrorResponse({ code, message, details, status }));
    void req;
    void next;
  };

  app = buildApp(router, errorResponse);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  ensureJwt?.mockClear?.();
  maybeClear(baseValidate);
  maybeClear(sharedMiddleware);
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('transcriptionのルーティング', () => {
  test('文字起こし無効時は認証後かつmulter前に503を返す', async () => {
    setupWithMocks({ transcriptionEnabled: false, multerMode: 'limit-file-size' });

    const res = await request(app)
      .post('/tl/transcription/audio')
      .field('room_id', '507f1f77bcf86cd799439001')
      .field('lang', 'ja');

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(res.body.error.details).toEqual({ feature: 'openaiTranscription' });
    expect(ensureJwt).toHaveBeenCalled();
    expect(ctrl.transcribe).not.toHaveBeenCalled();
  });

  test('POST /transcription/audio は JWTを必須とし、room_id/langを検証し、multerで処理したファイルをcontroller.transcribeへ渡す', async () => {
    const res = await request(app)
      .post('/tl/transcription/audio')
      // multerをモックしているため、添付ファイルの内容には依存しない。
      .attach('file', Buffer.from('abc'), 'a.wav')
      .field('room_id', '507f1f77bcf86cd799439001')
      .field('lang', 'ja');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('transcribe');
    expect(res.body.hasFile).toBe(true);

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(ctrl.transcribe).toHaveBeenCalled();
  });

  test('ファイル未添付は FILE_REQUIRED を返し、コントローラは呼ばれない', async () => {
    setupWithMocks({ multerMode: 'no-file' });

    const res = await request(app)
      .post('/tl/transcription/audio')
      .field('room_id', '507f1f77bcf86cd799439001')
      .field('lang', 'ja');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_REQUIRED');
    expect(ctrl.transcribe).not.toHaveBeenCalled();
  });

  test('MulterError LIMIT_FILE_SIZE は FILE_TOO_LARGE を返す', async () => {
    setupWithMocks({ multerMode: 'limit-file-size' });

    const res = await request(app)
      .post('/tl/transcription/audio')
      .field('room_id', '507f1f77bcf86cd799439001')
      .field('lang', 'ja');

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    expect(ctrl.transcribe).not.toHaveBeenCalled();
  });

  test('MulterError LIMIT_UNEXPECTED_FILE は INVALID_FILE を返す', async () => {
    setupWithMocks({ multerMode: 'limit-unexpected-file' });

    const res = await request(app)
      .post('/tl/transcription/audio')
      .field('room_id', '507f1f77bcf86cd799439001')
      .field('lang', 'ja');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE');
    expect(ctrl.transcribe).not.toHaveBeenCalled();
  });

  test('不正mimeは INVALID_FILE_TYPE を返す', async () => {
    setupWithMocks({ multerMode: 'invalid-file-type' });

    const res = await request(app)
      .post('/tl/transcription/audio')
      .field('room_id', '507f1f77bcf86cd799439001')
      .field('lang', 'ja');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
    expect(ctrl.transcribe).not.toHaveBeenCalled();
  });

  test('入力検証失敗時は INVALID_PARAMS を返し、コントローラは呼ばれない', async () => {
    setupWithMocks({ finalizeErrorCode: 'INVALID_PARAMS' });

    const res = await request(app)
      .post('/tl/transcription/audio')
      .attach('file', Buffer.from('abc'), 'a.wav')
      .field('room_id', 'invalid')
      .field('lang', 'ja');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PARAMS');
    expect(ctrl.transcribe).not.toHaveBeenCalled();
  });
});
