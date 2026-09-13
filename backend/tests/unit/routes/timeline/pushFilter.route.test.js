const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const pushFilterPath = require.resolve('../../../../validates/pushFilter.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const controllerPath = require.resolve('../../../../controllers/timeline/pushFilter.controller');
const routerPath = require.resolve('../../../../routes/timeline/pushFilter.route');

let baseValidate, pushFilterValidate, sharedMiddleware, ensureJwt, ctrl, routerFactory, router, app;

const buildApp = (r) => {
  const a = express();
  a.use(express.json());
  a.use('/push', r);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
    validateParamMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(pushFilterPath, () => ({
    validateConditions: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(ensureJwtPath, () => {
    const ensureJwtMock = jest.fn((req, res, next) => next());
    return ensureJwtMock;
  });

  jest.doMock(controllerPath, () => ({
    create: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'create' })),
    update: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'update' })),
    remove: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'remove' })),
  }));

  routerFactory = require(routerPath);
  router = routerFactory();

  baseValidate = require(basePath);
  pushFilterValidate = require(pushFilterPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(pushFilterValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('pushFilterのルーティング', () => {
  test('POST /pushfilter は JWTを必須とし、 floor_id/room_id/conditions 検証', async () => {
    const res = await request(app)
      .post('/push/pushfilter')
      .send({ floor_id: '507f1f77bcf86cd799439011', room_id: '507f1f77bcf86cd799439001', conditions: {} });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('create');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(pushFilterValidate.validateConditions).toHaveBeenCalledWith('conditions');
    expect(ctrl.create).toHaveBeenCalled();
  });

  test('PUT /pushfilter/:id は JWTを必須とし、 id(パラメータ)/conditions 検証', async () => {
    const res = await request(app).put('/push/pushfilter/507f1f77bcf86cd799439099').send({ conditions: {} });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('update');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateParamMongoId).toHaveBeenCalledWith('id');
    expect(pushFilterValidate.validateConditions).toHaveBeenCalledWith('conditions');
    expect(ctrl.update).toHaveBeenCalled();
  });

  test('DELETE /pushfilter/:id は JWTを必須とし、 id(パラメータ) 検証', async () => {
    const res = await request(app).delete('/push/pushfilter/507f1f77bcf86cd799439099');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('remove');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateParamMongoId).toHaveBeenCalledWith('id');
    expect(ctrl.remove).toHaveBeenCalled();
  });
});
