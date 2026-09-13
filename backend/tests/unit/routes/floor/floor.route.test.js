const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const floorPath = require.resolve('../../../../validates/floor.validate');
const mediaPath = require.resolve('../../../../validates/media.validate');
const userPath = require.resolve('../../../../validates/user.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const ensureAdminUserPath = require.resolve('../../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../../controllers/floor/floor.controller');
const queryToBodyPath = require.resolve('../../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../../routes/floor/floor.route');

let baseValidate,
  floorValidate,
  mediaValidate,
  userValidate,
  sharedMiddleware,
  ensureJwt,
  ensureAdminUser,
  ctrl,
  queryToBody,
  router,
  app;

const buildApp = () => {
  const a = express();
  a.use(express.json());
  a.use('/floor', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();

  const pass = () => (req, res, next) => next();

  // 定義順にモックを登録するdoMockを使い、事前に解決したモジュールパスを渡す。
  jest.doMock(basePath, () => ({
    validatePage: jest.fn(() => pass()),
    validateMongoId: jest.fn(() => pass()),
    validateLang: jest.fn(() => pass()),
    validateTargetLangs: jest.fn(() => pass()),
  }));
  jest.doMock(floorPath, () => ({
    validateFloorSearch: jest.fn(() => pass()),
    validateFloorTitle: jest.fn(() => pass()),
    validateFloorDescription: jest.fn(() => pass()),
    validateFloorDisplayHidden: jest.fn(() => pass()),
  }));
  jest.doMock(mediaPath, () => ({
    validateImageName: jest.fn(() => pass()),
  }));
  jest.doMock(userPath, () => ({
    validateDeleteFlg: jest.fn(() => pass()),
    validateOptionalDeleteFlg: jest.fn(() => pass()),
    validateOptionalQueryDeleteFlg: jest.fn(() => pass()),
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
    guestPaginate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'guestPaginate' })),
    paginate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'paginate' })),
    getRole: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'getRole' })),
    getDetail: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'getDetail' })),
    create: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'create' })),
    update: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'update' })),
    updateFloorDisplayHidden: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'updateFloorDisplayHidden' })
    ),
    delete: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'delete' })),
    managementPaginate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementPaginate' })),
    managementGetDetail: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementGetDetail' })),
    managementUpdate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementUpdate' })),
    managementSetDeleteState: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'managementSetDeleteState' })
    ),
  }));

  queryToBody = require(queryToBodyPath);
  jest.spyOn(queryToBody, 'assignQueryToBody');
  router = require(routerPath);
  baseValidate = require(basePath);
  floorValidate = require(floorPath);
  mediaValidate = require(mediaPath);
  userValidate = require(userPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  app = buildApp();
};

