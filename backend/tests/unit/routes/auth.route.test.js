const express = require('express');
const request = require('supertest');
const { snapshotEnv, restoreEnv } = require('../_helpers/env');

const basePath = require.resolve('../../../validates/base.validate');
const userPath = require.resolve('../../../validates/user.validate');
const authPath = require.resolve('../../../validates/auth.validate');
const sharedPath = require.resolve('../../../middlewares/validation');
const controllerPath = require.resolve('../../../controllers/auth.controller');
const ensureJsonWebTokenPath = require.resolve('../../../middlewares/ensureJsonWebToken');
const routerPath = require.resolve('../../../routes/auth.route');

jest.mock('express-rate-limit', () => jest.fn(() => (req, res, next) => next()));

let baseValidate, userValidate, authValidate, sharedMiddleware, ensureJsonWebToken, ctrl, rateLimit, app;
const RATE_LIMIT_ENV = snapshotEnv([
  'RESET_MAIL_RATE_LIMIT_WINDOW_MS',
  'RESET_MAIL_RATE_LIMIT_MAX',
  'RESET_MAIL_IP_RATE_LIMIT_MAX',
  'LOGIN_RATE_LIMIT_WINDOW_MS',
  'LOGIN_RATE_LIMIT_MAX',
]);

const buildApp = (router) => {
  const a = express();
  a.use(express.json());
  a.use('/auth', router);
  return a;
};

const setupWithMocks = () => {
  jest.resetModules();

  rateLimit = require('express-rate-limit');

  const pass = () => (req, res, next) => next();
  jest.doMock(basePath, () => ({
    validateMongoId: jest.fn(() => pass()),
    validateLang: jest.fn(() => pass()),
    validateLangQueryOptional: jest.fn(() => pass()),
    validateOptionalQueryString: jest.fn(() => pass()),
    validateString: jest.fn(() => pass()),
    validateUserName: jest.fn(() => pass()),
  }));
  jest.doMock(userPath, () => ({
    validateMail: jest.fn(() => pass()),
    validatePassword: jest.fn(() => pass()),
    normalizeMail: jest.fn((value) => value.trim().toLowerCase()),
  }));
  jest.doMock(authPath, () => ({
    validateInviteToken: jest.fn(() => pass()),
    validateResetPasswordToken: jest.fn(() => pass()),
  }));
  jest.doMock(sharedPath, () => ({
    finalize: jest.fn(pass()),
  }));
  jest.doMock(ensureJsonWebTokenPath, () => jest.fn(pass()));

  jest.doMock(controllerPath, () => ({
    register: jest.fn((req, res) => res.status(201).json({ ok: true, action: 'register' })),
    activate: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'activate' })),
    logout: jest.fn((req, res) => res.sendStatus(204)),
    login: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'login' })),
    googleLogin: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'googleLogin' })),
    getPushIdentity: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'getPushIdentity' })),
    lineAuthorize: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'lineAuthorize' })),
    lineCallback: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'lineCallback' })),
    sendResetPasswordMail: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'sendResetPasswordMail' })),
    verifyResetPasswordToken: jest.fn((req, res) =>
      res.status(200).json({ ok: true, action: 'verifyResetPasswordToken' })
    ),
    resetPassword: jest.fn((req, res) => res.status(200).json({ ok: true, action: 'resetPassword' })),
  }));

  // ルート読込時にレート制限の設定が確定するため、モックと環境変数の設定後に読み込む。
  const router = require(routerPath);

  baseValidate = require(basePath);
  userValidate = require(userPath);
  authValidate = require(authPath);
  sharedMiddleware = require(sharedPath);
  ensureJsonWebToken = require(ensureJsonWebTokenPath);
  ctrl = require(controllerPath);

  app = buildApp(router);
};

const clearAll = () => {
  const maybeClear = (obj) => obj && Object.values(obj).forEach((fn) => fn?.mockClear && fn.mockClear());
  maybeClear(baseValidate);
  maybeClear(userValidate);
  maybeClear(authValidate);
  maybeClear(sharedMiddleware);
  ensureJsonWebToken?.mockClear?.();
  maybeClear(ctrl);
  rateLimit?.mockClear?.();
};

beforeEach(setupWithMocks);
afterEach(() => {
  clearAll();
  restoreEnv(RATE_LIMIT_ENV);
});

