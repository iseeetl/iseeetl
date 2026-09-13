const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../validates/base.validate');
const tagPath = require.resolve('../../../validates/tag.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const controllerPath = require.resolve('../../../controllers/soundTag.controller');
const routerPath = require.resolve('../../../routes/soundTag.route');

let baseValidate, tagValidate, sharedMiddleware, ensureJwt, ctrl, app;

const buildApp = (router) => {
  const a = express();
  a.use(express.json());
  a.use('/stag', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(tagPath, () => ({
    validateSoundTags: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(ensureJwtPath, () => jest.fn((req, res, next) => next()));

  jest.doMock(controllerPath, () => ({
    getSoundTag: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'getSoundTag' })),
    createSoundTag: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'createSoundTag' })),
    updateSoundTag: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'updateSoundTag' })),
  }));

  const router = require(routerPath);

  baseValidate = require(basePath);
  tagValidate = require(tagPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(tagValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('soundTagのルーティング', () => {
  test('POST / は JWTを必須とし、 floor_id/room_id 検証', async () => {
    const res = await request(app)
      .post('/stag/')
      .send({ floor_id: '507f1f77bcf86cd799439011', room_id: '507f1f77bcf86cd799439001' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('getSoundTag');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(ctrl.getSoundTag).toHaveBeenCalled();
  });

  test('POST /create は JWTを必須とし、 floor_id/room_id/tags/tags.* 検証', async () => {
    const res = await request(app)
      .post('/stag/create')
      .send({
        floor_id: '507f1f77bcf86cd799439011',
        room_id: '507f1f77bcf86cd799439001',
        tags: ['507f1f77bcf86cd799439101', '507f1f77bcf86cd799439102'],
      });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('createSoundTag');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(tagValidate.validateSoundTags).toHaveBeenCalledWith('tags');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('tags.*');
    expect(ctrl.createSoundTag).toHaveBeenCalled();
  });

  test('POST /update は JWTを必須とし、 _id/tags/tags.* 検証', async () => {
    const res = await request(app)
      .post('/stag/update')
      .send({
        _id: '507f1f77bcf86cd799439201',
        tags: ['507f1f77bcf86cd799439301', '507f1f77bcf86cd799439302'],
      });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updateSoundTag');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(tagValidate.validateSoundTags).toHaveBeenCalledWith('tags');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('tags.*');
    expect(ctrl.updateSoundTag).toHaveBeenCalled();
  });
});
