const request = require('supertest');

const basePath = require.resolve('../../../../../validates/base.validate');
const sharedPath = require.resolve('../../../../../middlewares/validation');
const guestAuthPath = require.resolve('../../../../../middlewares/guestAuth');
const controllerPath = require.resolve('../../../../../controllers/timeline/guest/guestReplies.controller');
const routerPath = require.resolve('../../../../../routes/timeline/guest/guestReplies.route');
const { passMiddleware, buildRouteApp, clearMockObject } = require('../../_helpers/routeTestUtils');

let validators, baseValidate, sharedMiddleware, guestAuth, ctrl, routerFactory, router, app;

const setupWithMocks = () => {
  jest.resetModules();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => passMiddleware()),
    validateTitle: jest.fn(() => passMiddleware()),
    validateUUID: jest.fn(() => passMiddleware()),
    validateUserName: jest.fn(() => passMiddleware()),
    validateContentNotNull: jest.fn(() => passMiddleware()),
    validateLang: jest.fn(() => passMiddleware()),
    validateRoomTags: jest.fn(() => passMiddleware()),
    validateRoomTagItem: jest.fn(() => passMiddleware()),
    validateAnimation: jest.fn(() => passMiddleware()),
    validateKeyup: jest.fn(() => passMiddleware()),
    validateTargetLangs: jest.fn(() => passMiddleware()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(passMiddleware()),
  }));

  jest.doMock(guestAuthPath, () => {
    const m = jest.fn((req, res, next) => next());
    return m;
  });

  jest.doMock(controllerPath, () => ({
    createReply: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'createReply' })),
  }));

  routerFactory = require(routerPath);
  router = routerFactory();

  baseValidate = require(basePath);
  sharedMiddleware = require(sharedPath);
  validators = { ...baseValidate };
  guestAuth = require(guestAuthPath);
  ctrl = require(controllerPath);

  app = buildRouteApp('/greplies', router);
};

const clearAll = () => {
  clearMockObject(baseValidate);
  clearMockObject(sharedMiddleware);
  guestAuth?.mockClear?.();
  clearMockObject(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('guestRepliesのルーティング', () => {
  test('POST /reply は guest_token を必須とし、 作成系の全入力検証', async () => {
    const payload = {
      floor_id: '507f1f77bcf86cd799439011',
      floor_title: 'Floor A',
      room_id: '507f1f77bcf86cd799439001',
      room_title: 'Room A',
      post_id: '507f1f77bcf86cd799439031',
      guest_name: 'Guest',
      content: 'Hello',
      lang: 'ja',
      room_tags: ['t1', 't2'],
      animation: { kind: 'none' },
      keyup: { enabled: true },
      target_langs: ['ja', 'en'],
    };

    const res = await request(app).post('/greplies/reply').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('createReply');

    expect(guestAuth).toHaveBeenCalled();

    expect(validators.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(validators.validateTitle).toHaveBeenCalledWith('floor_title');
    expect(validators.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(validators.validateTitle).toHaveBeenCalledWith('room_title');
    expect(validators.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(validators.validateUUID).toHaveBeenCalledWith('guest_id');
    expect(validators.validateUserName).toHaveBeenCalledWith('guest_name');
    expect(validators.validateContentNotNull).toHaveBeenCalledWith('content');
    expect(validators.validateLang).toHaveBeenCalledWith('lang');
    expect(validators.validateRoomTags).toHaveBeenCalledWith('room_tags');
    expect(validators.validateRoomTagItem).toHaveBeenCalledWith('room_tags.*');
    expect(validators.validateAnimation).toHaveBeenCalledWith('animation');
    expect(validators.validateKeyup).toHaveBeenCalledWith('keyup');
    expect(validators.validateTargetLangs).toHaveBeenCalledWith('target_langs');

    expect(ctrl.createReply).toHaveBeenCalled();
  });
});
