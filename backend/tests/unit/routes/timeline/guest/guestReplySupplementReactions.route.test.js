const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../../validates/base.validate');
const reactionPath = require.resolve('../../../../../validates/reaction.validate');
const sharedPath = require.resolve('../../../../../middlewares/validation');
const guestAuthPath = require.resolve('../../../../../middlewares/guestAuth');
const controllerPath = require.resolve(
  '../../../../../controllers/timeline/guest/guestReplySupplementReactions.controller'
);
const routerPath = require.resolve('../../../../../routes/timeline/guest/guestReplySupplementReactions.route');

let baseValidate,
  reactionValidate,
  sharedMiddleware,
  guestAuth,
  ctrl,
  routerFactory,
  router,
  app;

const buildApp = (r) => {
  const a = express();
  a.use(express.json());
  a.use('/grsr', r);
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
    createReplySupplementReaction: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'createReplySupplementReaction' })
    ),
    deleteReplySupplementReaction: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'deleteReplySupplementReaction' })
    ),
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

describe('guestReplySupplementReactionsのルーティング', () => {
  test('POST /reply/supplement/reaction は guest_token を必須とし、 guest_id/guest_name/post_id/reply_id/supplement_id/type 検証', async () => {
    const res = await request(app).post('/grsr/reply/supplement/reaction').send({
      guest_name: 'Guest',
      post_id: '507f1f77bcf86cd799439001',
      reply_id: '507f1f77bcf86cd799439002',
      supplement_id: '507f1f77bcf86cd799439003',
      type: 'like',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('createReplySupplementReaction');

    expect(guestAuth).toHaveBeenCalled();
    expect(baseValidate.validateUUID).toHaveBeenCalledWith('guest_id');
    expect(baseValidate.validateUserName).toHaveBeenCalledWith('guest_name');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reply_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('supplement_id');
    expect(reactionValidate.validateReactionType).toHaveBeenCalledWith('type');
    expect(ctrl.createReplySupplementReaction).toHaveBeenCalled();
  });

  test('POST /reply/supplement/reaction/delete は guest_token を必須とし、 guest_id/guest_name/post_id/supplement_id/reaction_id 検証', async () => {
    const res = await request(app).post('/grsr/reply/supplement/reaction/delete').send({
      guest_name: 'Guest',
      post_id: '507f1f77bcf86cd799439001',
      supplement_id: '507f1f77bcf86cd799439003',
      reaction_id: '507f1f77bcf86cd799439004',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('deleteReplySupplementReaction');

    expect(guestAuth).toHaveBeenCalled();
    expect(baseValidate.validateUUID).toHaveBeenCalledWith('guest_id');
    expect(baseValidate.validateUserName).toHaveBeenCalledWith('guest_name');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('supplement_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reaction_id');
    expect(ctrl.deleteReplySupplementReaction).toHaveBeenCalled();
  });
});
