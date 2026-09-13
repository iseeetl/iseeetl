const express = require('express');
const request = require('supertest');

const basePath = require.resolve('../../../validates/base.validate');
const mediaPath = require.resolve('../../../validates/media.validate');
const userPath = require.resolve('../../../validates/user.validate');
const settingValidatePath = require.resolve('../../../validates/aiAnalysisSetting.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const ensureJwtPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const ensureAdminPath = require.resolve('../../../middlewares/ensureAdminUser');
const controllerPath = require.resolve('../../../controllers/user.controller');
const queryToBodyPath = require.resolve('../../../routes/_shared/queryToBody');
const routerPath = require.resolve('../../../routes/user.route');

let baseValidate;
let mediaValidate;
let userValidate;
let settingValidate;
let sharedMiddleware;
let ensureJwt;
let ensureAdmin;
let ctrl;
let queryToBody;
let app;

const buildApp = (router) => {
  const a = express();
  a.use(express.json());
  a.use('/user', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();
  const pass = () => jest.fn((req, res, next) => next());
  const actualUserValidate = jest.requireActual(userPath);

  jest.doMock(basePath, () => ({
    validateUserName: jest.fn(() => pass()),
    validateLang: jest.fn(() => pass()),
    validatePage: jest.fn(() => pass()),
    validateMongoId: jest.fn(() => pass()),
  }));
  jest.doMock(mediaPath, () => ({
    validateImageName: jest.fn(() => pass()),
  }));
  jest.doMock(userPath, () => ({
    validateEyeFriendlyMode: jest.fn(() => pass()),
    validatePushEnabled: jest.fn(() => pass()),
    validateReplyPushEnabled: jest.fn(() => pass()),
    validateRepliedPostPushEnabled: jest.fn(() => pass()),
    validateOldPassword: jest.fn(() => pass()),
    validateNewPassword: jest.fn(() => pass()),
    validateUserSearch: jest.fn(() => pass()),
    validateNullableMail: jest.fn(() => pass()),
    validatePasswordNone: jest.fn(() => pass()),
    validateUserRole: jest.fn(() => pass()),
    validateDeleteFlg: jest.fn(() => pass()),
    validateOptionalDeleteFlg: jest.fn(actualUserValidate.validateOptionalDeleteFlg),
    validateOptionalQueryDeleteFlg: jest.fn(actualUserValidate.validateOptionalQueryDeleteFlg),
  }));
  jest.doMock(settingValidatePath, () => ({
    validateAllowedBodyFields: jest.fn(() => pass()),
    validateResultUserSearch: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));

  jest.doMock(ensureJwtPath, () => jest.fn((req, res, next) => next()));
  jest.doMock(ensureAdminPath, () => jest.fn((req, res, next) => next()));

  jest.doMock(controllerPath, () => ({
    getUserDetail: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'getUserDetail' })),
    updateUser: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'updateUser' })),
    changePassword: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'changePassword' })),
    getUserListPaginate: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'getUserListPaginate', body: req.body })
    ),
    managementUpdateUser: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'managementUpdateUser' })),
    managementSetDeleteState: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'managementSetDeleteState' })
    ),
    searchAIAnalysisResultUsers: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'searchAIAnalysisResultUsers' })
    ),
  }));

  queryToBody = require(queryToBodyPath);
  jest.spyOn(queryToBody, 'assignQueryToBody');

  const router = require(routerPath);

  baseValidate = require(basePath);
  mediaValidate = require(mediaPath);
  userValidate = require(userPath);
  settingValidate = require(settingValidatePath);
  sharedMiddleware = require(sharedPath);
  ensureJwt = require(ensureJwtPath);
  ensureAdmin = require(ensureAdminPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(mediaValidate);
  maybeClear(userValidate);
  maybeClear(settingValidate);
  maybeClear(sharedMiddleware);
  ensureJwt?.mockClear?.();
  ensureAdmin?.mockClear?.();
  queryToBody?.assignQueryToBody?.mockClear?.();
  maybeClear(ctrl);
};

beforeEach(setupWithMocks);
afterEach(clearAll);

