const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const tagPath = require.resolve('../../../../validates/tag.validate');
const userPath = require.resolve('../../../../validates/user.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const ensureAdminUserPath = require.resolve('../../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../../controllers/floor/floorTag.controller');
const queryToBodyPath = require.resolve('../../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../../routes/floor/floorTag.route');

let baseValidate,
  tagValidate,
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
  a.use('/floortag', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
    validatePage: jest.fn(() => pass()),
    validateSearch: jest.fn(() => pass()),
    validateLang: jest.fn(() => pass()),
  }));
  jest.doMock(tagPath, () => ({
    validateRoomTagOrder: jest.fn(() => pass()),
    validateRoomTagName: jest.fn(() => pass()),
    validateRoomTagCsv: jest.fn(() => pass()),
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
    list: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'list' })),
    create: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'create' })),
    update: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'update' })),
    delete: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'delete' })),
    import: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'import' })),
    init: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'init' })),
    managementPaginate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementPaginate' })),
    managementUpdate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementUpdate' })),
    managementDelete: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'managementDelete' })
    ),
  }));

  queryToBody = require(queryToBodyPath);
  jest.spyOn(queryToBody, 'assignQueryToBody');
  router = require(routerPath);
  baseValidate = require(basePath);
  tagValidate = require(tagPath);
  userValidate = require(userPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  app = buildApp();
};

const clearAllMocks = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn && fn.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(tagValidate);
  maybeClear(userValidate);
  maybeClear(sharedMiddleware);
  if (ensureJwt && ensureJwt.mockClear) ensureJwt.mockClear();
  if (ensureAdminUser && ensureAdminUser.mockClear) ensureAdminUser.mockClear();
  maybeClear(ctrl);
  queryToBody?.assignQueryToBody?.mockRestore?.();
};

beforeEach(() => setupWithMocks());
afterEach(() => clearAllMocks());

describe('floorTagのルーティング', () => {
  test('POST / は JWTを必須とし、floor_idを検証する', async () => {
    const res = await request(app).post('/floortag/').send({ floor_id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('list');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.list).toHaveBeenCalled();
  });

  test('POST /create は JWTを必須とし、order/name/langを検証する', async () => {
    const payload = {
      floor_id: '507f1f77bcf86cd799439011',
      order: 1,
      name: 'tagA',
      lang: 'ja',
    };
    const res = await request(app).post('/floortag/create').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('create');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(tagValidate.validateRoomTagOrder).toHaveBeenCalledWith('order');
    expect(tagValidate.validateRoomTagName).toHaveBeenCalledWith('name');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(ctrl.create).toHaveBeenCalled();
  });

  test('POST /update は JWTを必須とし、_id/order/name/langを検証する', async () => {
    const payload = {
      _id: '507f1f77bcf86cd799439099',
      order: 3,
      name: 'tagB',
      lang: 'en',
    };
    const res = await request(app).post('/floortag/update').send(payload);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('update');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(tagValidate.validateRoomTagOrder).toHaveBeenCalledWith('order');
    expect(tagValidate.validateRoomTagName).toHaveBeenCalledWith('name');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(ctrl.update).toHaveBeenCalled();
  });

  test('POST /delete は JWTを必須とし、_idを検証する', async () => {
    const res = await request(app).post('/floortag/delete').send({ _id: '507f1f77bcf86cd799439099' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('delete');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(ctrl.delete).toHaveBeenCalled();
  });

  test('POST /import は JWTを必須とし、floor_idとCSVの各項目を検証する（csv.*.0、csv.*.1）', async () => {
    const payload = {
      floor_id: '507f1f77bcf86cd799439011',
      csv: [
        [1, 'tagA'],
        [2, 'tagB'],
      ],
    };
    const res = await request(app).post('/floortag/import').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('import');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(tagValidate.validateRoomTagCsv).toHaveBeenCalledWith('csv');
    expect(tagValidate.validateRoomTagOrder).toHaveBeenCalledWith('csv.*.0');
    expect(tagValidate.validateRoomTagName).toHaveBeenCalledWith('csv.*.1');
    expect(ctrl.import).toHaveBeenCalled();
  });

  test('POST /init は JWTを必須とし、floor_idを検証する', async () => {
    const res = await request(app).post('/floortag/init').send({ floor_id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('init');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('floor_id');
    expect(ctrl.init).toHaveBeenCalled();
  });

  test('POST /management/paginate は body を使い JWT認証と管理者権限を確認し、page/searchを検証する', async () => {
    const body = { page: { limit: 10, offset: 0 }, search: { q: 'foo' } };
    const res = await request(app)
      .post('/floortag/management/paginate')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');

    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(baseValidate.validateSearch).toHaveBeenCalledWith('search');
    expect(userValidate.validateOptionalDeleteFlg).not.toHaveBeenCalled();
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual(body);
  });

  test('GET /management/paginate はクエリを body に割り当てて同じミドルウェア列を通る', async () => {
    const res = await request(app).get('/floortag/management/paginate?page=3&search=tag');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');
    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual({ page: '3', search: 'tag' });
  });

  test.each(['put', 'patch', 'delete'])(
    '%s /management/paginate は 404 となり対象ミドルウェアとコントローラへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/floortag/management/paginate').send({ page: 3 });

      expect(res.status).toBe(404);
      expect(queryToBody.assignQueryToBody).not.toHaveBeenCalled();
      expect(ensureJwt).not.toHaveBeenCalled();
      expect(ensureAdminUser).not.toHaveBeenCalled();
      expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
      expect(ctrl.managementPaginate).not.toHaveBeenCalled();
    }
  );

  test('POST /management/update は JWTを必須とし、_id/order/nameを検証する', async () => {
    const res = await request(app)
      .post('/floortag/management/update')
      .send({ _id: '507f1f77bcf86cd799439099', order: 5, name: 'X' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementUpdate');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(tagValidate.validateRoomTagOrder).toHaveBeenCalledWith('order');
    expect(tagValidate.validateRoomTagName).toHaveBeenCalledWith('name');
    expect(userValidate.validateDeleteFlg).not.toHaveBeenCalled();
    expect(ctrl.managementUpdate).toHaveBeenCalled();
  });

  test('POST /management/delete は JWT認証と管理者権限を確認し、_idを検証する', async () => {
    const res = await request(app).post('/floortag/management/delete').send({
      _id: '507f1f77bcf86cd799439099',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementDelete');
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(userValidate.validateDeleteFlg).not.toHaveBeenCalled();
    expect(ctrl.managementDelete).toHaveBeenCalled();
  });
});
