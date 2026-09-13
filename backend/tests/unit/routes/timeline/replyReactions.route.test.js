const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const reactionPath = require.resolve('../../../../validates/reaction.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const controllerPath = require.resolve('../../../../controllers/timeline/replyReactions.controller');
const routerPath = require.resolve('../../../../routes/timeline/replyReactions.route');

let baseValidate, reactionValidate, sharedMiddleware, ensureJwt, ctrl, routerFactory, router, app;

const buildApp = (r) => {
  const a = express();
  a.use(express.json());
  a.use('/rreact', r);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(reactionPath, () => ({
    validateReactionType: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(ensureJwtPath, () => {
    const ensureJwtMock = jest.fn((req, res, next) => next());
    return ensureJwtMock;
  });

  jest.doMock(controllerPath, () => ({
    create: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'create' })),
    delete: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'delete' })),
  }));

  routerFactory = require(routerPath);
  router = routerFactory();

  baseValidate = require(basePath);
  reactionValidate = require(reactionPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(reactionValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('replyReactionsのルーティング', () => {
  test('POST /reply/reaction は JWTを必須とし、 post_id/reply_id/type 検証', async () => {
    const res = await request(app)
      .post('/rreact/reply/reaction')
      .send({ post_id: '507f1f77bcf86cd799439001', reply_id: '507f1f77bcf86cd799439002', type: 'like' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('create');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reply_id');
    expect(reactionValidate.validateReactionType).toHaveBeenCalledWith('type');
    expect(ctrl.create).toHaveBeenCalled();
  });

  test('POST /reply/reaction/delete は JWTを必須とし、 post_id/reply_id/reaction_id 検証', async () => {
    const res = await request(app).post('/rreact/reply/reaction/delete').send({
      post_id: '507f1f77bcf86cd799439001',
      reply_id: '507f1f77bcf86cd799439002',
      reaction_id: '507f1f77bcf86cd799439003',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('delete');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reply_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reaction_id');
    expect(ctrl.delete).toHaveBeenCalled();
  });
});
