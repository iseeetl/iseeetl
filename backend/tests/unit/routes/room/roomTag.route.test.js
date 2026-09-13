const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../../validates/base.validate');
const tagPath = require.resolve('../../../../validates/tag.validate');
const userPath = require.resolve('../../../../validates/user.validate');
const sharedPath = require.resolve('../../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../../middlewares/ensureJsonWebToken');
const optionalIdentityPath = require.resolve('../../../../middlewares/optionalRoomMetadataIdentity');
const ensureAdminUserPath = require.resolve('../../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../../controllers/room/roomTag.controller');
const queryToBodyPath = require.resolve('../../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../../routes/room/roomTag.route');

let baseValidate,
  tagValidate,
  userValidate,
  sharedMiddleware,
  ensureJwt,
  optionalIdentity,
  ensureAdminUser,
  ctrl,
  queryToBody,
  router,
  app;

const buildApp = () => {
  const a = express();
  a.use(express.json());
  a.use('/roomtag', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => (req, res, next) => next();

  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
    validateLang: jest.fn(() => pass()),
    validatePage: jest.fn(() => pass()),
    validateOptionalSearch: jest.fn(() => pass()),
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
  jest.doMock(optionalIdentityPath, () => {
    const optionalIdentityMock = jest.fn((req, res, next) => next());
    return optionalIdentityMock;
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
    managementSetDeleteState: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'managementSetDeleteState' })
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
  optionalIdentity = require(optionalIdentityPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  app = buildApp();
};

const clearAllMocks = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(tagValidate);
  maybeClear(userValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  optionalIdentity?.mockClear?.();
  ensureAdminUser?.mockClear?.();
  maybeClear(ctrl);
  queryToBody?.assignQueryToBody?.mockRestore?.();
};

beforeEach(() => setupWithMocks());
afterEach(() => clearAllMocks());

describe('roomTagのルーティング', () => {
  test('旧POST一覧は登録しない', async () => {
    expect((await request(app).post('/roomtag/').send({})).status).toBe(404);
    expect(ctrl.list).not.toHaveBeenCalled();
  });

  test('POST /create は JWTを必須とし、room_id/order/name/langを検証する', async () => {
    const payload = {
      room_id: '507f1f77bcf86cd799439001',
      order: 1,
      name: 'tagA',
      lang: 'ja',
    };
    const res = await request(app).post('/roomtag/create').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('create');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(tagValidate.validateRoomTagOrder).toHaveBeenCalledWith('order');
    expect(tagValidate.validateRoomTagName).toHaveBeenCalledWith('name');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(ctrl.create).toHaveBeenCalled();
  });

  test('POST /update は JWTを必須とし、_id/order/name/langを検証する', async () => {
    const payload = {
      _id: '507f1f77bcf86cd799439099',
      order: 2,
      name: 'tagB',
      lang: 'en',
    };
    const res = await request(app).post('/roomtag/update').send(payload);

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
    const res = await request(app).post('/roomtag/delete').send({ _id: '507f1f77bcf86cd799439099' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('delete');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(ctrl.delete).toHaveBeenCalled();
  });

  test('POST /import は JWTを必須とし、room_idとCSVの各項目を検証する（csv.*.0、csv.*.1）', async () => {
    const payload = {
      room_id: '507f1f77bcf86cd799439001',
      csv: [
        [1, 'tagA'],
        [2, 'tagB'],
      ],
    };
    const res = await request(app).post('/roomtag/import').send(payload);

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('import');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(tagValidate.validateRoomTagCsv).toHaveBeenCalledWith('csv');
    expect(tagValidate.validateRoomTagOrder).toHaveBeenCalledWith('csv.*.0');
    expect(tagValidate.validateRoomTagName).toHaveBeenCalledWith('csv.*.1');
    expect(ctrl.import).toHaveBeenCalled();
  });

  test('POST /init は JWTを必須とし、room_idを検証する', async () => {
    const res = await request(app).post('/roomtag/init').send({ room_id: '507f1f77bcf86cd799439001' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('init');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id');
    expect(ctrl.init).toHaveBeenCalled();
  });

  test('POST /management/paginate は body を使い JWT認証と管理者権限を確認し、ページを検証する', async () => {
    const body = { page: { limit: 10, offset: 0 } };
    const res = await request(app)
      .post('/roomtag/management/paginate')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');

    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
    expect(baseValidate.validateOptionalSearch).toHaveBeenCalledWith('search');
    expect(userValidate.validateOptionalDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual(body);
  });

  test('GET /management/paginate はクエリを body に割り当てて同じミドルウェア列を通る', async () => {
    const res = await request(app).get('/roomtag/management/paginate?page=5');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementPaginate');
    expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.managementPaginate).toHaveBeenCalled();
    expect(ctrl.managementPaginate.mock.calls[0][0].body).toEqual({ page: '5' });
  });

  test.each(['put', 'patch', 'delete'])(
    '%s /management/paginate は 404 となり対象ミドルウェアとコントローラへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/roomtag/management/paginate').send({ page: 5 });

      expect(res.status).toBe(404);
      expect(queryToBody.assignQueryToBody).not.toHaveBeenCalled();
      expect(ensureJwt).not.toHaveBeenCalled();
      expect(ensureAdminUser).not.toHaveBeenCalled();
      expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
      expect(ctrl.managementPaginate).not.toHaveBeenCalled();
    }
  );

  test('POST /management/update は JWTを必須とし、_id/order/name/delete_flgを検証する', async () => {
    const res = await request(app)
      .post('/roomtag/management/update')
      .send({ _id: '507f1f77bcf86cd799439099', order: 5, name: 'X', delete_flg: false });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementUpdate');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(tagValidate.validateRoomTagOrder).toHaveBeenCalledWith('order');
    expect(tagValidate.validateRoomTagName).toHaveBeenCalledWith('name');
    expect(userValidate.validateDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.managementUpdate).toHaveBeenCalled();
  });

  test('POST /management/delete-state は JWT認証と管理者権限を確認し、_id/delete_flgを検証する', async () => {
    const res = await request(app).post('/roomtag/management/delete-state').send({
      _id: '507f1f77bcf86cd799439099',
      delete_flg: false,
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
