const request = require('supertest');
const express = require('express');

const { attachErrorHandler } = require('../_helpers/app');
const { snapshotEnv, restoreEnv, ensureEnvValue } = require('../_helpers/auth');
const { testRuntimePath, ensureDirSync, trailingSlash, removeDirSafe } = require('../../_helpers/testRuntime');
const { registerApiMounts } = require('../../../routes/apiMounts');

const ORIGINAL_ENV = snapshotEnv([
  'JWT_SECRET',
  'MEDIA_PATH',
  'PROFILE_PATH',
  'GUEST_JWT_SECRET',
  'GUEST_REFRESH_SECRET',
]);

const mediaRoot = testRuntimePath('app-mount-prefix', 'media');
const profileRoot = testRuntimePath('app-mount-prefix', 'profile');

ensureEnvValue('JWT_SECRET', 'test-jwt-secret');
ensureEnvValue('GUEST_JWT_SECRET', 'test-guest-jwt-secret');
ensureEnvValue('GUEST_REFRESH_SECRET', 'test-guest-refresh-secret');
process.env.MEDIA_PATH = trailingSlash(mediaRoot);
process.env.PROFILE_PATH = trailingSlash(profileRoot);
ensureDirSync(mediaRoot);
ensureDirSync(profileRoot);

const ioStub = {
  to: () => ({ emit: () => {} }),
  in: () => ({ emit: () => {} }),
};

const capabilities = Object.freeze({
  googleLogin: false,
  lineLogin: false,
  mailDelivery: false,
  oneSignalPush: false,
  googleTranslate: false,
  openaiTranscription: false,
  openaiAnalysis: false,
  googleAnalytics: false,
});

describe('APIルートの登録と認証', () => {
  let app;
  let mounts;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    mounts = registerApiMounts({
      app,
      io: ioStub,
      capabilities,
      analyticsConfig: { measurementId: null, userIdSecret: null },
      logRequest: () => (_req, _res, next) => next(),
    });
    attachErrorHandler(app);
  });

  afterAll(async () => {
    await removeDirSafe(testRuntimePath('app-mount-prefix'));
    restoreEnv(ORIGINAL_ENV);
  });

  test('指定されたパスにAPIを登録する', () => {
    const paths = mounts.map(({ path }) => path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/capabilities',
        '/api/analytics',
        '/api/auth',
        '/api/guest',
        '/api/user',
        '/api',
        '/api/fileupload',
        '/api/chat',
        '/api/chat/guest',
        '/api/categorytag',
        '/api/soundtag',
        '/api/spam',
        '/api/kickeduser',
        '/api/v1',
      ])
    );
    expect(paths).not.toContain('/api/requestlog');
  });

  test('ユーザ用ルートの前処理でSocket.IOをリクエストへ渡す', () => {
    const userMount = mounts.find(({ path }) => path === '/api/user');
    const req = {};
    const next = jest.fn();

    userMount.middlewares[0](req, {}, next);

    expect(req.io).toBe(ioStub);
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('POST /api/fileupload/profile/imageはトークンがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).post('/api/fileupload/profile/image');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('POST /api/chat/roleはトークンがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).post('/api/chat/role').send({});

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('POST /api/categorytag/managementはトークンがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).post('/api/categorytag/management');

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('POST /api/soundtag/createはトークンがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).post('/api/soundtag/create').send({});

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('POST /api/spam/management/createはトークンがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).post('/api/spam/management/create').send({});

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('POST /api/requestlogを公開しない', async () => {
    const res = await request(app).post('/api/requestlog').send({});

    expect(res.status).toBe(404);
  });

  test('POST /api/kickeduser/checkはトークンがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).post('/api/kickeduser/check').send({});

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });

  test('v1のタイムライン取得はトークンがなければTOKEN_INVALIDを返す', async () => {
    const res = await request(app).get(
      '/api/v1/timeline/floor/507f1f77bcf86cd799439011/room/507f191e810c19729de860ea'
    );

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('TOKEN_INVALID');
  });
});
