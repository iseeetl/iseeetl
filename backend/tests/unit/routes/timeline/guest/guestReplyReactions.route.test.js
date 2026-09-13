const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../../validates/base.validate');
const reactionPath = require.resolve('../../../../../validates/reaction.validate');
const sharedPath = require.resolve('../../../../../middlewares/validation');
const guestAuthPath = require.resolve('../../../../../middlewares/guestAuth');
const controllerPath = require.resolve('../../../../../controllers/timeline/guest/guestReplyReactions.controller');
const routerPath = require.resolve('../../../../../routes/timeline/guest/guestReplyReactions.route');

let baseValidate, reactionValidate, sharedMiddleware, guestAuth, ctrl, routerFactory, router, app;

const buildApp = (r) => {
  const a = express();
  a.use(express.json());
  a.use('/grr', r);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateUUID: jest.fn(() => pass()),
    validateUserName: jest.fn(() => pass()),
    validateMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(reactionPath, () => ({
    validateReactionType: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(guestAuthPath, () => {
    const m = jest.fn((req, res, next) => next());
    return m;
  });

  jest.doMock(controllerPath, () => ({
    createReplyReaction: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'createReplyReaction' })),
    deleteReplyReaction: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'deleteReplyReaction' })),
  }));

  routerFactory = require(routerPath);
  router = routerFactory();

  baseValidate = require(basePath);
  reactionValidate = require(reactionPath);
  sharedMiddleware = require(sharedPath);
  guestAuth = require(guestAuthPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(reactionValidate);
  maybeClear(sharedMiddleware);
  guestAuth?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('guestReplyReactionsのルーティング', () => {
  test('POST /reply/reaction は guest_token を必須とし、 guest_id/guest_name/post_id/reply_id/type 検証', async () => {
    const res = await request(app).post('/grr/reply/reaction').send({
      guest_name: 'Guest',
      post_id: '507f1f77bcf86cd799439001',
      reply_id: '507f1f77bcf86cd799439002',
      type: 'like',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('createReplyReaction');

    expect(guestAuth).toHaveBeenCalled();
    expect(baseValidate.validateUUID).toHaveBeenCalledWith('guest_id');
    expect(baseValidate.validateUserName).toHaveBeenCalledWith('guest_name');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reply_id');
    expect(reactionValidate.validateReactionType).toHaveBeenCalledWith('type');
    expect(ctrl.createReplyReaction).toHaveBeenCalled();
  });

  test('POST /reply/reaction/delete は guest_token を必須とし、 guest_id/guest_name/post_id/reply_id/reaction_id 検証', async () => {
    const res = await request(app).post('/grr/reply/reaction/delete').send({
      guest_name: 'Guest',
      post_id: '507f1f77bcf86cd799439001',
      reply_id: '507f1f77bcf86cd799439002',
      reaction_id: '507f1f77bcf86cd799439003',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('deleteReplyReaction');

    expect(guestAuth).toHaveBeenCalled();
    expect(baseValidate.validateUUID).toHaveBeenCalledWith('guest_id');
    expect(baseValidate.validateUserName).toHaveBeenCalledWith('guest_name');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reply_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reaction_id');
    expect(ctrl.deleteReplyReaction).toHaveBeenCalled();
  });
});
