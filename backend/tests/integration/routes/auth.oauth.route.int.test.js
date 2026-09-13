const express = require('express');
const request = require('supertest');
const cookieParser = require('cookie-parser');

const ORIGINAL_ENV = {
  JWT_SECRET: process.env.JWT_SECRET,
  EXTERNAL_GOOGLE_LOGIN_ENABLED: process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED,
  EXTERNAL_LINE_LOGIN_ENABLED: process.env.EXTERNAL_LINE_LOGIN_ENABLED,
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  LINE_LOGIN_CHANNEL_ID: process.env.LINE_LOGIN_CHANNEL_ID,
  LINE_LOGIN_CHANNEL_SECRET: process.env.LINE_LOGIN_CHANNEL_SECRET,
  LINE_LOGIN_REDIRECT_URI: process.env.LINE_LOGIN_REDIRECT_URI,
  VUE_APP_APPURL: process.env.VUE_APP_APPURL,
};

if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'test-jwt-secret';
process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED = 'true';
process.env.EXTERNAL_LINE_LOGIN_ENABLED = 'true';
if (!process.env.GOOGLE_OAUTH_CLIENT_ID) process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client';
if (!process.env.LINE_LOGIN_CHANNEL_ID) process.env.LINE_LOGIN_CHANNEL_ID = 'line-client-id';
if (!process.env.LINE_LOGIN_CHANNEL_SECRET) process.env.LINE_LOGIN_CHANNEL_SECRET = 'line-secret';
if (!process.env.LINE_LOGIN_REDIRECT_URI) process.env.LINE_LOGIN_REDIRECT_URI = 'http://localhost:3000/line/callback';
if (!process.env.VUE_APP_APPURL) process.env.VUE_APP_APPURL = 'http://localhost:3000';

const authRouter = require('../../../routes/auth.route');
const authService = require('../../../services/auth.service');
const AppError = require('../../../utils/appError');
const { attachErrorHandler } = require('../_helpers/app');

