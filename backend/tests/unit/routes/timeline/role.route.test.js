const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const controllerPath = require.resolve('../../../../controllers/timeline/role.controller');
const routerPath = require.resolve('../../../../routes/timeline/role.route');

let baseValidate, sharedMiddleware, ensureJwt, ctrl, routerFactory, router, app;

const buildApp = (r) => {
  const a = express();
  a.use(express.json());
  a.use('/role', r);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(ensureJwtPath, () => {
    const ensureJwtMock = jest.fn((req, res, next) => next());
    return ensureJwtMock;
  });

  jest.doMock(controllerPath, () => ({
    resolveTimelineRole: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'resolveTimelineRole' })),
  }));

  routerFactory = require(routerPath);
  router = routerFactory();

  baseValidate = require(basePath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('権限のルーティング', () => {
  test('POST /role は JWTを必須とし、 floor_id/room_id 検証', async () => {
    const res = await request(app)
      .post('/role/role')
      .send({ floor_id: '507f1f77bcf86cd799439011', room_id: '507f1f77bcf86cd799439001' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('resolveTimelineRole');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(ctrl.resolveTimelineRole).toHaveBeenCalled();
  });
});
