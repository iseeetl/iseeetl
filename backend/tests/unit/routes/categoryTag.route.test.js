const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../validates/base.validate');
const tagPath = require.resolve('../../../validates/tag.validate');
const userPath = require.resolve('../../../validates/user.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const ensureAdminUserPath = require.resolve('../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../controllers/categoryTag.controller');
const queryToBodyPath = require.resolve('../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../routes/categoryTag.route');

let baseValidate, tagValidate, userValidate, sharedMiddleware, ensureJwt, ensureAdminUser, ctrl, queryToBody, app;

const buildApp = (router) => {
  const a = express();
  a.use(express.json());
  a.use('/ctag', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => jest.fn((req, res, next) => next());

  jest.doMock(basePath, () => ({
    validatePage: jest.fn(() => pass()),
    validateMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(tagPath, () => ({
    validateCategoryTagSearch: jest.fn(() => pass()),
    validateCategoryTagOrder: jest.fn(() => pass()),
    validateCategoryTagName: jest.fn(() => pass()),
    validateCategoryTagCsv: jest.fn(() => pass()),
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
    const m = jest.fn((req, res, next) => next());
    return m;
  });

  jest.doMock(ensureAdminUserPath, () => {
    const m = jest.fn((req, res, next) => next());
    return m;
  });

  jest.doMock(controllerPath, () => ({
    list: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'list' })),
    paginate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'paginate', body: req.body })),
    create: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'create' })),
    update: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'update' })),
    delete: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'delete' })),
    import: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'import' })),
  }));

  queryToBody = require(queryToBodyPath);
  jest.spyOn(queryToBody, 'assignQueryToBody');

  const router = require(routerPath);

  baseValidate = require(basePath);
  tagValidate = require(tagPath);
  userValidate = require(userPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(tagValidate);
  maybeClear(userValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  ensureAdminUser?.mockClear?.();
  queryToBody?.assignQueryToBody?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('categoryTagのルーティング', () => {
  test('POST /management は JWT認証と管理者権限を必須とし、入力検証を行わない', async () => {
    const res = await request(app).post('/ctag/management').send({});
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('list');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(ctrl.list).toHaveBeenCalled();
  });

  test.each([
    ['GET', 'get', '/ctag/management/paginate?page=1&search=tag', null, { page: '1', search: 'tag' }],
    ['POST', 'post', '/ctag/management/paginate', { page: 1, search: 'tag' }, { page: 1, search: 'tag' }],
  ])(
    '%s /management/paginate はquery/bodyを渡して JWT認証と管理者権限を確認し、page/searchを検証する',
    async (_label, method, path, payload, expectedBody) => {
      const requestBuilder = request(app)[method](path);
      const res = await (payload ? requestBuilder.send(payload) : requestBuilder);

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('paginate');
      expect(res.body.body).toEqual(expectedBody);

      const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
      const searchMiddleware = tagValidate.validateCategoryTagSearch.mock.results[0].value;
      expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
      expect(ensureJwt).toHaveBeenCalled();
      expect(ensureAdminUser).toHaveBeenCalled();
      expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
      expect(tagValidate.validateCategoryTagSearch).toHaveBeenCalledWith('search');
      expect(userValidate.validateOptionalDeleteFlg).not.toHaveBeenCalled();
      expect(pageMiddleware).toHaveBeenCalledTimes(1);
      expect(searchMiddleware).toHaveBeenCalledTimes(1);
      expect(pageMiddleware.mock.calls[0][0].body).toEqual(expectedBody);
      expect(searchMiddleware.mock.calls[0][0].body).toEqual(expectedBody);
      expect(ctrl.paginate).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['put', 'patch', 'delete'])(
    '%s /management/paginate は404となり対象middleware/controllerへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/ctag/management/paginate');

      const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
      const searchMiddleware = tagValidate.validateCategoryTagSearch.mock.results[0].value;
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

  test('POST /management/create は JWT認証と管理者権限を必須とし、order/nameを検証する', async () => {
    const res = await request(app).post('/ctag/management/create').send({ order: 1, name: 'TagA' });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('create');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(tagValidate.validateCategoryTagOrder).toHaveBeenCalledWith('order');
    expect(tagValidate.validateCategoryTagName).toHaveBeenCalledWith('name');
    expect(ctrl.create).toHaveBeenCalled();
  });

  test('POST /management/update は JWT認証と管理者権限を必須とし、_id/order/nameを検証する', async () => {
    const res = await request(app)
      .post('/ctag/management/update')
      .send({ _id: '507f1f77bcf86cd799439011', order: 2, name: 'TagB' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('update');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(tagValidate.validateCategoryTagOrder).toHaveBeenCalledWith('order');
    expect(tagValidate.validateCategoryTagName).toHaveBeenCalledWith('name');
    expect(userValidate.validateDeleteFlg).not.toHaveBeenCalled();
    expect(ctrl.update).toHaveBeenCalled();
  });

  test('POST /management/delete は JWT認証と管理者権限を確認し、_idを検証する', async () => {
    const res = await request(app).post('/ctag/management/delete').send({
      _id: '507f1f77bcf86cd799439011',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('delete');
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(userValidate.validateDeleteFlg).not.toHaveBeenCalled();
    expect(ctrl.delete).toHaveBeenCalled();
  });

  test('POST /management/import は JWT認証と管理者権限を必須とし、CSVの各項目を検証する（csv, csv.*.0, csv.*.1）', async () => {
    const res = await request(app)
      .post('/ctag/management/import')
      .send({
        csv: [
          [1, 'TagA'],
          [2, 'TagB'],
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('import');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(tagValidate.validateCategoryTagCsv).toHaveBeenCalledWith('csv');
    expect(tagValidate.validateCategoryTagOrder).toHaveBeenCalledWith('csv.*.0');
    expect(tagValidate.validateCategoryTagName).toHaveBeenCalledWith('csv.*.1');
    expect(ctrl.import).toHaveBeenCalled();
  });
});
