const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../validates/base.validate');
const spamPath = require.resolve('../../../validates/spam.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const ensureAdminUserPath = require.resolve('../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../controllers/spam.controller');
const queryToBodyPath = require.resolve('../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../routes/spam.route');

let baseValidate, spamValidate, sharedMiddleware, ensureJwt, ensureAdminUser, ctrl, queryToBody, app;

const buildApp = (router) => {
  const a = express();
  a.use(express.json());
  a.use('/spam', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => jest.fn((req, res, next) => next());

  jest.doMock(basePath, () => ({
    validatePage: jest.fn(() => pass()),
    validateMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(spamPath, () => ({
    validateSpamSearch: jest.fn(() => pass()),
    validateSpamWord: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(ensureJwtPath, () => jest.fn((req, res, next) => next()));
  jest.doMock(ensureAdminUserPath, () => jest.fn((req, res, next) => next()));

  jest.doMock(controllerPath, () => ({
    getSpamList: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'getSpamList', body: req.body })
    ),
    createSpam: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'createSpam' })),
    updateSpam: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'updateSpam' })),
    deleteSpam: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'deleteSpam' })),
  }));

  queryToBody = require(queryToBodyPath);
  jest.spyOn(queryToBody, 'assignQueryToBody');

  const router = require(routerPath);

  baseValidate = require(basePath);
  spamValidate = require(spamPath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdminUser = require(ensureAdminUserPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(spamValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  ensureAdminUser?.mockClear?.();
  queryToBody?.assignQueryToBody?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('spamのルーティング', () => {
  test.each([
    ['GET', 'get', '/spam/management/paginate?page=1&search=word', null, { page: '1', search: 'word' }],
    ['POST', 'post', '/spam/management/paginate', { page: 1, search: 'word' }, { page: 1, search: 'word' }],
  ])(
    '%s /management/paginate はquery/bodyを渡して JWT認証と管理者権限を確認し、page/searchを検証する',
    async (_label, method, path, payload, expectedBody) => {
      const requestBuilder = request(app)[method](path);
      const res = await (payload ? requestBuilder.send(payload) : requestBuilder);

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('getSpamList');
      expect(res.body.body).toEqual(expectedBody);

      const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
      const searchMiddleware = spamValidate.validateSpamSearch.mock.results[0].value;
      expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
      expect(ensureJwt).toHaveBeenCalled();
      expect(ensureAdminUser).toHaveBeenCalled();
      expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
      expect(spamValidate.validateSpamSearch).toHaveBeenCalledWith('search');
      expect(pageMiddleware).toHaveBeenCalledTimes(1);
      expect(searchMiddleware).toHaveBeenCalledTimes(1);
      expect(pageMiddleware.mock.calls[0][0].body).toEqual(expectedBody);
      expect(searchMiddleware.mock.calls[0][0].body).toEqual(expectedBody);
      expect(ctrl.getSpamList).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['put', 'patch', 'delete'])(
    '%s /management/paginate は404となり対象middleware/controllerへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/spam/management/paginate');

      const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
      const searchMiddleware = spamValidate.validateSpamSearch.mock.results[0].value;
      expect(res.status).toBe(404);
      expect(queryToBody.assignQueryToBody).not.toHaveBeenCalled();
      expect(ensureJwt).not.toHaveBeenCalled();
      expect(ensureAdminUser).not.toHaveBeenCalled();
      expect(pageMiddleware).not.toHaveBeenCalled();
      expect(searchMiddleware).not.toHaveBeenCalled();
      expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
      expect(ctrl.getSpamList).not.toHaveBeenCalled();
    }
  );

  test('POST /management/create は JWT認証と管理者権限を必須とし、wordを検証する', async () => {
    const res = await request(app).post('/spam/management/create').send({ word: 'badword' });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('createSpam');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(spamValidate.validateSpamWord).toHaveBeenCalledWith('word');
    expect(ctrl.createSpam).toHaveBeenCalled();
  });

  test('POST /management/update は JWT認証と管理者権限を必須とし、_id/wordを検証する', async () => {
    const res = await request(app)
      .post('/spam/management/update')
      .send({ _id: '507f1f77bcf86cd799439011', word: 'newword' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updateSpam');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(spamValidate.validateSpamWord).toHaveBeenCalledWith('word');
    expect(ctrl.updateSpam).toHaveBeenCalled();
  });

  test('POST /management/delete は JWT認証と管理者権限を必須とし、_idを検証する', async () => {
    const res = await request(app).post('/spam/management/delete').send({ _id: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('deleteSpam');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdminUser).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(ctrl.deleteSpam).toHaveBeenCalled();
  });
});
