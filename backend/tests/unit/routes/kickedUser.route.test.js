const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../validates/base.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const controllerPath = require.resolve('../../../controllers/kickedUser.controller');
const routerPath = require.resolve('../../../routes/kickedUser.route');

let baseValidate, sharedMiddleware, ensureJwt, ctrl, routerFactory, router, app, ioMock;

const buildApp = (r) => {
  const a = express();
  a.use(express.json());
  a.use('/kicked', r);
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
    const m = jest.fn((req, res, next) => next());
    return m;
  });

  jest.doMock(controllerPath, () => ({
    getKickedUserList: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'getKickedUserList' })),
    checkKickedUser: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'checkKickedUser' })),
    createKickedUser: jest.fn((req, res, next, io) =>
      res.status(201).json({
        ok: true,
        action: 'createKickedUser',
        ioPassed: io === ioMock,
      })
    ),
    deleteKickedUser: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'deleteKickedUser' })),
  }));

  routerFactory = require(routerPath);
  ioMock = { fake: 'io' };
  router = routerFactory(ioMock);

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

describe('Socket.IOを渡すキックのルーティング', () => {
  test('POST / は JWTを必須とし、floor_idを検証する', async () => {
    const res = await request(app).post('/kicked/').send({ floor_id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('getKickedUserList');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.getKickedUserList).toHaveBeenCalled();
  });

  test('POST /check は JWTを必須とし、floor_id/room_idを任意項目として検証する', async () => {
    const res = await request(app).post('/kicked/check').send({
      floor_id: '507f1f77bcf86cd799439011',
      room_id: '507f1f77bcf86cd799439001',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('checkKickedUser');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id', { required: false });
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id', { required: false });
    expect(ctrl.checkKickedUser).toHaveBeenCalled();
  });

  test('POST /create は JWTを必須とし、user_id/room_idを検証し、コントローラにioを渡す', async () => {
    const res = await request(app).post('/kicked/create').send({
      user_id: '507f1f77bcf86cd799439021',
      room_id: '507f1f77bcf86cd799439001',
    });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('createKickedUser');
    expect(res.body.ioPassed).toBe(true);

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('user_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(ctrl.createKickedUser).toHaveBeenCalled();
  });

  test('POST /delete は JWTを必須とし、user_id/floor_idを検証する', async () => {
    const res = await request(app).post('/kicked/delete').send({
      user_id: '507f1f77bcf86cd799439021',
      floor_id: '507f1f77bcf86cd799439011',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('deleteKickedUser');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('user_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.deleteKickedUser).toHaveBeenCalled();
  });
});