describe('authのルーティング', () => {
  test('モジュール読み込み時に rateLimit が設定されている（/login, /resetpassword/sendmail）', () => {
    expect(rateLimit).toHaveBeenCalledTimes(3);
    expect(rateLimit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        windowMs: 60 * 60 * 1000,
        max: 5,
        keyGenerator: expect.any(Function),
      })
    );
    expect(rateLimit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        windowMs: 60 * 60 * 1000,
        max: 20,
      })
    );

    expect(rateLimit).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        windowMs: 15 * 60 * 1000,
        max: 20,
        skipSuccessfulRequests: true,
      })
    );
  });

  test('resetpassword/sendmailのレート制限キーはメール表記揺れを正規化する', () => {
    const keyGenerator = rateLimit.mock.calls[0][0].keyGenerator;

    expect(keyGenerator({ body: { mail: ' User@Example.COM ' }, ip: '203.0.113.1' })).toBe(
      'mail:user@example.com'
    );
    expect(keyGenerator({ body: { mail: 'user@example.com' }, ip: '203.0.113.1' })).toBe(
      'mail:user@example.com'
    );
    expect(keyGenerator({ body: { mail: null }, ip: '203.0.113.1' })).toBe(
      'invalid-mail:203.0.113.1'
    );
  });

  test('環境変数で rateLimit 設定を上書きできる', () => {
    process.env.RESET_MAIL_RATE_LIMIT_WINDOW_MS = '120000';
    process.env.RESET_MAIL_RATE_LIMIT_MAX = '7';
    process.env.RESET_MAIL_IP_RATE_LIMIT_MAX = '11';
    process.env.LOGIN_RATE_LIMIT_WINDOW_MS = '60000';
    process.env.LOGIN_RATE_LIMIT_MAX = '9';
    setupWithMocks();

    expect(rateLimit).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        windowMs: 120000,
        max: 7,
        keyGenerator: expect.any(Function),
      })
    );
    expect(rateLimit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        windowMs: 120000,
        max: 11,
      })
    );

    expect(rateLimit).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        windowMs: 60000,
        max: 9,
        skipSuccessfulRequests: true,
      })
    );

  });

  test('POST /register は username/mail/password/langを検証する', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ username: 'Alice', mail: 'a@example.com', password: 'secret', lang: 'ja' });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('register');

    expect(baseValidate.validateUserName).toHaveBeenCalledWith('username');
    expect(userValidate.validateMail).toHaveBeenCalledWith('mail');
    expect(userValidate.validatePassword).toHaveBeenCalledWith('password');
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id', { required: false });
    expect(ctrl.register).toHaveBeenCalled();
  });

  test('POST /activate は invite_tokenを検証する', async () => {
    const res = await request(app).post('/auth/activate').send({ invite_token: 'tok_xxx' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('activate');

    expect(authValidate.validateInviteToken).toHaveBeenCalledWith('invite_token');
    expect(baseValidate.validateMongoId).toHaveBeenCalledWith('room_id', { required: false });
    expect(ctrl.activate).toHaveBeenCalled();
  });

  test('POST /login は mail/passwordを検証する', async () => {
    const res = await request(app).post('/auth/login').send({ mail: 'a@example.com', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('login');

    expect(userValidate.validateMail).toHaveBeenCalledWith('mail');
    expect(userValidate.validatePassword).toHaveBeenCalledWith('password');
    expect(ctrl.login).toHaveBeenCalled();
  });

  test('POST /google/login は id_token/langを検証する', async () => {
    const res = await request(app).post('/auth/google/login').send({ id_token: 'tok_xxx', lang: 'ja' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('googleLogin');

    expect(baseValidate.validateString).toHaveBeenCalledWith('id_token', { min: 10, max: 5000 });
    expect(baseValidate.validateLang).toHaveBeenCalledWith('lang');
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.googleLogin).toHaveBeenCalled();
  });

  test('GET /push-identity はJWT認証を必須にする', async () => {
    const res = await request(app).get('/auth/push-identity');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('getPushIdentity');
    expect(ensureJsonWebToken).toHaveBeenCalled();
    expect(ctrl.getPushIdentity).toHaveBeenCalled();
  });

  test('GET /line/authorize は lang クエリ任意検証', async () => {
    const res = await request(app).get('/auth/line/authorize?lang=ja&floor_id=floor-1&room_id=room-1');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('lineAuthorize');

    expect(baseValidate.validateLangQueryOptional).toHaveBeenCalledWith('lang');
    expect(baseValidate.validateOptionalQueryString).toHaveBeenCalledWith('floor_id', { max: 64 });
    expect(baseValidate.validateOptionalQueryString).toHaveBeenCalledWith('room_id', { max: 64 });
    expect(sharedMiddleware.finalize).toHaveBeenCalled();
    expect(ctrl.lineAuthorize).toHaveBeenCalled();
  });

  test('GET /line/callback は入力検証を行わずコントローラを呼ぶ', async () => {
    const res = await request(app).get('/auth/line/callback');

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('lineCallback');

    expect(sharedMiddleware.finalize).not.toHaveBeenCalled();
    expect(ctrl.lineCallback).toHaveBeenCalled();
  });

  test('POST /resetpassword/sendmailはレート制限を適用し、メールを検証する', async () => {
    const res = await request(app).post('/auth/resetpassword/sendmail').send({ mail: 'a@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('sendResetPasswordMail');

    expect(userValidate.validateMail).toHaveBeenCalledWith('mail');
    expect(ctrl.sendResetPasswordMail).toHaveBeenCalled();
  });

  test('POST /resetpassword/verifyはトークンを検証する', async () => {
    const res = await request(app).post('/auth/resetpassword/verify').send({ token: 'rst_tok' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('verifyResetPasswordToken');

    expect(authValidate.validateResetPasswordToken).toHaveBeenCalledWith('token');
    expect(ctrl.verifyResetPasswordToken).toHaveBeenCalled();
  });

  test('POST /resetpassword は password/tokenを検証する', async () => {
    const res = await request(app).post('/auth/resetpassword').send({ password: 'newpass', token: 'rst_tok' });

    expect(res.status).toBe(200);
    expect(res.body.action).toBe('resetPassword');

    expect(userValidate.validatePassword).toHaveBeenCalledWith('password');
    expect(authValidate.validateResetPasswordToken).toHaveBeenCalledWith('token');
    expect(ctrl.resetPassword).toHaveBeenCalled();
  });
});