describe('userのルーティング', () => {
  test('GET /detail は JWTを必須とし、入力検証を行わない', async () => {
    const res = await request(app).get('/user/detail');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('getUserDetail');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ctrl.getUserDetail).toHaveBeenCalled();
  });

  test('POST /update は JWTを必須とし、ユーザ設定の各項目を検証する', async () => {
    const res = await request(app).post('/user/update').send({
      username: 'Alice',
      image_name: 'img.png',
      lang: 'ja',
      eye_friendly_mode: true,
      push_enabled: true,
      reply_push_enabled: false,
      replied_post_push_enabled: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('updateUser');

    expect(ensureJwt).toHaveBeenCalled();
    expect(baseValidate.validateUserName).toHaveBeenCalledWith('username');
    expect(mediaValidate.validateImageName).toHaveBeenCalledWith('image_name');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(userValidate.validateEyeFriendlyMode).toHaveBeenCalledWith('eye_friendly_mode');
    expect(userValidate.validatePushEnabled).toHaveBeenCalledWith('push_enabled');
    expect(userValidate.validateReplyPushEnabled).toHaveBeenCalledWith('reply_push_enabled');
    expect(userValidate.validateRepliedPostPushEnabled).toHaveBeenCalledWith('replied_post_push_enabled');
    expect(ctrl.updateUser).toHaveBeenCalled();
  });

  test('POST /changepassword は JWTを必須とし、変更前後のパスワードを検証する', async () => {
    const res = await request(app).post('/user/changepassword').send({
      old_password: 'old',
      new_password: 'newStrongP@ss',
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('changePassword');

    expect(ensureJwt).toHaveBeenCalled();
    expect(userValidate.validateOldPassword).toHaveBeenCalledWith('old_password');
    expect(userValidate.validateNewPassword).toHaveBeenCalledWith('new_password');
    expect(ctrl.changePassword).toHaveBeenCalled();
  });

  test.each([
    [
      'GET（有効）',
      'get',
      '/user/management/paginate?page=1&search=user&delete_flg=false',
      null,
      { page: '1', search: 'user', delete_flg: false },
    ],
    [
      'GET（削除済み）',
      'get',
      '/user/management/paginate?page=1&search=user&delete_flg=true',
      null,
      { page: '1', search: 'user', delete_flg: true },
    ],
    ['POST', 'post', '/user/management/paginate', { page: 1, search: 'user' }, { page: 1, search: 'user' }],
  ])(
    '%s /management/paginate はquery/bodyを渡して JWT認証と管理者権限を確認し、page/searchを検証する',
    async (_label, method, path, payload, expectedBody) => {
      const requestBuilder = request(app)[method](path);
      const res = await (payload ? requestBuilder.send(payload) : requestBuilder);

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('getUserListPaginate');
      expect(res.body.body).toEqual(expectedBody);

      const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
      const searchMiddleware = userValidate.validateUserSearch.mock.results[0].value;
      expect(queryToBody.assignQueryToBody).toHaveBeenCalledTimes(1);
      expect(ensureJwt).toHaveBeenCalled();
      expect(ensureAdmin).toHaveBeenCalled();
      expect(baseValidate.validatePage).toHaveBeenCalledWith('page');
      expect(userValidate.validateUserSearch).toHaveBeenCalledWith('search');
      expect(userValidate.validateOptionalDeleteFlg).toHaveBeenCalledWith('delete_flg');
      expect(pageMiddleware).toHaveBeenCalledTimes(1);
      expect(searchMiddleware).toHaveBeenCalledTimes(1);
      expect(pageMiddleware.mock.calls[0][0].body).toEqual(expectedBody);
      expect(searchMiddleware.mock.calls[0][0].body).toEqual(expectedBody);
      expect(ctrl.getUserListPaginate).toHaveBeenCalledTimes(1);
    }
  );

  test.each(['put', 'patch', 'delete'])(
    '%s /management/paginate は404となり対象middleware/controllerへ到達しない',
    async (method) => {
      const res = await request(app)[method]('/user/management/paginate');

      const pageMiddleware = baseValidate.validatePage.mock.results[0].value;
      const searchMiddleware = userValidate.validateUserSearch.mock.results[0].value;
      expect(res.status).toBe(404);
      expect(queryToBody.assignQueryToBody).not.toHaveBeenCalled();
      expect(ensureJwt).not.toHaveBeenCalled();
      expect(ensureAdmin).not.toHaveBeenCalled();
      expect(pageMiddleware).not.toHaveBeenCalled();
      expect(searchMiddleware).not.toHaveBeenCalled();
      expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
      expect(ctrl.getUserListPaginate).not.toHaveBeenCalled();
    }
  );

  test('POST /management/updateはJWT認証と管理者権限を必須とし、_id/username/mail/password/role/delete_flgを検証する（mail・passwordはnullを許可）', async () => {
    const res = await request(app).post('/user/management/update').send({
      _id: '507f1f77bcf86cd799439011',
      username: 'Bob',
      mail: null,
      password: null,
      role: 'Administrator',
      delete_flg: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementUpdateUser');

    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdmin).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(baseValidate.validateUserName).toHaveBeenCalledWith('username');
    expect(userValidate.validateNullableMail).toHaveBeenCalledWith('mail');
    expect(userValidate.validatePasswordNone).toHaveBeenCalledWith('password');
    expect(userValidate.validateUserRole).toHaveBeenCalledWith('role');
    expect(userValidate.validateDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.managementUpdateUser).toHaveBeenCalled();
  });

  test('POST /management/delete-state は JWT認証と管理者権限を確認し、_id/delete_flgを検証する', async () => {
    const res = await request(app).post('/user/management/delete-state').send({
      _id: '507f1f77bcf86cd799439011',
      delete_flg: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('managementSetDeleteState');
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdmin).toHaveBeenCalled();
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('_id');
    expect(userValidate.validateDeleteFlg).toHaveBeenCalledWith('delete_flg');
    expect(ctrl.managementSetDeleteState).toHaveBeenCalled();
  });

  test('POST /ai-analysis-result-users/search はJWT、管理者とallowlist/search検証を通す', async () => {
    const res = await request(app)
      .post('/user/ai-analysis-result-users/search')
      .send({ search: 'support' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('searchAIAnalysisResultUsers');
    expect(ensureJwt).toHaveBeenCalled();
    expect(ensureAdmin).toHaveBeenCalled();
    expect(settingValidate.validateAllowedBodyFields).toHaveBeenCalledWith(['search']);
    expect(settingValidate.validateResultUserSearch).toHaveBeenCalledWith('search');
    expect(ctrl.searchAIAnalysisResultUsers).toHaveBeenCalled();
  });
});