describe('Google・LINE認証API', () => {
  let app;

  const buildApp = () => {
    const a = express();
    a.use(express.json());
    a.use(cookieParser());
    a.use('/api/auth', authRouter);
    return attachErrorHandler(a);
  };

  afterAll(() => {
    if (ORIGINAL_ENV.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_ENV.JWT_SECRET;
    if (ORIGINAL_ENV.EXTERNAL_GOOGLE_LOGIN_ENABLED === undefined) {
      delete process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED;
    } else process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED = ORIGINAL_ENV.EXTERNAL_GOOGLE_LOGIN_ENABLED;
    if (ORIGINAL_ENV.EXTERNAL_LINE_LOGIN_ENABLED === undefined) {
      delete process.env.EXTERNAL_LINE_LOGIN_ENABLED;
    } else process.env.EXTERNAL_LINE_LOGIN_ENABLED = ORIGINAL_ENV.EXTERNAL_LINE_LOGIN_ENABLED;
    if (ORIGINAL_ENV.GOOGLE_OAUTH_CLIENT_ID === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = ORIGINAL_ENV.GOOGLE_OAUTH_CLIENT_ID;
    if (ORIGINAL_ENV.LINE_LOGIN_CHANNEL_ID === undefined) delete process.env.LINE_LOGIN_CHANNEL_ID;
    else process.env.LINE_LOGIN_CHANNEL_ID = ORIGINAL_ENV.LINE_LOGIN_CHANNEL_ID;
    if (ORIGINAL_ENV.LINE_LOGIN_CHANNEL_SECRET === undefined) delete process.env.LINE_LOGIN_CHANNEL_SECRET;
    else process.env.LINE_LOGIN_CHANNEL_SECRET = ORIGINAL_ENV.LINE_LOGIN_CHANNEL_SECRET;
    if (ORIGINAL_ENV.LINE_LOGIN_REDIRECT_URI === undefined) delete process.env.LINE_LOGIN_REDIRECT_URI;
    else process.env.LINE_LOGIN_REDIRECT_URI = ORIGINAL_ENV.LINE_LOGIN_REDIRECT_URI;
    if (ORIGINAL_ENV.VUE_APP_APPURL === undefined) delete process.env.VUE_APP_APPURL;
    else process.env.VUE_APP_APPURL = ORIGINAL_ENV.VUE_APP_APPURL;
  });

  beforeEach(() => {
    process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED = 'true';
    process.env.EXTERNAL_LINE_LOGIN_ENABLED = 'true';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client';
    process.env.LINE_LOGIN_CHANNEL_ID = 'line-client-id';
    process.env.LINE_LOGIN_CHANNEL_SECRET = 'line-secret';
    process.env.LINE_LOGIN_REDIRECT_URI = 'http://localhost:3000/line/callback';
    app = buildApp();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('Googleログインでユーザと認証連携情報を作成する', async () => {
    const payload = {
      user_id: 'user-1',
      user_role: 'User',
      user_name: 'Google User',
      image_name: null,
      lang: 'ja',
      token: 'jwt-token',
      eye_friendly_mode: false,
      push_enabled: true,
      reply_push_enabled: true,
      replied_post_push_enabled: true,
    };
    const spy = jest.spyOn(authService, 'googleLogin').mockResolvedValue(payload);

    const res = await request(app)
      .post('/api/auth/google/login')
      .send({ id_token: 'dummy-token', lang: 'ja' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token', 'jwt-token');
    expect(spy).toHaveBeenCalledWith({ id_token: 'dummy-token', lang: 'ja' });
  });

  test('Googleログインの不正なトークンを拒否する', async () => {
    jest.spyOn(authService, 'googleLogin').mockRejectedValue(new AppError({ code: 'INVALID_PERMISSION' }));

    const res = await request(app)
      .post('/api/auth/google/login')
      .send({ id_token: 'bad-token-12345', lang: 'ja' });

    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_PERMISSION');
  });

  test('Googleログインが無効なら外部サービスを呼ぶ前に503を返す', async () => {
    process.env.EXTERNAL_GOOGLE_LOGIN_ENABLED = 'false';

    const res = await request(app)
      .post('/api/auth/google/login')
      .send({ id_token: 'dummy-token', lang: 'ja' });

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(res.body?.error?.details).toEqual({ feature: 'googleLogin' });
  });

  test('LINEの認証開始時にCookieを設定して認証先へ移動する', async () => {
    const res = await request(app).get('/api/auth/line/authorize?lang=ja&floor_id=floor-1&room_id=room-1');

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('client_id=');
    const cookies = res.headers['set-cookie'] || [];
    expect(cookies.some((c) => c.startsWith('line_oauth_state='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('line_oauth_nonce='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('line_lang='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('line_floor_id=floor-1'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('line_room_id=room-1'))).toBe(true);
  });

  test('LINEログインが無効なら外部サービスを呼ぶ前に503を返す', async () => {
    process.env.EXTERNAL_LINE_LOGIN_ENABLED = 'false';
    const providerSpy = jest.spyOn(authService, 'buildLineAuthorize');

    const res = await request(app).get('/api/auth/line/authorize?lang=ja');

    expect(res.status).toBe(503);
    expect(res.body?.error?.code).toBe('EXTERNAL_FEATURE_DISABLED');
    expect(res.body?.error?.details).toEqual({ feature: 'lineLogin' });
    expect(providerSpy).not.toHaveBeenCalled();
  });

  test('LINEの認証完了時にログイン用HTMLを返す', async () => {
    jest.spyOn(authService, 'exchangeLineToken').mockResolvedValue({
      id_token: 'line-id-token',
      access_token: 'line-access',
    });
    jest.spyOn(authService, 'verifyLineIdToken').mockResolvedValue({
      sub: 'line-sub',
      nonce: 'nonce-123',
      email: 'line@example.com',
    });
    jest.spyOn(authService, 'fetchLineDisplayName').mockResolvedValue('Line User');

    const cookies = [
      'line_oauth_state=state-123',
      'line_oauth_nonce=nonce-123',
      'line_lang=ja',
      'line_floor_id=floor-1',
      'line_room_id=room-1',
    ];
    const res = await request(app)
      .get('/api/auth/line/callback?code=code-123&state=state-123')
      .set('Cookie', cookies);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('line-login');
    expect(res.text).toContain('loginPath = "/login?floor_id=floor-1\\u0026room_id=room-1"');
  });
});
