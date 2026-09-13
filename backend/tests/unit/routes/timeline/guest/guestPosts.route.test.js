const request = require('supertest');

const basePath = require.resolve('../../../../../validates/base.validate');
const serverQueryPath = require.resolve('../../../../../validates/serverQuery.validate');
const sharedPath = require.resolve('../../../../../middlewares/validation');
const guestAuthPath = require.resolve('../../../../../middlewares/guestAuth');
const controllerPath = require.resolve('../../../../../controllers/timeline/guest/guestPosts.controller');
const routerPath = require.resolve('../../../../../routes/timeline/guest/guestPosts.route');
const { passMiddleware, buildRouteApp, clearMockObject } = require('../../_helpers/routeTestUtils');

let validators, baseValidate, serverQueryValidate, sharedMiddleware, guestAuth, ctrl, routerFactory, router, app;

const setupWithMocks = () => {
  jest.resetModules();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => passMiddleware()),
    validateFrom: jest.fn(() => passMiddleware()),
    validateTo: jest.fn(() => passMiddleware()),
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
  jest.doMock(serverQueryPath, () => ({
    validateServerQuery: jest.fn(() => []),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(passMiddleware()),
  }));

  jest.doMock(guestAuthPath, () => {
    const m = jest.fn((req, res, next) => next());
    return m;
  });

  jest.doMock(controllerPath, () => ({
    getPosts: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'getPosts' })),
    getPostDetail: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'getPostDetail' })),
    createPost: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'createPost' })),
  }));

  routerFactory = require(routerPath);
  router = routerFactory();

  baseValidate = require(basePath);
  serverQueryValidate = require(serverQueryPath);
  sharedMiddleware = require(sharedPath);
  validators = { ...baseValidate, ...serverQueryValidate };
  guestAuth = require(guestAuthPath);
  ctrl = require(controllerPath);

  app = buildRouteApp('/gposts', router);
};

const clearAll = () => {
  clearMockObject(baseValidate);
  clearMockObject(serverQueryValidate);
  clearMockObject(sharedMiddleware);
  guestAuth?.mockClear?.();
  clearMockObject(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('guestPostsのルーティング', () => {
  test('POST / は guest_token を必須とし、 floor_id/room_id/from/to 検証', async () => {
    const res = await request(app).post('/gposts/').send({
      floor_id: '507f1f77bcf86cd799439011',
      room_id: '507f1f77bcf86cd799439001',
      from: '2020-01-01T00:00:00Z',
      to: '2020-12-31T23:59:59Z',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('getPosts');

    expect(guestAuth).toHaveBeenCalled();
    expect(validators.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(validators.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(validators.validateFrom).toHaveBeenCalledWith('from');
    expect(validators.validateTo).toHaveBeenCalledWith('to');
    expect(ctrl.getPosts).toHaveBeenCalled();
  });

  test('POST /detail は guest_token を必須とし、 post_id 検証', async () => {
    const res = await request(app).post('/gposts/detail').send({ post_id: '507f1f77bcf86cd799439099' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('getPostDetail');

    expect(guestAuth).toHaveBeenCalled();
    expect(validators.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(ctrl.getPostDetail).toHaveBeenCalled();
  });

  test('POST /post は guest_token を必須とし、 作成系の全入力検証', async () => {
    const payload = {
      floor_id: '507f1f77bcf86cd799439011',
      floor_title: 'Floor A',
      room_id: '507f1f77bcf86cd799439001',
      room_title: 'Room A',
      guest_name: 'Guest',
      content: 'Hello',
      lang: 'ja',
      room_tags: ['t1', 't2'],
      animation: { kind: 'none' },
      keyup: { enabled: true },
      target_langs: ['ja', 'en'],
    };

    const res = await request(app).post('/gposts/post').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('createPost');

    expect(guestAuth).toHaveBeenCalled();
    expect(validators.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(validators.validateTitle).toHaveBeenCalledWith('floor_title');
    expect(validators.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(validators.validateTitle).toHaveBeenCalledWith('room_title');
    expect(validators.validateUUID).toHaveBeenCalledWith('guest_id');
    expect(validators.validateUserName).toHaveBeenCalledWith('guest_name');
    expect(validators.validateContentNotNull).toHaveBeenCalledWith('content');
    expect(validators.validateLang).toHaveBeenCalledWith('lang');
    expect(validators.validateRoomTags).toHaveBeenCalledWith('room_tags');
    expect(validators.validateRoomTagItem).toHaveBeenCalledWith('room_tags.*');
    expect(validators.validateAnimation).toHaveBeenCalledWith('animation');
    expect(validators.validateKeyup).toHaveBeenCalledWith('keyup');
    expect(validators.validateTargetLangs).toHaveBeenCalledWith('target_langs');
    expect(ctrl.createPost).toHaveBeenCalled();
  });
});