const clearAllMocks = () => {
  const maybeClear = (obj) => Object.values(obj).forEach((fn) => fn && fn.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(floorValidate);
  maybeClear(mediaValidate);
  maybeClear(userValidate);
  maybeClear(sharedMiddleware);
  ensureJwt && ensureJwt.mockClear && ensureJwt.mockClear();
  ensureAdminUser && ensureAdminUser.mockClear && ensureAdminUser.mockClear();
  maybeClear(ctrl);
  queryToBody?.assignQueryToBody?.mockRestore?.();
};

beforeEach(() => {
  setupWithMocks();
});

afterEach(() => {
  clearAllMocks();
});

describe('フロアのルーティング', () => {
  test('POST /guest/paginateはJWT認証を要求せず、ページ・検索・削除状態を検証する', async () => {
    const res = await request(app)
      .post('/floor/guest/paginate')
      .send({ page: { limit: 10, offset: 0 }, search: { q: '' } });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('guestPaginate');

    expect(ensureJwt).not.toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(floorValidate.validateFloorSearch).toHaveBeenCalledWith('search');
    expect(userValidate.validateOptionalDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.guestPaginate).toHaveBeenCalled();
  });

  test('POST /paginateはJWT認証を必須とし、ページと検索条件を検証する', async () => {
    const res = await request(app)
      .post('/floor/paginate')
      .send({ page: { limit: 10, offset: 0 }, search: { q: 'abc' } });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('paginate');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(floorValidate.validateFloorSearch).toHaveBeenCalledWith('search');
    expect(ctrl.paginate).toHaveBeenCalled();
  });

  test('POST /role は JWTを必須とし、floor_idを検証する', async () => {
    const res = await request(app).post('/floor/role').send({ floor_id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('getRole');
    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.getRole).toHaveBeenCalled();
  });

  test('POST /detail は JWT認証を要求せず、_idを検証する', async () => {
    const res = await request(app).post('/floor/detail').send({ _id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('getDetail');
    expect(ensureJwt).not.toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(ctrl.getDetail).toHaveBeenCalled();
  });

  test('POST /create は JWTを必須とし、必須項目を検証する', async () => {
    const payload = {
      title: 'T',
      description: 'D',
      floor_display_hidden: false,
      lang: 'ja',
      target_langs: ['en', 'ja'],
    };
    const res = await request(app).post('/floor/create').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('create');
    expect(ensureJwt).toHaveBeenCalled();

    expect(floorValidate.validateFloorTitle).toHaveBeenCalledWith('title');
    expect(floorValidate.validateFloorDescription).toHaveBeenCalledWith('description');
    expect(floorValidate.validateFloorDisplayHidden).toHaveBeenCalledWith('floor_display_hidden');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(baseValidate.validateTargetLangs).toHaveBeenCalledWith('target_langs');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('target_langs.*');

    expect(ctrl.create).toHaveBeenCalled();
  });

  test('POST /update は JWTを必須とし、更新項目を検証する', async () => {
    const payload = {
      _id: '507f1f77bcf86cd799439011',
      title: 'T',
      description: 'D',
      lang: 'ja',
      target_langs: ['en', 'ja'],
      image_name: 'img.png',
      floor_display_hidden: true,
    };
    const res = await request(app).post('/floor/update').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('update');
    expect(ensureJwt).toHaveBeenCalled();

    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(floorValidate.validateFloorTitle).toHaveBeenCalledWith('title');
    expect(floorValidate.validateFloorDescription).toHaveBeenCalledWith('description');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(baseValidate.validateTargetLangs).toHaveBeenCalledWith('target_langs');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('target_langs.*');
    expect(mediaValidate.validateImageName).toHaveBeenCalledWith('image_name');
    expect(floorValidate.validateFloorDisplayHidden).toHaveBeenCalledWith('floor_display_hidden');

    expect(ctrl.update).toHaveBeenCalled();
  });

  test('POST /update/floordisplayhidden は JWTを必須とし、floor_display_hiddenを検証する', async () => {
    const res = await request(app).post('/floor/update/floordisplayhidden').send({ floor_display_hidden: true });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updateFloorDisplayHidden');
    expect(ensureJwt).toHaveBeenCalled();
    expect(floorValidate.validateFloorDisplayHidden).toHaveBeenCalledWith('floor_display_hidden');
    expect(ctrl.updateFloorDisplayHidden).toHaveBeenCalled();
  });

  test('POST /delete は JWTを必須とし、_idを検証する', async () => {
    const res = await request(app).post('/floor/delete').send({ _id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('delete');
    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(ctrl.delete).toHaveBeenCalled();
  });

  test('POST /management/paginate は body を使い JWT認証と管理者権限を確認し、page/searchを検証する', async () => {
    const body = { page: { limit: 10, offset: 0 }, search: { q: '' } };
    const res = await request(app)
      .post('/floor/management/paginate')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');
    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(floorValidate.validateFloorSearch).toHaveBeenCalledWith('search');
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual(body);
  });

  test('GET /management/paginate はクエリを body に割り当てて同じミドルウェア列を通る', async () => {
    const res = await request(app).get('/floor/management/paginate?page=2&search=meeting');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');
    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual({ page: '2', search: 'meeting' });
  });

  test.each(['put', 'patch', 'delete'])(
    '%s /management/paginate は 404 となり対象ミドルウェアとコントローラへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/floor/management/paginate').send({ page: 2 });

      expect(res.status).toBe(404);
      expect(queryToBody.assignQueryToBody).not.toHaveBeenCalled();
      expect(ensureJwt).not.toHaveBeenCalled();
      expect(ensureAdminUser).not.toHaveBeenCalled();
      expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
      expect(ctrl.managementPaginate).not.toHaveBeenCalled();
    }
  );

  test('POST /management/detail は JWT認証と管理者権限を確認し、_idを検証する', async () => {
    const res = await request(app).post('/floor/management/detail').send({
      _id: '507f1f77bcf86cd799439011',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementGetDetail');
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.managementGetDetail).toHaveBeenCalled();
  });

  test('POST /management/update は JWTを必須とし、管理画面の入力項目を検証する', async () => {
    const res = await request(app).post('/floor/management/update').send({
      _id: '507f1f77bcf86cd799439011',
      title: 'T',
      description: 'D',
      image_name: 'x.png',
      floor_display_hidden: false,
      delete_flg: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementUpdate');
    expect(ensureJwt).toHaveBeenCalled();

    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(floorValidate.validateFloorTitle).toHaveBeenCalledWith('title');
    expect(floorValidate.validateFloorDescription).toHaveBeenCalledWith('description');
    expect(mediaValidate.validateImageName).toHaveBeenCalledWith('image_name');
    expect(floorValidate.validateFloorDisplayHidden).toHaveBeenCalledWith('floor_display_hidden');
    expect(userValidate.validateDeleteFlg).toHaveBeenCalledWith('delete_flg');

    expect(ctrl.managementUpdate).toHaveBeenCalled();
  });

  test('POST /management/delete-state は JWT認証と管理者権限を確認し、_id/delete_flgを検証する', async () => {
    const res = await request(app).post('/floor/management/delete-state').send({
      _id: '507f1f77bcf86cd799439011',
      delete_flg: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementSetDeleteState');
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(userValidate.validateDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.managementSetDeleteState).toHaveBeenCalled();
  });
});
