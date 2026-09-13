const express = require('express');
const request = require('supertest');

const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const basePath = require.resolve('../../../validates/base.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const uploadersPath = require.resolve('../../../middlewares/uploaders');
const authorizeUploadPath = require.resolve('../../../middlewares/authorizeUploadTarget');
const controllerPath = require.resolve('../../../controllers/upload.controller');
const routerPath = require.resolve('../../../routes/upload.route');

let ensureJwt, baseValidate, sharedMiddleware, uploaders, authorizeUpload, ctrl, app;

const buildApp = (router) => {
  const a = express();
  a.use(express.json());
  a.use('/upload', router);
  a.use((err, _req, res, _next) => {
    res.status(err?.status || 500).json({ error: { code: err?.code } });
  });
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();

  jest.doMock(ensureJwtPath, () =>
    jest.fn((req, _res, next) => {
      req.jwtPayload = { user_id: 'u1', user_role: 'member' };
      next();
    })
  );

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => (req, _res, next) => next()),
  }));
  jest.doMock(sharedPath, () => ({
    cleanupUploadOnError: jest.fn((err, req, res, next) => next(err)),
    requireAnyFile: jest.fn(() => (req, _res, next) => next()),
    requireFiles: jest.fn(() => (req, _res, next) => next()),
    finalize: jest.fn((req, _res, next) => next()),
  }));
  jest.doMock(authorizeUploadPath, () => ({
    authorizeFloorImageUpload: jest.fn((req, _res, next) => next()),
    authorizeRoomImageUpload: jest.fn((req, _res, next) => next()),
    requireMatchingUploadBody: jest.fn((req, _res, next) => next()),
  }));

  jest.doMock(uploadersPath, () => ({
    profileImageUploader: jest.fn((req, _res, next) => next()),
    floorImageUploader: jest.fn((req, _res, next) => next()),
    roomImageUploader: jest.fn((req, _res, next) => next()),
    SUBTITLE_LIMIT: 2 * 1024 * 1024,
  }));

  jest.doMock(controllerPath, () => ({
    uploadProfileImage: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'uploadProfileImage' })),
    uploadFloorImage: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'uploadFloorImage' })),
    uploadRoomImage: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'uploadRoomImage' })),
  }));

  const router = require(routerPath);

  ensureJwt = require(ensureJwtPath);
  baseValidate = require(basePath);
  sharedMiddleware = require(sharedPath);
  uploaders = require(uploadersPath);
  authorizeUpload = require(authorizeUploadPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  ensureJwt?.mockClear?.();
  baseValidate?.validateMongoId?.mockClear?.();
  sharedMiddleware?.requireAnyFile?.mockClear?.();
  sharedMiddleware?.requireFiles?.mockClear?.();
  sharedMiddleware?.finalize?.mockClear?.();
  Object.values(uploaders || {}).forEach((fn) => fn?.mockClear && fn.mockClear());
  Object.values(authorizeUpload || {}).forEach((fn) => fn?.mockClear && fn.mockClear());
  Object.values(ctrl || {}).forEach((fn) => fn?.mockClear && fn.mockClear());
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('uploadのルーティング', () => {
  const table = [
    ['/profile/image', 'uploadProfileImage', 'profileImageUploader', null, ['image_file'], []],
    ['/floor/image', 'uploadFloorImage', 'floorImageUploader', 'authorizeFloorImageUpload', ['image_file'], ['_id']],
    ['/room/image', 'uploadRoomImage', 'roomImageUploader', 'authorizeRoomImageUpload', ['image_file'], ['floor_id', '_id']],
  ];

  test.each(table)(
    'POST %s は JWT -> uploader -> validators.finalize -> controller.%s を通過',
    async (path, actionName, uploaderName, authorizerName, requiredFiles, idFields) => {
      const res = await request(app).post(`/upload${path}`).send({});

      expect(res.status).toBe(200);
      expect(res.body.action).toBe(actionName);

      expect(ensureJwt).toHaveBeenCalled();
      expect(uploaders[uploaderName]).toHaveBeenCalled();
      expect(sharedMiddleware.finalize).toHaveBeenCalled();
      expect(ctrl[actionName]).toHaveBeenCalled();
      if (authorizerName) {
        expect(authorizeUpload[authorizerName]).toHaveBeenCalled();
        expect(authorizeUpload.requireMatchingUploadBody).toHaveBeenCalled();
        expect(authorizeUpload[authorizerName].mock.invocationCallOrder[0]).toBeLessThan(
          uploaders[uploaderName].mock.invocationCallOrder[0]
        );
      }

      if (requiredFiles) {
        expect(sharedMiddleware.requireFiles.mock.calls).toEqual(expect.arrayContaining([[requiredFiles]]));
      } else {
        expect(sharedMiddleware.requireAnyFile).toHaveBeenCalledWith(['video_file', 'video_subtitle_file']);
      }

      const validateArgs = baseValidate.validateMongoId.mock.calls.map((args) => args[0]);
      idFields.forEach((field) => {
        expect(validateArgs).toContain(field);
      });
    }
  );

  test('全ルート分の requireFiles が定義通り登録されている（セットアップ時検証）', () => {
    const calls = sharedMiddleware.requireFiles.mock.calls.map((a) => a[0]);
    expect(calls).toEqual(
      expect.arrayContaining([
        ['image_file'],
        ['image_file'],
        ['image_file'],
      ])
    );
  });

  test('全ルート分の validateMongoId が定義通り登録されている（セットアップ時検証）', () => {
    const args = baseValidate.validateMongoId.mock.calls.map((a) => a[0]);
    ['_id', 'floor_id'].forEach((f) => {
      expect(args).toContain(f);
    });
  });

  test.each(['image', 'video', 'audio', 'discard'])('旧タイムライン %s は登録しない', async (kind) => {
    expect((await request(app).post(`/upload/timeline/${kind}`)).status).toBe(404);
  });
});
