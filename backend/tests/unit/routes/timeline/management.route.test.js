const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const userValidatePath = require.resolve('../../../../validates/user.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const ensureAdminUserPath = require.resolve('../../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../../controllers/timeline/management.controller');
const queryToBodyPath = require.resolve('../../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../../routes/timeline/management.route');

let baseValidate,
  userValidate,
  sharedMiddleware,
  ensureJwt,
  ensureAdminUser,
  ctrl,
  queryToBody,
  routerFactory,
  router,
  app;

const buildApp = () => {
  const a = express();
  a.use(express.json());
  a.use('/timeline/management', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => jest.fn((req, res, next) => next());

  jest.doMock(basePath, () => ({
    validatePage: jest.fn(() => pass()),
    validateSearch: jest.fn(() => pass()),
    validateMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(userValidatePath, () => ({
    validateDeleteFlg: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(ensureJwtPath, () => {
    const ensureJwtMock = jest.fn((req, res, next) => next());
    return ensureJwtMock;
  });
  jest.doMock(ensureAdminUserPath, () => {
    const ensureAdminUserMock = jest.fn((req, res, next) => next());
    return ensureAdminUserMock;
  });

  jest.doMock(controllerPath, () => ({
    paginate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'paginate', body: req.body })),
    timeline: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'timeline' })),
    estimate: jest.fn((req, res) => res.status(200).json({ estimatedBytes: 0 })),
    timelineMedia: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'timelineMedia' })),
    delete: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'delete' })),
  }));

  // ルートが関数の参照を保持する前に、呼出しを記録するspyを設定する。
  queryToBody = require(queryToBodyPath);
  jest.spyOn(queryToBody, 'assignQueryToBody');

  routerFactory = require(routerPath);
  baseValidate = require(basePath);
  userValidate = require(userValidatePath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  router = routerFactory();

  app = buildApp();
};

const clearAllMocks = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn && fn.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(userValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  ensureAdminUser?.mockClear?.();
  queryToBody?.assignQueryToBody.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(() => setupWithMocks());
afterEach(() => clearAllMocks());

describe('managementのルーティング', () => {
  test('POST /paginate は bodyを維持してJWT認証と管理者権限・入力検証・コントローラへ渡す', async () => {
    const body = { page: 1, search: 'abc' };
    const res = await request(app)
      .post('/timeline/management/paginate')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('paginate');
    expect(res.body.body).toEqual(body);

    const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
    const searchMiddleware = baseValidate.validateSearch.mock.results[0].value;
    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(baseValidate.validateSearch).toHaveBeenCalledWith('search');
    expect(pageMiddleware).toHaveBeenCalledTimes(1);
    expect(searchMiddleware).toHaveBeenCalledTimes(1);
    expect(pageMiddleware.mock.calls[0][0].body).toEqual(body);
    expect(searchMiddleware.mock.calls[0][0].body).toEqual(body);
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.paginate).toHaveBeenCalled();
  });

  test('GET /paginateはクエリをbodyへ割り当て、JWT認証・管理者権限の確認と入力検証を経てコントローラへ渡す', async () => {
    const res = await request(app).get('/timeline/management/paginate?page=1&search=abc');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('paginate');
    expect(res.body.body).toEqual({ page: '1', search: 'abc' });

    const expectedBody = { page: '1', search: 'abc' };
    const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
    const searchMiddleware = baseValidate.validateSearch.mock.results[0].value;
    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(baseValidate.validateSearch).toHaveBeenCalledWith('search');
    expect(pageMiddleware).toHaveBeenCalledTimes(1);
    expect(searchMiddleware).toHaveBeenCalledTimes(1);
    expect(pageMiddleware.mock.calls[0][0].body).toEqual(expectedBody);
    expect(searchMiddleware.mock.calls[0][0].body).toEqual(expectedBody);
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.paginate).toHaveBeenCalled();
  });

  test.each(['put', 'patch', 'delete'])(
    '%s /paginate は404となり対象ミドルウェアとコントローラへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/timeline/management/paginate').send({
        page: 1,
        search: 'abc',
      });

      const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
      const searchMiddleware = baseValidate.validateSearch.mock.results[0].value;
      expect(res.status).toBe(404);
      expect(queryToBody.assignQueryToBody).not.toHaveBeenCalled();
      expect(ensureJwt).not.toHaveBeenCalled();
      expect(ensureAdminUser).not.toHaveBeenCalled();
      expect(pageMiddleware).not.toHaveBeenCalled();
      expect(searchMiddleware).not.toHaveBeenCalled();
      expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
      expect(ctrl.paginate).not.toHaveBeenCalled();
    }
  );

  test('POST /timeline は JWT認証と管理者権限を必須とし、floor_id/room_idを検証する', async () => {
    const res = await request(app)
      .post('/timeline/management/timeline')
      .send({ floor_id: '507f1f77bcf86cd799439011', room_id: '507f1f77bcf86cd799439001' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('timeline');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(ctrl.timeline).toHaveBeenCalled();
  });

  test('POST /timeline/media は JWT認証と管理者権限を必須とし、floor_id/room_idを検証する', async () => {
    const res = await request(app)
      .post('/timeline/management/timeline/media')
      .send({ floor_id: '507f1f77bcf86cd799439011', room_id: '507f1f77bcf86cd799439001' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('timelineMedia');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(ctrl.timelineMedia).toHaveBeenCalled();
  });

  test('POST /delete は JWT認証と管理者権限を必須とし、post_id/reply_id/supplement_id/delete_flgを検証する', async () => {
    const res = await request(app)
      .post('/timeline/management/delete')
      .send({ post_id: '507f1f77bcf86cd799439011', delete_flg: true });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('delete');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('post_id');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('reply_id', { required: false });
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('supplement_id', { required: false });
    expect(userValidate.validateDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.delete).toHaveBeenCalled();
  });
});
